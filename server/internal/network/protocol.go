package network

import (
	"encoding/binary"
	"errors"
	"math"
)

var (
	ErrInvalidMessage = errors.New("invalid message")
	ErrBufferTooSmall = errors.New("buffer too small")
)

// Protocol handles binary encoding/decoding
type Protocol struct{}

// NewProtocol creates a new protocol handler
func NewProtocol() *Protocol {
	return &Protocol{}
}

// DecodeInput decodes a client input message (6 bytes)
func (p *Protocol) DecodeInput(data []byte) (*InputMessage, error) {
	if len(data) < 6 {
		return nil, ErrBufferTooSmall
	}

	if data[0] != MsgTypeInput {
		return nil, ErrInvalidMessage
	}

	return &InputMessage{
		MsgType:  data[0],
		Sequence: data[1],
		Keys:     data[2],
		Steering: int8(data[3]),
		Throttle: int8(data[4]),
		Flags:    data[5],
	}, nil
}

// DecodeJoin decodes a join message
func (p *Protocol) DecodeJoin(data []byte) (*JoinMessage, error) {
	if len(data) < 3 {
		return nil, ErrBufferTooSmall
	}

	if data[0] != MsgTypeJoinRoom {
		return nil, ErrInvalidMessage
	}

	nameLen := int(data[1])
	if len(data) < 3+nameLen {
		return nil, ErrBufferTooSmall
	}

	return &JoinMessage{
		MsgType: data[0],
		Name:    string(data[2 : 2+nameLen]),
		Color:   data[2+nameLen],
	}, nil
}

// EncodeStateUpdate encodes a state update message
func (p *Protocol) EncodeStateUpdate(tick uint16, players []PlayerStateData) []byte {
	playerCount := len(players)
	if playerCount > 255 {
		playerCount = 255
	}

	// Header: 4 bytes + 16 bytes per player
	buf := make([]byte, 4+playerCount*16)

	buf[0] = MsgTypeStateUpdate
	binary.LittleEndian.PutUint16(buf[1:3], tick)
	buf[3] = uint8(playerCount)

	offset := 4
	for i := 0; i < playerCount; i++ {
		player := players[i]
		p.encodePlayerState(buf[offset:], player)
		offset += 16
	}

	return buf
}

// encodePlayerState encodes a single player (16 bytes)
func (p *Protocol) encodePlayerState(buf []byte, player PlayerStateData) {
	// ID: 2 bytes
	binary.LittleEndian.PutUint16(buf[0:2], player.ID)

	// X: 2 bytes (scaled by 10)
	binary.LittleEndian.PutUint16(buf[2:4], uint16(int16(player.X)))

	// Y: 4 bytes
	binary.LittleEndian.PutUint32(buf[4:8], uint32(player.Y))

	// Speed: 2 bytes (scaled by 10)
	binary.LittleEndian.PutUint16(buf[8:10], uint16(int16(player.Speed)))

	// Angle: 1 byte
	buf[10] = uint8(int8(player.Angle))

	// Rating: 3 bytes (24-bit unsigned)
	rating := player.Rating
	if rating > 0xFFFFFF {
		rating = 0xFFFFFF
	}
	buf[11] = uint8(rating & 0xFF)
	buf[12] = uint8((rating >> 8) & 0xFF)
	buf[13] = uint8((rating >> 16) & 0xFF)

	// Flags: 1 byte
	buf[14] = player.Flags

	// Color: 1 byte
	buf[15] = player.Color
}

// EncodePlayerJoin encodes a player join message
func (p *Protocol) EncodePlayerJoin(id uint16, name string, color uint8) []byte {
	nameBytes := []byte(name)
	if len(nameBytes) > 255 {
		nameBytes = nameBytes[:255]
	}

	buf := make([]byte, 5+len(nameBytes))
	buf[0] = MsgTypePlayerJoin
	binary.LittleEndian.PutUint16(buf[1:3], id)
	buf[3] = uint8(len(nameBytes))
	copy(buf[4:], nameBytes)
	buf[4+len(nameBytes)] = color

	return buf
}

// EncodePlayerLeave encodes a player leave message
func (p *Protocol) EncodePlayerLeave(id uint16) []byte {
	buf := make([]byte, 3)
	buf[0] = MsgTypePlayerLeave
	binary.LittleEndian.PutUint16(buf[1:3], id)
	return buf
}

// EncodePlayerDeath encodes a player death message
func (p *Protocol) EncodePlayerDeath(id uint16) []byte {
	buf := make([]byte, 3)
	buf[0] = MsgTypePlayerDeath
	binary.LittleEndian.PutUint16(buf[1:3], id)
	return buf
}

// EncodeRoomInfo encodes room info message
func (p *Protocol) EncodeRoomInfo(roomID string, playerCount, maxPlayers uint8, yourID uint16) []byte {
	roomIDBytes := []byte(roomID)
	if len(roomIDBytes) > 255 {
		roomIDBytes = roomIDBytes[:255]
	}

	buf := make([]byte, 6+len(roomIDBytes))
	buf[0] = MsgTypeRoomInfo
	buf[1] = uint8(len(roomIDBytes))
	copy(buf[2:], roomIDBytes)
	offset := 2 + len(roomIDBytes)
	buf[offset] = playerCount
	buf[offset+1] = maxPlayers
	binary.LittleEndian.PutUint16(buf[offset+2:], yourID)

	return buf
}

// EncodePong encodes a pong message
func (p *Protocol) EncodePong(timestamp uint64) []byte {
	buf := make([]byte, 9)
	buf[0] = MsgTypePong
	binary.LittleEndian.PutUint64(buf[1:9], timestamp)
	return buf
}

// EncodeError encodes an error message
func (p *Protocol) EncodeError(code uint8, message string) []byte {
	msgBytes := []byte(message)
	if len(msgBytes) > 255 {
		msgBytes = msgBytes[:255]
	}

	buf := make([]byte, 3+len(msgBytes))
	buf[0] = MsgTypeError
	buf[1] = code
	buf[2] = uint8(len(msgBytes))
	copy(buf[3:], msgBytes)

	return buf
}

// ConvertToPlayerStateData converts game state to network format
func ConvertToPlayerStateData(id uint16, x, y, speed, angle, rating float64, exploded bool, color uint8) PlayerStateData {
	flags := uint8(0)
	if exploded {
		flags |= FlagExploded
	}

	// Clamp angle to -127 to 127
	angleInt := int8(math.Max(-127, math.Min(127, angle*127/25)))

	return PlayerStateData{
		ID:     id,
		X:      int16(x * 10),
		Y:      int32(y),
		Speed:  int16(speed * 10),
		Angle:  angleInt,
		Rating: uint32(rating),
		Flags:  flags,
		Color:  color,
	}
}

// DecodeSteeringThrottle converts int8 values to float64
func DecodeSteeringThrottle(steering, throttle int8) (float64, float64) {
	return float64(steering) / 127.0, float64(throttle) / 127.0
}
