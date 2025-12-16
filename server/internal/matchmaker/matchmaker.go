package matchmaker

import (
	"crypto/rand"
	"encoding/hex"
	"sync"

	"github.com/race/server/config"
	"github.com/race/server/internal/game"
)

// Matchmaker handles player matchmaking and room assignment
type Matchmaker struct {
	mu    sync.RWMutex
	rooms map[string]*game.Room
}

// NewMatchmaker creates a new matchmaker
func NewMatchmaker() *Matchmaker {
	return &Matchmaker{
		rooms: make(map[string]*game.Room),
	}
}

// FindRoom finds an available room or creates a new one
func (m *Matchmaker) FindRoom() *game.Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Find existing room with space
	for _, room := range m.rooms {
		if room.GetPlayerCount() < config.MaxPlayersPerRoom {
			return room
		}
	}

	// Create new room
	if len(m.rooms) >= config.MaxRoomsPerServer {
		return nil // Server full
	}

	roomID := generateRoomID()
	room := game.NewRoom(roomID)
	m.rooms[roomID] = room
	room.Start()

	return room
}

// GetRoom gets a room by ID
func (m *Matchmaker) GetRoom(roomID string) *game.Room {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.rooms[roomID]
}

// GetOrCreateRoom gets or creates a specific room
func (m *Matchmaker) GetOrCreateRoom(roomID string) *game.Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, ok := m.rooms[roomID]; ok {
		return room
	}

	if len(m.rooms) >= config.MaxRoomsPerServer {
		return nil
	}

	room := game.NewRoom(roomID)
	m.rooms[roomID] = room
	room.Start()

	return room
}

// RemoveRoom removes a room
func (m *Matchmaker) RemoveRoom(roomID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, ok := m.rooms[roomID]; ok {
		room.Stop()
		delete(m.rooms, roomID)
	}
}

// CleanupEmptyRooms removes all empty rooms
func (m *Matchmaker) CleanupEmptyRooms() int {
	m.mu.Lock()
	defer m.mu.Unlock()

	removed := 0
	for id, room := range m.rooms {
		if room.IsEmpty() {
			room.Stop()
			delete(m.rooms, id)
			removed++
		}
	}

	return removed
}

// GetStats returns matchmaker statistics
func (m *Matchmaker) GetStats() MatchmakerStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := MatchmakerStats{
		TotalRooms: len(m.rooms),
		Rooms:      make([]RoomStats, 0, len(m.rooms)),
	}

	for id, room := range m.rooms {
		playerCount := room.GetPlayerCount()
		stats.TotalPlayers += playerCount
		stats.Rooms = append(stats.Rooms, RoomStats{
			ID:          id,
			PlayerCount: playerCount,
			MaxPlayers:  config.MaxPlayersPerRoom,
		})
	}

	return stats
}

// MatchmakerStats contains matchmaker statistics
type MatchmakerStats struct {
	TotalRooms   int
	TotalPlayers int
	Rooms        []RoomStats
}

// RoomStats contains room statistics
type RoomStats struct {
	ID          string
	PlayerCount int
	MaxPlayers  int
}

// generateRoomID generates a random room ID
func generateRoomID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
