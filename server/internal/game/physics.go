package game

import (
	"log"
	"math"
	"time"

	"github.com/race/server/config"
)

// Physics handles all physics calculations
type Physics struct{}

// NewPhysics creates a new physics engine
func NewPhysics() *Physics {
	return &Physics{}
}

// UpdatePlayer updates a single player's physics state
func (ph *Physics) UpdatePlayer(p *Player, dt float64) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.Exploded {
		return
	}

	input := p.CurrentInput

	// Decode input
	accForce := 0.0
	turnDir := 0.0

	// From keys (bit flags)
	if input.Keys&1 != 0 { // Up
		accForce = config.Acceleration
	}
	if input.Keys&2 != 0 { // Down
		accForce = -config.Braking
	}
	if input.Keys&4 != 0 { // Left
		turnDir = -1.0
	}
	if input.Keys&8 != 0 { // Right
		turnDir = 1.0
	}

	// From analog input (overrides keys if present)
	if math.Abs(input.Throttle) > 0.1 {
		if input.Throttle > 0 {
			accForce = config.Acceleration * input.Throttle
		} else {
			accForce = config.Braking * input.Throttle
		}
	}
	if math.Abs(input.Steering) > 0.1 {
		turnDir = input.Steering
	}

	// Check road boundaries
	roadCenter := config.GetRoadCurve(p.Y)
	distFromCenter := math.Abs(p.X - roadCenter)
	roadHalfWidth := config.RoadWidth / 2.0
	carHalfWidth := config.CarWidth / 2.0
	edgeDist := distFromCenter - roadHalfWidth
	isOffRoad := edgeDist > -carHalfWidth

	// Explosion check
	if edgeDist > config.RoadWidth*config.ExplosionTolerance {
		if !p.Exploded {
			p.Exploded = true
			p.Rating = 0
			p.ExplodedAt = time.Now()
			log.Printf("Player %d exploded: X=%.0f, roadCenter=%.0f, edgeDist=%.0f", p.ID, p.X, roadCenter, edgeDist)
		}
		return
	}

	// Friction
	var activeFriction float64
	if isOffRoad {
		activeFriction = config.FrictionOffroad
	} else {
		activeFriction = config.FrictionRoad
	}

	// Apply friction when not accelerating
	if accForce == 0 {
		if p.Speed > 0 {
			p.Speed = math.Max(0, p.Speed-activeFriction*dt)
		} else if p.Speed < 0 {
			p.Speed = math.Min(0, p.Speed+activeFriction*dt)
		}
	}

	// Off-road speed reduction
	if isOffRoad && accForce != 0 {
		p.Speed -= p.Speed * 2.0 * dt
	}

	// Apply acceleration
	p.Speed += accForce * dt
	p.Speed = math.Max(-config.MaxSpeed*0.2, math.Min(p.Speed, config.MaxSpeed))

	// Steering with understeer
	speedRatio := math.Abs(p.Speed) / config.MaxSpeed
	understeerFactor := math.Max(config.MinTurnAuthority, 1.0-(speedRatio*config.InertiaDampening))

	if math.Abs(turnDir) > 0.01 && math.Abs(p.Speed) > 20 {
		p.X += turnDir * config.TurnSpeed * understeerFactor * dt
		p.Angle = turnDir * 25.0 * understeerFactor

		// Speed penalty from turning
		p.Speed *= 1.0 - (0.3 * math.Abs(turnDir) * dt)
	} else {
		p.Angle *= 0.9
	}

	// Update position
	p.Y += p.Speed * dt

	// Update rating
	if p.Speed > 0 {
		speedFactor := p.Speed / 100.0
		p.Rating += (speedFactor * speedFactor) * dt * 0.5
	}


}

// CheckCollision checks and resolves collision between two players
func (ph *Physics) CheckCollision(p1, p2 *Player, dt float64) bool {
	p1.mu.Lock()
	p2.mu.RLock()

	dx := p1.X - p2.X
	dy := p1.Y - p2.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	minDist := config.CollisionRadius

	if dist >= minDist || dist == 0 {
		p1.mu.Unlock()
		p2.mu.RUnlock()
		return false
	}

	// Normalize collision vector
	nx := dx / dist
	ny := dy / dist
	otherSpeed := p2.Speed
	speedDiff := p1.Speed - otherSpeed

	pushPower := config.PushForce * (math.Abs(p1.Speed) + 100) * dt

	// Speed differential amplification
	if speedDiff > config.SpeedDiffThreshold {
		pushPower *= config.SpeedDiffMultiplier
	}

	p1.X += nx * pushPower
	p1.Y += ny * pushPower
	p1.Speed *= 0.9

	p1.mu.Unlock()
	p2.mu.RUnlock()

	return true
}

// Distance calculates distance between two points
func Distance(x1, y1, x2, y2 float64) float64 {
	dx := x2 - x1
	dy := y2 - y1
	return math.Sqrt(dx*dx + dy*dy)
}
