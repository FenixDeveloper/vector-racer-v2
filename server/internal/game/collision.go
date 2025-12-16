package game

import (
	"sync"
)

// CellKey represents a cell in the spatial grid
type CellKey struct {
	X, Y int64
}

// SpatialGrid implements spatial partitioning for efficient collision detection
type SpatialGrid struct {
	mu       sync.RWMutex
	cellSize float64
	cells    map[CellKey][]*Player
}

// NewSpatialGrid creates a new spatial grid
func NewSpatialGrid(cellSize float64) *SpatialGrid {
	return &SpatialGrid{
		cellSize: cellSize,
		cells:    make(map[CellKey][]*Player),
	}
}

// getCellKey returns the cell key for a position
func (g *SpatialGrid) getCellKey(x, y float64) CellKey {
	return CellKey{
		X: int64(x / g.cellSize),
		Y: int64(y / g.cellSize),
	}
}

// Clear removes all players from the grid
func (g *SpatialGrid) Clear() {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.cells = make(map[CellKey][]*Player)
}

// Insert adds a player to the grid
func (g *SpatialGrid) Insert(p *Player) {
	g.mu.Lock()
	defer g.mu.Unlock()

	p.mu.RLock()
	key := g.getCellKey(p.X, p.Y)
	p.mu.RUnlock()

	g.cells[key] = append(g.cells[key], p)
}

// Update rebuilds the grid with all players
func (g *SpatialGrid) Update(players []*Player) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Clear all cells
	g.cells = make(map[CellKey][]*Player)

	// Insert all players
	for _, p := range players {
		p.mu.RLock()
		key := g.getCellKey(p.X, p.Y)
		p.mu.RUnlock()

		g.cells[key] = append(g.cells[key], p)
	}
}

// GetNearbyPlayers returns players in the same and adjacent cells
func (g *SpatialGrid) GetNearbyPlayers(p *Player) []*Player {
	g.mu.RLock()
	defer g.mu.RUnlock()

	p.mu.RLock()
	centerKey := g.getCellKey(p.X, p.Y)
	p.mu.RUnlock()

	var nearby []*Player

	// Check 3x3 grid of cells around player
	for dx := int64(-1); dx <= 1; dx++ {
		for dy := int64(-1); dy <= 1; dy++ {
			key := CellKey{X: centerKey.X + dx, Y: centerKey.Y + dy}
			if players, ok := g.cells[key]; ok {
				for _, other := range players {
					if other.ID != p.ID {
						nearby = append(nearby, other)
					}
				}
			}
		}
	}

	return nearby
}

// GetPotentialCollisions returns pairs of players that might collide
func (g *SpatialGrid) GetPotentialCollisions() [][2]*Player {
	g.mu.RLock()
	defer g.mu.RUnlock()

	checked := make(map[uint32]bool)
	var pairs [][2]*Player

	for _, players := range g.cells {
		for i := 0; i < len(players); i++ {
			for j := i + 1; j < len(players); j++ {
				p1 := players[i]
				p2 := players[j]

				// Create unique key for this pair
				var pairKey uint32
				if p1.ID < p2.ID {
					pairKey = uint32(p1.ID)<<16 | uint32(p2.ID)
				} else {
					pairKey = uint32(p2.ID)<<16 | uint32(p1.ID)
				}

				if !checked[pairKey] {
					checked[pairKey] = true
					pairs = append(pairs, [2]*Player{p1, p2})
				}
			}
		}
	}

	// Also check adjacent cells for cross-cell collisions
	for key, players := range g.cells {
		for dx := int64(0); dx <= 1; dx++ {
			for dy := int64(-1); dy <= 1; dy++ {
				if dx == 0 && dy <= 0 {
					continue // Skip already processed
				}

				adjKey := CellKey{X: key.X + dx, Y: key.Y + dy}
				adjPlayers, ok := g.cells[adjKey]
				if !ok {
					continue
				}

				for _, p1 := range players {
					for _, p2 := range adjPlayers {
						var pairKey uint32
						if p1.ID < p2.ID {
							pairKey = uint32(p1.ID)<<16 | uint32(p2.ID)
						} else {
							pairKey = uint32(p2.ID)<<16 | uint32(p1.ID)
						}

						if !checked[pairKey] {
							checked[pairKey] = true
							pairs = append(pairs, [2]*Player{p1, p2})
						}
					}
				}
			}
		}
	}

	return pairs
}
