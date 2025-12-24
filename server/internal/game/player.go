package game

import (
	"sync"
	"time"

	"github.com/race/server/config"
)

// PlayerState represents the current state of a player
type PlayerState struct {
	ID       uint16
	Name     string
	Color    uint8 // Color index (0-15)
	X        float64
	Y        float64
	Speed    float64
	Angle    float64
	Rating   float64
	Exploded bool
}

// PlayerInput represents input from client
type PlayerInput struct {
	Sequence uint8
	Keys     uint8   // Bit flags: Up=1, Down=2, Left=4, Right=8
	Steering float64 // -1.0 to 1.0
	Throttle float64 // -1.0 to 1.0
	Flags    uint8
}

// Player represents a connected player
type Player struct {
	mu sync.RWMutex

	// Identity
	ID         uint16
	SessionID  string
	Name       string
	Color      uint8
	Connection PlayerConnection

	// State
	X        float64
	Y        float64
	Speed    float64
	Angle    float64
	Rating   float64
	Exploded bool

	// Anti-cheat
	LastValidX   float64
	LastValidY   float64
	Violations   int
	InputsThisTick int

	// Input
	CurrentInput PlayerInput
	InputBuffer  []PlayerInput

	// Timing
	LastInputTime time.Time
	ConnectedAt   time.Time
	LastSyncTime  time.Time
	ExplodedAt    time.Time // When player exploded (for auto-respawn)
}

// PlayerConnection interface for network abstraction
type PlayerConnection interface {
	Send(data []byte) error
	Close() error
	RemoteAddr() string
}

// NewPlayer creates a new player
func NewPlayer(id uint16, sessionID, name string, color uint8, conn PlayerConnection) *Player {
	now := time.Now()
	return &Player{
		ID:          id,
		SessionID:   sessionID,
		Name:        name,
		Color:       color,
		Connection:  conn,
		X:           0,
		Y:           0,
		Speed:       0,
		Angle:       0,
		Rating:      0,
		Exploded:    false,
		ConnectedAt: now,
		LastInputTime: now,
		InputBuffer: make([]PlayerInput, 0, 8),
	}
}

// GetState returns a snapshot of player state (thread-safe)
func (p *Player) GetState() PlayerState {
	p.mu.RLock()
	defer p.mu.RUnlock()

	return PlayerState{
		ID:       p.ID,
		Name:     p.Name,
		Color:    p.Color,
		X:        p.X,
		Y:        p.Y,
		Speed:    p.Speed,
		Angle:    p.Angle,
		Rating:   p.Rating,
		Exploded: p.Exploded,
	}
}

// ApplyInput applies player input (thread-safe)
func (p *Player) ApplyInput(input PlayerInput) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.CurrentInput = input
	p.LastInputTime = time.Now()
}

// QueueInput adds input to the buffer
func (p *Player) QueueInput(input PlayerInput) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.InputBuffer) < 8 {
		p.InputBuffer = append(p.InputBuffer, input)
	}
}

// PopInput gets and removes the next input from buffer
func (p *Player) PopInput() (PlayerInput, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.InputBuffer) == 0 {
		return p.CurrentInput, false
	}

	input := p.InputBuffer[0]
	p.InputBuffer = p.InputBuffer[1:]
	p.CurrentInput = input
	return input, true
}

// Respawn respawns the player at road center, moved forward to safe position
func (p *Player) Respawn() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.Exploded = false
	p.Speed = 0
	p.Angle = 0
	// Move forward to avoid dying at same dangerous curve
	p.Y += 200
	p.X = config.GetRoadCurve(p.Y)
}

// ShouldRespawn checks if player should auto-respawn (after delay)
func (p *Player) ShouldRespawn() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if !p.Exploded {
		return false
	}
	return time.Since(p.ExplodedAt) >= config.RespawnDelay
}

// Explode triggers player explosion
func (p *Player) Explode() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.Exploded {
		return
	}

	p.Exploded = true
	p.Rating = 0
	p.ExplodedAt = time.Now()
}

// UpdateRating updates player rating based on speed
func (p *Player) UpdateRating(dt float64) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.Speed > 0 && !p.Exploded {
		speedFactor := p.Speed / 100.0
		p.Rating += (speedFactor * speedFactor) * dt * 0.5
	}
}

// SaveValidPosition stores the current position as the last valid one
func (p *Player) SaveValidPosition() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.LastValidX = p.X
	p.LastValidY = p.Y
	p.Violations = 0
}

// RubberbandToValid resets position to last valid position
func (p *Player) RubberbandToValid() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.X = p.LastValidX
	p.Y = p.LastValidY
	p.Violations++
}

// IncrementViolations adds a violation
func (p *Player) IncrementViolations() int {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.Violations++
	return p.Violations
}

// ResetInputCount resets the input counter for this tick
func (p *Player) ResetInputCount() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.InputsThisTick = 0
}

// IncrementInputCount increments and returns the input count
func (p *Player) IncrementInputCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.InputsThisTick++
	return p.InputsThisTick
}
