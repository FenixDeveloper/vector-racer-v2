package config

import "math"

// Game constants - must match client exactly for deterministic physics
const (
	// Dimensions
	CarWidth     = 20
	CarHeight    = 34
	RoadWidth    = 400
	CameraYOffset = 0.7

	// Network
	SyncRateMS         = 80  // Client sync rate
	PhysicsTickRate    = 60  // Hz
	NetworkBroadcastRate = 20 // Hz
	PhysicsTickInterval = 1.0 / float64(PhysicsTickRate)
	BroadcastInterval   = 1.0 / float64(NetworkBroadcastRate)

	// Physics / Gameplay
	MaxSpeed        = 1400.0
	Acceleration    = 900.0
	Braking         = 2000.0
	FrictionRoad    = 250.0
	FrictionOffroad = 5000.0
	InertiaDampening = 0.3
	MinTurnAuthority = 0.5
	ExplosionTolerance = 0.35

	// Steering
	TurnSpeed = 550.0

	// Collision / Combat
	PushForce           = 2.0
	SpeedDiffMultiplier = 3.5
	SpeedDiffThreshold  = 200.0
	CollisionRadius     = CarWidth * 1.4

	// Road Generation
	RoadScale     = 0.001
	RoadAmplitude = 600.0

	// Room settings
	MaxPlayersPerRoom = 100
	MaxRoomsPerServer = 50

	// Anti-cheat
	MaxViolations      = 5
	SpeedTolerance     = 1.1 // 10% tolerance
	MaxInputsPerTick   = 3
)

// Server configuration
type ServerConfig struct {
	Host       string
	Port       int
	RedisURL   string
	EnableCORS bool
}

// DefaultServerConfig returns default server configuration
func DefaultServerConfig() *ServerConfig {
	return &ServerConfig{
		Host:       "0.0.0.0",
		Port:       8080,
		RedisURL:   "localhost:6379",
		EnableCORS: true,
	}
}

// GetRoadCurve calculates the road center X position for a given Y coordinate
// This MUST match the client implementation exactly
func GetRoadCurve(worldY float64) float64 {
	baseCurve := math.Sin(worldY*RoadScale) * RoadAmplitude
	sharpTurn := math.Pow(math.Sin(worldY*RoadScale*1.5), 3) * (RoadAmplitude * 0.5)
	return baseCurve + sharpTurn
}
