// Package game implements the core game logic including physics, players, and rooms.
package game

import (
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/race/server/config"
	"github.com/race/server/internal/network"
)

// Room represents a game room where players race together.
//
// Each room has its own:
// - Physics simulation running at 60Hz
// - Network broadcast running at 20Hz
// - Anti-cheat validation
// - Spatial partitioning for collision detection
//
// Thread Safety:
// Room uses a RWMutex to protect player map access. The physics loop
// acquires a read lock to iterate players, while AddPlayer/RemovePlayer
// acquire write locks.
//
// IMPORTANT: Methods ending in "Unlocked" expect the caller to already
// hold the appropriate lock. This prevents deadlocks when calling
// broadcast from within locked sections.
type Room struct {
	mu sync.RWMutex // Protects players map

	ID           string             // Unique room identifier
	players      map[uint16]*Player // Active players in this room
	nextPlayerID uint16             // Auto-incrementing player ID

	physics     *Physics      // Physics simulation engine
	antiCheat   *AntiCheat    // Anti-cheat validation system
	spatialGrid *SpatialGrid  // Spatial partitioning for collision detection
	protocol    *network.Protocol // Binary protocol encoder

	tickCount uint64      // Physics tick counter
	running   atomic.Bool // True if game loop is running
	stopChan  chan struct{} // Signal to stop game loop

	// Callbacks
	onPlayerKick func(player *Player, reason string)
}

// NewRoom creates a new game room with the given ID.
// The room is not started automatically - call Start() to begin the game loop.
func NewRoom(id string) *Room {
	return &Room{
		ID:           id,
		players:      make(map[uint16]*Player),
		nextPlayerID: 1, // Player IDs start at 1 (0 could be used as "no player")
		physics:      NewPhysics(),
		antiCheat:    NewAntiCheat(),
		spatialGrid:  NewSpatialGrid(100), // 100 unit cells for spatial partitioning
		protocol:     network.NewProtocol(),
		stopChan:     make(chan struct{}),
	}
}

// Start begins the room's game loop in a separate goroutine.
// Safe to call multiple times - subsequent calls are no-ops.
func (r *Room) Start() {
	// Atomic swap returns previous value - if it was true, room is already running
	if r.running.Swap(true) {
		return
	}

	go r.gameLoop()
	log.Printf("Room %s started", r.ID)
}

// Stop stops the room's game loop.
// Safe to call multiple times - subsequent calls are no-ops.
func (r *Room) Stop() {
	// Atomic swap returns previous value - if it was false, room is already stopped
	if !r.running.Swap(false) {
		return
	}

	close(r.stopChan)
	log.Printf("Room %s stopped", r.ID)
}

// AddPlayer adds a new player to the room.
// Returns an error if the room is full.
//
// This method:
// 1. Assigns a unique player ID
// 2. Sets initial position at road center
// 3. Notifies other players of the new player
// 4. Sends room info to the new player
func (r *Room) AddPlayer(sessionID, name string, color uint8, conn PlayerConnection) (*Player, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check room capacity
	if len(r.players) >= config.MaxPlayersPerRoom {
		return nil, ErrRoomFull
	}

	// Assign unique player ID
	id := r.nextPlayerID
	r.nextPlayerID++

	// Create player with initial state
	player := NewPlayer(id, sessionID, name, color, conn)

	// Position player at road center (Y=0 is the starting point)
	player.X = config.GetRoadCurve(0)
	player.Y = 0
	player.SaveValidPosition() // Save for anti-cheat baseline

	r.players[id] = player

	// Notify existing players about the new player
	// Using unlocked version because we already hold the lock
	joinMsg := r.protocol.EncodePlayerJoin(id, name, color)
	r.broadcastExceptUnlocked(joinMsg, id)

	// Send room info to the new player (room ID, player count, their assigned ID)
	roomInfo := r.protocol.EncodeRoomInfo(r.ID, uint8(len(r.players)), config.MaxPlayersPerRoom, id)
	player.Connection.Send(roomInfo)

	log.Printf("Player %s (ID: %d) joined room %s", name, id, r.ID)

	return player, nil
}

// RemovePlayer removes a player from the room and notifies others.
// Safe to call with non-existent player IDs.
func (r *Room) RemovePlayer(playerID uint16) {
	// Lock only for map modification
	r.mu.Lock()
	player, exists := r.players[playerID]
	if exists {
		delete(r.players, playerID)
	}
	r.mu.Unlock()

	if exists {
		// Close connection (safe to do outside lock)
		player.Connection.Close()

		// Notify remaining players
		leaveMsg := r.protocol.EncodePlayerLeave(playerID)
		r.broadcast(leaveMsg)

		log.Printf("Player %s (ID: %d) left room %s", player.Name, playerID, r.ID)
	}
}

// HandleInput processes player control input.
// Input is validated by anti-cheat before being applied to the player state.
func (r *Room) HandleInput(playerID uint16, input *network.InputMessage) {
	// Get player reference
	r.mu.RLock()
	player, exists := r.players[playerID]
	r.mu.RUnlock()

	if !exists {
		return
	}

	// Anti-cheat: validate input rate (detect input flooding)
	result := r.antiCheat.ValidateInputRate(player)
	if result == ValidationIgnoreInput {
		return // Too many inputs this tick - ignore
	}

	// Decode steering and throttle from compressed format
	steering, throttle := network.DecodeSteeringThrottle(input.Steering, input.Throttle)

	// Apply input to player
	gameInput := PlayerInput{
		Sequence: input.Sequence,
		Keys:     input.Keys,
		Steering: steering,
		Throttle: throttle,
		Flags:    input.Flags,
	}

	player.ApplyInput(gameInput)
}

// GetPlayerCount returns the current number of players in the room.
func (r *Room) GetPlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.players)
}

// IsEmpty returns true if the room has no players.
func (r *Room) IsEmpty() bool {
	return r.GetPlayerCount() == 0
}

// gameLoop is the main game loop running in its own goroutine.
// It handles physics updates at 60Hz and network broadcasts at 20Hz.
func (r *Room) gameLoop() {
	// Physics runs at 60Hz (16.67ms per tick)
	physicsTicker := time.NewTicker(time.Second / time.Duration(config.PhysicsTickRate))
	// Network broadcasts at 20Hz (50ms per broadcast)
	broadcastTicker := time.NewTicker(time.Second / time.Duration(config.NetworkBroadcastRate))
	defer physicsTicker.Stop()
	defer broadcastTicker.Stop()

	lastPhysicsTime := time.Now()

	for {
		select {
		case <-r.stopChan:
			// Room is stopping
			return

		case now := <-physicsTicker.C:
			// Calculate delta time since last physics update
			dt := now.Sub(lastPhysicsTime).Seconds()
			lastPhysicsTime = now

			// Cap delta time to prevent physics explosions after pauses
			if dt > 0.1 {
				dt = 0.1
			}

			r.updatePhysics(dt)
			atomic.AddUint64(&r.tickCount, 1)

		case <-broadcastTicker.C:
			// Send state to all clients
			r.broadcastState()
		}
	}
}

// updatePhysics runs one physics tick for all players.
// This includes movement, collision detection, and anti-cheat validation.
func (r *Room) updatePhysics(dt float64) {
	// Get snapshot of players (minimize lock time)
	r.mu.RLock()
	players := make([]*Player, 0, len(r.players))
	for _, p := range r.players {
		players = append(players, p)
	}
	r.mu.RUnlock()

	// Reset input counts for anti-cheat rate limiting
	for _, p := range players {
		p.ResetInputCount()
	}

	// Update physics for each player (movement, road boundaries, etc.)
	for _, p := range players {
		r.physics.UpdatePlayer(p, dt)
	}

	// Update spatial grid for efficient collision detection
	r.spatialGrid.Update(players)

	// Check collisions between nearby players
	pairs := r.spatialGrid.GetPotentialCollisions()
	for _, pair := range pairs {
		r.physics.CheckCollision(pair[0], pair[1], dt)
	}

	// Anti-cheat validation for all players
	for _, p := range players {
		// Check for speed hacks
		result := r.antiCheat.ValidatePlayerMovement(p, dt)
		if result == ValidationKick {
			r.kickPlayer(p, "Speed hack detected")
			continue
		}
		r.antiCheat.ApplyValidationResult(p, result)

		// Check for position hacks (teleporting)
		result = r.antiCheat.ValidatePosition(p)
		r.antiCheat.ApplyValidationResult(p, result)
	}
}

// broadcastState sends the current game state to all players.
// State includes position, speed, angle, and other player data.
func (r *Room) broadcastState() {
	// Get snapshot of players
	r.mu.RLock()
	players := make([]*Player, 0, len(r.players))
	for _, p := range r.players {
		players = append(players, p)
	}
	r.mu.RUnlock()

	if len(players) == 0 {
		return
	}

	// Build state data array
	stateData := make([]network.PlayerStateData, len(players))
	for i, p := range players {
		state := p.GetState()
		stateData[i] = network.ConvertToPlayerStateData(
			state.ID,
			state.X,
			state.Y,
			state.Speed,
			state.Angle,
			state.Rating,
			state.Exploded,
			state.Color,
		)
	}

	// Encode and broadcast
	tick := uint16(atomic.LoadUint64(&r.tickCount) & 0xFFFF)
	msg := r.protocol.EncodeStateUpdate(tick, stateData)

	r.broadcast(msg)
}

// broadcast sends a message to all players in the room.
func (r *Room) broadcast(data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	r.broadcastUnlocked(data)
}

// broadcastUnlocked sends a message to all players.
// IMPORTANT: Caller must hold the room lock (read or write).
func (r *Room) broadcastUnlocked(data []byte) {
	for _, p := range r.players {
		if err := p.Connection.Send(data); err != nil {
			// Log but don't disconnect - connection cleanup handles that
			log.Printf("Failed to send to player %d: %v", p.ID, err)
		}
	}
}

// broadcastExcept sends a message to all players except one.
func (r *Room) broadcastExcept(data []byte, exceptID uint16) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	r.broadcastExceptUnlocked(data, exceptID)
}

// broadcastExceptUnlocked sends a message to all players except one.
// IMPORTANT: Caller must hold the room lock (read or write).
func (r *Room) broadcastExceptUnlocked(data []byte, exceptID uint16) {
	for id, p := range r.players {
		if id == exceptID {
			continue
		}
		if err := p.Connection.Send(data); err != nil {
			log.Printf("Failed to send to player %d: %v", p.ID, err)
		}
	}
}

// kickPlayer removes a player from the room due to anti-cheat violation.
func (r *Room) kickPlayer(p *Player, reason string) {
	log.Printf("Kicking player %s (ID: %d): %s", p.Name, p.ID, reason)

	// Send error message to player
	errMsg := r.protocol.EncodeError(network.ErrorCodeKicked, reason)
	p.Connection.Send(errMsg)

	// Remove from room
	r.RemovePlayer(p.ID)

	// Trigger callback if set
	if r.onPlayerKick != nil {
		r.onPlayerKick(p, reason)
	}
}

// SetOnPlayerKick sets a callback function called when a player is kicked.
func (r *Room) SetOnPlayerKick(callback func(player *Player, reason string)) {
	r.onPlayerKick = callback
}

// Error definitions
var (
	ErrRoomFull = &RoomError{message: "room is full"}
)

// RoomError represents an error related to room operations.
type RoomError struct {
	message string
}

func (e *RoomError) Error() string {
	return e.message
}
