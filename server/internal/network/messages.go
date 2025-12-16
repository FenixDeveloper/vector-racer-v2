package network

// Message types
const (
	// Client -> Server
	MsgTypeInput      uint8 = 0x01
	MsgTypeJoinRoom   uint8 = 0x02
	MsgTypeLeaveRoom  uint8 = 0x03
	MsgTypePing       uint8 = 0x04

	// Server -> Client
	MsgTypeStateUpdate uint8 = 0x10
	MsgTypePlayerJoin  uint8 = 0x11
	MsgTypePlayerLeave uint8 = 0x12
	MsgTypePlayerDeath uint8 = 0x13
	MsgTypeRoomInfo    uint8 = 0x14
	MsgTypePong        uint8 = 0x15
	MsgTypeError       uint8 = 0xFF
)

// Player flags
const (
	FlagExploded uint8 = 1 << 0
	FlagRespawning uint8 = 1 << 1
)

// Key flags (bit field)
const (
	KeyUp    uint8 = 1 << 0
	KeyDown  uint8 = 1 << 1
	KeyLeft  uint8 = 1 << 2
	KeyRight uint8 = 1 << 3
)

// Color palette - maps color index to hex
var ColorPalette = []uint32{
	0xef4444, // Red
	0x3b82f6, // Blue
	0x22c55e, // Green
	0xeab308, // Yellow
	0xf472b6, // Pink
	0x8b5cf6, // Purple
	0x06b6d4, // Cyan
	0xf97316, // Orange
	0x84cc16, // Lime
	0xec4899, // Fuchsia
	0x14b8a6, // Teal
	0xa855f7, // Violet
	0xfbbf24, // Amber
	0x6366f1, // Indigo
	0x10b981, // Emerald
	0xf43f5e, // Rose
}

// InputMessage from client (6 bytes)
type InputMessage struct {
	MsgType  uint8
	Sequence uint8
	Keys     uint8
	Steering int8  // -127 to 127 -> -1.0 to 1.0
	Throttle int8  // -127 to 127 -> -1.0 to 1.0
	Flags    uint8
}

// JoinMessage from client
type JoinMessage struct {
	MsgType uint8
	Name    string
	Color   uint8
}

// StateUpdateMessage to client
type StateUpdateMessage struct {
	MsgType     uint8
	Tick        uint16
	PlayerCount uint8
	Players     []PlayerStateData
}

// PlayerStateData in state update (16 bytes per player)
type PlayerStateData struct {
	ID     uint16
	X      int16  // Scaled by 10
	Y      int32
	Speed  int16  // Scaled by 10
	Angle  int8   // Scaled to -127 to 127
	Rating uint32 // 24-bit, stored in lower 3 bytes
	Flags  uint8
	Color  uint8
}

// PlayerJoinMessage to client
type PlayerJoinMessage struct {
	MsgType uint8
	ID      uint16
	Name    string
	Color   uint8
}

// PlayerLeaveMessage to client
type PlayerLeaveMessage struct {
	MsgType uint8
	ID      uint16
}

// RoomInfoMessage to client
type RoomInfoMessage struct {
	MsgType      uint8
	RoomID       string
	PlayerCount  uint8
	MaxPlayers   uint8
	YourPlayerID uint16
}

// PongMessage to client
type PongMessage struct {
	MsgType   uint8
	Timestamp uint64
}

// ErrorMessage to client
type ErrorMessage struct {
	MsgType uint8
	Code    uint8
	Message string
}

// Error codes
const (
	ErrorCodeInvalidMessage uint8 = 1
	ErrorCodeRoomFull       uint8 = 2
	ErrorCodeKicked         uint8 = 3
	ErrorCodeServerError    uint8 = 4
)
