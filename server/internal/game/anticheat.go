package game

import (
	"math"

	"github.com/race/server/config"
)

// ValidationResult represents the result of anti-cheat validation
type ValidationResult int

const (
	ValidationValid ValidationResult = iota
	ValidationRubberband
	ValidationExplode
	ValidationKick
	ValidationIgnoreInput
)

// AntiCheat handles anti-cheat validation
type AntiCheat struct{}

// NewAntiCheat creates a new anti-cheat validator
func NewAntiCheat() *AntiCheat {
	return &AntiCheat{}
}

// ValidatePlayerMovement validates player movement between ticks
func (ac *AntiCheat) ValidatePlayerMovement(p *Player, dt float64) ValidationResult {
	p.mu.RLock()
	currentX := p.X
	currentY := p.Y
	lastX := p.LastValidX
	lastY := p.LastValidY
	speed := p.Speed
	violations := p.Violations
	p.mu.RUnlock()

	// Calculate actual distance traveled
	actualDistance := Distance(lastX, lastY, currentX, currentY)

	// Calculate maximum possible distance
	maxPossibleDistance := config.MaxSpeed * dt * config.SpeedTolerance

	// Speed hack detection
	if actualDistance > maxPossibleDistance {
		p.mu.Lock()
		p.Violations++
		newViolations := p.Violations
		p.mu.Unlock()

		if newViolations > config.MaxViolations {
			return ValidationKick
		}
		return ValidationRubberband
	}

	// Validate speed value
	if math.Abs(speed) > config.MaxSpeed*config.SpeedTolerance {
		p.mu.Lock()
		p.Violations++
		p.Speed = math.Copysign(config.MaxSpeed, speed)
		p.mu.Unlock()
	}

	// Reset violations on valid movement
	if violations > 0 && actualDistance <= maxPossibleDistance {
		p.mu.Lock()
		p.Violations = 0
		p.mu.Unlock()
	}

	return ValidationValid
}

// ValidatePosition validates player position against road boundaries
func (ac *AntiCheat) ValidatePosition(p *Player) ValidationResult {
	p.mu.RLock()
	x := p.X
	y := p.Y
	p.mu.RUnlock()

	roadCenter := config.GetRoadCurve(y)
	distFromRoad := math.Abs(x - roadCenter)

	// Check if player is way off road (cheating)
	maxAllowedDist := config.RoadWidth*0.5 + config.RoadWidth*config.ExplosionTolerance*1.5

	if distFromRoad > maxAllowedDist {
		return ValidationExplode
	}

	return ValidationValid
}

// ValidateInputRate checks if player is sending too many inputs
func (ac *AntiCheat) ValidateInputRate(p *Player) ValidationResult {
	count := p.IncrementInputCount()

	if count > config.MaxInputsPerTick {
		return ValidationIgnoreInput
	}

	return ValidationValid
}

// ValidateRating checks for rating manipulation
func (ac *AntiCheat) ValidateRating(p *Player, expectedMaxRating float64) ValidationResult {
	p.mu.RLock()
	rating := p.Rating
	p.mu.RUnlock()

	// Rating should never exceed expected maximum based on time and max speed
	if rating > expectedMaxRating*1.5 {
		p.mu.Lock()
		p.Rating = expectedMaxRating
		p.Violations++
		p.mu.Unlock()
	}

	return ValidationValid
}

// ApplyValidationResult applies the validation result to the player
func (ac *AntiCheat) ApplyValidationResult(p *Player, result ValidationResult) {
	switch result {
	case ValidationRubberband:
		p.RubberbandToValid()

	case ValidationExplode:
		p.Explode()

	case ValidationKick:
		// Handled by caller
		break

	case ValidationIgnoreInput:
		// Input already ignored
		break

	case ValidationValid:
		p.SaveValidPosition()
	}
}
