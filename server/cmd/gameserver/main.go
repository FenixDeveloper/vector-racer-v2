// Package main implements the Vector Racer multiplayer game server.
//
// Architecture Overview:
// - Uses WebSocket for real-time bidirectional communication with clients
// - Each game room runs its own physics loop at 60Hz
// - State updates are broadcast to clients at 20Hz
// - Anti-cheat system validates player movements server-side
//
// Connection Flow:
// 1. Client connects via WebSocket to /ws endpoint
// 2. Client sends JoinRoom message with player name and color
// 3. Server assigns player to a room (creates new one if needed)
// 4. Server sends RoomInfo back to client with assigned player ID
// 5. Client sends Input messages, server broadcasts StateUpdate messages
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/race/server/config"
	"github.com/race/server/internal/game"
	"github.com/race/server/internal/matchmaker"
	"github.com/race/server/internal/network"
)

// GameServer is the main server instance that manages all connections and rooms.
// It handles WebSocket upgrades and routes messages to appropriate handlers.
type GameServer struct {
	config      *config.ServerConfig   // Server configuration (host, port, etc.)
	matchmaker  *matchmaker.Matchmaker // Manages game rooms and player assignment
	protocol    *network.Protocol      // Binary protocol encoder/decoder
	upgrader    websocket.Upgrader     // HTTP to WebSocket upgrader
	connections map[*ClientConnection]bool // Active client connections
}

// ClientConnection represents a single connected client.
// Each client has its own goroutines for reading and writing messages.
type ClientConnection struct {
	ws       *websocket.Conn // The underlying WebSocket connection
	server   *GameServer     // Reference to parent server
	player   *game.Player    // Player instance (nil until joined a room)
	room     *game.Room      // Room instance (nil until joined a room)
	sendChan chan []byte     // Buffered channel for outgoing messages
	done     chan struct{}   // Signal channel for graceful shutdown
}

func main() {
	// Configure logging to include file and line numbers for debugging
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Load configuration from environment variables
	cfg := loadConfig()

	// Create and start the game server
	server := NewGameServer(cfg)

	// Print startup banner with configuration
	log.Printf("=================================")
	log.Printf("  Vector Racer Game Server")
	log.Printf("=================================")
	log.Printf("  Host: %s", cfg.Host)
	log.Printf("  Port: %d", cfg.Port)
	log.Printf("  Physics Rate: %d Hz", config.PhysicsTickRate)
	log.Printf("  Broadcast Rate: %d Hz", config.NetworkBroadcastRate)
	log.Printf("  Max Players/Room: %d", config.MaxPlayersPerRoom)
	log.Printf("  Max Rooms: %d", config.MaxRoomsPerServer)
	log.Printf("=================================")

	// Start the server (blocks until error or shutdown)
	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// loadConfig reads configuration from environment variables.
// Falls back to default values if environment variables are not set.
func loadConfig() *config.ServerConfig {
	cfg := config.DefaultServerConfig()

	// Override defaults with environment variables if set
	if host := os.Getenv("HOST"); host != "" {
		cfg.Host = host
	}

	if port := os.Getenv("PORT"); port != "" {
		if p, err := strconv.Atoi(port); err == nil {
			cfg.Port = p
		}
	}

	// CORS can be disabled for production behind a reverse proxy
	if cors := os.Getenv("ENABLE_CORS"); cors == "false" {
		cfg.EnableCORS = false
	}

	return cfg
}

// NewGameServer creates and initializes a new game server instance.
func NewGameServer(cfg *config.ServerConfig) *GameServer {
	return &GameServer{
		config:     cfg,
		matchmaker: matchmaker.NewMatchmaker(),
		protocol:   network.NewProtocol(),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// CheckOrigin controls CORS for WebSocket connections.
			// In production, consider implementing a whitelist of allowed origins.
			CheckOrigin: func(r *http.Request) bool {
				return cfg.EnableCORS
			},
		},
		connections: make(map[*ClientConnection]bool),
	}
}

// Start begins listening for connections and runs background tasks.
// This method blocks until the server is shut down.
func (s *GameServer) Start() error {
	// Background task: Clean up empty rooms every 30 seconds
	// This prevents memory leaks from abandoned rooms
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			removed := s.matchmaker.CleanupEmptyRooms()
			if removed > 0 {
				log.Printf("Cleaned up %d empty rooms", removed)
			}
		}
	}()

	// Background task: Log server statistics every 5 minutes (only when active)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			stats := s.matchmaker.GetStats()
			if stats.TotalRooms > 0 || stats.TotalPlayers > 0 {
				log.Printf("Stats: %d rooms, %d total players", stats.TotalRooms, stats.TotalPlayers)
			}
		}
	}()

	// Register HTTP endpoints
	http.HandleFunc("/ws", s.handleWebSocket)       // WebSocket game connections
	http.HandleFunc("/health", s.handleHealth)      // Health check for load balancers
	http.HandleFunc("/stats", s.handleStats)        // Server statistics endpoint

	// Start HTTP server
	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	log.Printf("Server listening on %s", addr)

	return http.ListenAndServe(addr, nil)
}

// handleHealth responds to health check requests.
// Used by load balancers and container orchestrators (Docker, Kubernetes).
func (s *GameServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// handleStats returns current server statistics as JSON.
// Useful for monitoring dashboards.
func (s *GameServer) handleStats(w http.ResponseWriter, r *http.Request) {
	stats := s.matchmaker.GetStats()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"rooms":%d,"players":%d}`, stats.TotalRooms, stats.TotalPlayers)
}

// handleWebSocket upgrades HTTP connections to WebSocket and manages client lifecycle.
// Each client gets two goroutines: one for reading, one for writing.
func (s *GameServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to WebSocket
	ws, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Create new client connection with buffered send channel
	// Buffer size of 256 prevents blocking on slow clients
	conn := &ClientConnection{
		ws:       ws,
		server:   s,
		sendChan: make(chan []byte, 256),
		done:     make(chan struct{}),
	}

	// Track connection (for future features like broadcasting to all)
	s.connections[conn] = true

	log.Printf("New connection from %s", ws.RemoteAddr())

	// Start read and write goroutines
	// These run until the connection is closed
	go conn.writePump()
	go conn.readPump()
}

// Send queues data to be sent to the client.
// Non-blocking: drops message if buffer is full (prevents slow clients from blocking server).
func (c *ClientConnection) Send(data []byte) error {
	select {
	case c.sendChan <- data:
		return nil
	case <-c.done:
		return fmt.Errorf("connection closed")
	default:
		// Buffer full - drop message to prevent blocking
		// This is acceptable for game state updates (client will get next update)
		return nil
	}
}

// Close gracefully shuts down the connection.
// Safe to call multiple times.
func (c *ClientConnection) Close() error {
	select {
	case <-c.done:
		// Already closed
		return nil
	default:
		close(c.done)
	}
	return c.ws.Close()
}

// RemoteAddr returns the client's IP address for logging.
func (c *ClientConnection) RemoteAddr() string {
	return c.ws.RemoteAddr().String()
}

// writePump handles sending messages to the client.
// Runs in its own goroutine. Also sends periodic pings to detect dead connections.
func (c *ClientConnection) writePump() {
	// Ping every 30 seconds to keep connection alive and detect disconnects
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	defer c.cleanup()

	for {
		select {
		case <-c.done:
			return

		case message := <-c.sendChan:
			// Set write deadline to prevent hanging on slow/dead connections
			c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.ws.WriteMessage(websocket.BinaryMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			// Send WebSocket ping frame
			c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readPump handles receiving messages from the client.
// Runs in its own goroutine. Messages are dispatched to appropriate handlers.
func (c *ClientConnection) readPump() {
	defer c.cleanup()

	// Limit message size to prevent memory exhaustion attacks
	c.ws.SetReadLimit(512)
	// Set initial read deadline (extended on each pong)
	c.ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	// Handle pong messages by extending the read deadline
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Main read loop
	for {
		select {
		case <-c.done:
			return
		default:
		}

		_, message, err := c.ws.ReadMessage()
		if err != nil {
			// Only log unexpected errors (not normal disconnects)
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error: %v", err)
			}
			return
		}

		c.handleMessage(message)
	}
}

// handleMessage dispatches incoming messages to appropriate handlers based on message type.
// Message type is always the first byte of the binary message.
func (c *ClientConnection) handleMessage(data []byte) {
	if len(data) == 0 {
		return
	}

	// First byte is always the message type
	msgType := data[0]

	switch msgType {
	case network.MsgTypeJoinRoom:
		c.handleJoin(data)

	case network.MsgTypeInput:
		c.handleInput(data)

	case network.MsgTypePing:
		c.handlePing(data)

	case network.MsgTypeLeaveRoom:
		c.handleLeave()
	}
}

// handleJoin processes a player's request to join a game room.
// Validates the player name, finds/creates a room, and sends room info back.
func (c *ClientConnection) handleJoin(data []byte) {
	// Decode the join message
	msg, err := c.server.protocol.DecodeJoin(data)
	if err != nil {
		log.Printf("Invalid join message from %s: %v", c.RemoteAddr(), err)
		return
	}

	// Validate player name (basic sanitization)
	name := strings.TrimSpace(msg.Name)
	if name == "" {
		name = "Player"
	}
	// Limit name length to prevent abuse
	if len(name) > 20 {
		name = name[:20]
	}

	// Find an available room or create a new one
	room := c.server.matchmaker.FindRoom()
	if room == nil {
		// Server is at capacity
		errMsg := c.server.protocol.EncodeError(network.ErrorCodeRoomFull, "Server full")
		c.Send(errMsg)
		return
	}

	// Add player to the room
	player, err := room.AddPlayer(c.RemoteAddr(), name, msg.Color, c)
	if err != nil {
		errMsg := c.server.protocol.EncodeError(network.ErrorCodeRoomFull, err.Error())
		c.Send(errMsg)
		return
	}

	// Store references for this connection
	c.player = player
	c.room = room

	log.Printf("Player '%s' (ID: %d) joined room %s", name, player.ID, room.ID)
}

// handleInput processes player control input (steering, throttle, keys).
// Input is validated by the room's anti-cheat system before being applied.
func (c *ClientConnection) handleInput(data []byte) {
	// Ignore input from clients not in a room
	if c.player == nil || c.room == nil {
		return
	}

	// Decode input message
	msg, err := c.server.protocol.DecodeInput(data)
	if err != nil {
		return
	}

	// Forward to room for processing (includes anti-cheat validation)
	c.room.HandleInput(c.player.ID, msg)
}

// handlePing responds to client ping with a pong containing the same timestamp.
// Used by clients to measure round-trip latency.
func (c *ClientConnection) handlePing(data []byte) {
	// Ping message format: [type:1][timestamp:8]
	if len(data) >= 9 {
		// Extract timestamp (little-endian uint64)
		var timestamp uint64
		for i := 0; i < 8; i++ {
			timestamp |= uint64(data[1+i]) << (i * 8)
		}
		// Send pong with same timestamp
		pong := c.server.protocol.EncodePong(timestamp)
		c.Send(pong)
	}
}

// handleLeave processes a player's request to leave the current room.
func (c *ClientConnection) handleLeave() {
	if c.room != nil && c.player != nil {
		c.room.RemovePlayer(c.player.ID)
		c.player = nil
		c.room = nil
	}
}

// cleanup removes the connection from tracking and cleans up resources.
// Called when connection is closed (either gracefully or due to error).
func (c *ClientConnection) cleanup() {
	// Remove from server's connection map
	delete(c.server.connections, c)

	// Remove player from room if they were in one
	if c.room != nil && c.player != nil {
		c.room.RemovePlayer(c.player.ID)
	}

	c.Close()
	log.Printf("Connection closed: %s", c.RemoteAddr())
}
