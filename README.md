# Vector Racer

A multiplayer racing game with real-time physics and WebSocket networking.

## Quick Start

### Using Docker (Recommended)

```bash
# Copy environment file
cp .env.example .env

# Build and start (development)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Build and start (production)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The game will be available at: `http://localhost/race/`

### Docker Commands

```bash
# Start containers (development)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Start containers (production, detached)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Stop containers
docker compose down

# Stop and remove volumes
docker compose down -v

# View logs
docker compose logs -f

# Rebuild without cache
docker compose build --no-cache

# Check container status
docker compose ps
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `80` | Port to expose on host |
| `VITE_BASE_PATH` | `/race/` | Base path for client assets |
| `BASE_PATH` | `/race/` | Base path in nginx config |
| `IMAGE_NAME` | `vector-racer` | Docker image name |
| `IMAGE_TAG` | `latest` | Docker image tag |

### Changing the Base Path

To serve the game from a different path (e.g., `/game/`):

1. Update `.env`:
   ```
   VITE_BASE_PATH=/game/
   BASE_PATH=/game/
   ```

2. Update `nginx/nginx.conf` to replace `/race/` with `/game/`

3. Rebuild: `docker compose up --build`

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Docker Container                 │
│  ┌───────────────────────────────────────────────┐  │
│  │                    Nginx                       │  │
│  │  - Serves static files at /race/              │  │
│  │  - Proxies WebSocket /race/ws → gameserver    │  │
│  │  - Proxies /race/health, /race/stats          │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │                              │
│  ┌───────────────────▼───────────────────────────┐  │
│  │              Go Game Server                    │  │
│  │  - WebSocket connections                       │  │
│  │  - Server-authoritative physics (60 Hz)       │  │
│  │  - Room/matchmaking management                │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Development (Without Docker)

### Prerequisites
- Node.js 18+
- Go 1.21+

### Client
```bash
cd client
npm install
npm run dev    # Runs on http://localhost:3000
```

### Server
```bash
cd server
go run ./cmd/gameserver   # Runs on http://localhost:8080
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /race/` | Game client (static) |
| `WS /race/ws` | WebSocket game connection |
| `GET /race/health` | Health check |
| `GET /race/stats` | Server statistics |

## Tech Stack

- **Client**: TypeScript, Vite, Canvas 2D
- **Server**: Go, Gorilla WebSocket
- **Deployment**: Docker, Nginx, Supervisor

## How It Works

This section explains the game's architecture for developers who want to understand or modify the codebase.

### Overview

Vector Racer is a **server-authoritative** multiplayer racing game. The server runs the physics simulation and broadcasts state to all clients. Clients send their inputs to the server and render the game state they receive back.

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Client    │ ◄─────────────────────────►│   Server    │
│             │    Binary messages          │             │
│  - Renders  │    (see Protocol below)     │  - Physics  │
│  - Input    │                             │  - Rooms    │
│  - Predict  │                             │  - Validate │
└─────────────┘                             └─────────────┘
```

### Game Loop

The server runs two separate loops:

1. **Physics Loop (60 Hz)** - Updates player positions, handles collisions, validates movement
2. **Broadcast Loop (20 Hz)** - Sends game state to all connected clients

```go
// From server/internal/game/room.go
physicsTicker := time.NewTicker(time.Second / 60)   // 60 Hz
broadcastTicker := time.NewTicker(time.Second / 20) // 20 Hz
```

The client runs its own render loop at the display's refresh rate (typically 60 Hz) and interpolates between received server states for smooth rendering.

### Binary Protocol

The game uses a custom binary protocol over WebSocket for efficiency. Each message starts with a 1-byte message type:

| Type | Name | Direction | Description |
|------|------|-----------|-------------|
| `0x01` | JoinRoom | Client -> Server | Request to join a room |
| `0x02` | LeaveRoom | Client -> Server | Leave current room |
| `0x03` | Input | Client -> Server | Player controls (steering, throttle) |
| `0x04` | Ping | Client -> Server | Latency measurement |
| `0x10` | RoomInfo | Server -> Client | Room assignment confirmation |
| `0x11` | StateUpdate | Server -> Client | All players' positions/states |
| `0x12` | PlayerJoin | Server -> Client | New player joined |
| `0x13` | PlayerLeave | Server -> Client | Player left |
| `0x14` | Pong | Server -> Client | Ping response |
| `0x15` | Error | Server -> Client | Error message |

**Example: StateUpdate message structure**
```
[0x11][tick:2][player_count:1][player_data:N*16]

Each player_data (16 bytes):
[id:2][x:4][y:4][speed:2][angle:2][rating:1][flags:1]
```

### Room System

Players are organized into rooms. Each room:
- Has its own physics simulation
- Supports up to 10 players (configurable)
- Auto-starts when first player joins
- Auto-cleans up when empty (30-second timer)

```go
// From server/internal/matchmaker/matchmaker.go
func (m *Matchmaker) FindRoom() *game.Room {
    // 1. Find existing room with space
    // 2. If none found, create new room
    // 3. Start room's game loop
}
```

### Physics Simulation

The physics engine handles:

1. **Vehicle Movement** - Acceleration, braking, steering
2. **Road Boundaries** - Players are constrained to the curved road
3. **Collisions** - Player-to-player collision detection and response
4. **Spatial Partitioning** - Grid-based optimization for collision checks

```go
// From server/internal/game/physics.go
func (p *Physics) UpdatePlayer(player *Player, dt float64) {
    // Apply throttle/brake
    // Apply steering (turning)
    // Update position
    // Clamp to road boundaries
}
```

### Anti-Cheat System

The server validates all player actions:

1. **Input Rate Limiting** - Max inputs per tick to prevent flooding
2. **Speed Validation** - Detects impossible speeds (speed hacks)
3. **Position Validation** - Detects teleportation hacks
4. **Correction/Kick** - Invalid players are corrected or kicked

```go
// From server/internal/game/anticheat.go
result := r.antiCheat.ValidatePlayerMovement(p, dt)
if result == ValidationKick {
    r.kickPlayer(p, "Speed hack detected")
}
```

### Thread Safety (Important!)

The server uses Go's `sync.RWMutex` for thread safety. Key patterns:

```go
// Room struct
type Room struct {
    mu sync.RWMutex      // Protects players map
    players map[uint16]*Player
    // ...
}

// Reading players (multiple readers allowed)
r.mu.RLock()
defer r.mu.RUnlock()

// Modifying players (exclusive access)
r.mu.Lock()
defer r.mu.Unlock()
```

**CRITICAL**: Go's RWMutex is **not reentrant**. You cannot call `RLock()` while holding `Lock()` in the same goroutine. Methods ending in `Unlocked` expect the caller to already hold the lock.

### Client Architecture

The client is organized into modules:

```
client/src/
├── main.ts          # Entry point, game loop
├── network.ts       # WebSocket connection, protocol
├── game.ts          # Game state management
├── render.ts        # Canvas 2D rendering
├── input.ts         # Keyboard/touch controls
├── physics.ts       # Client-side prediction
└── config.ts        # Game constants
```

**Client-Side Prediction**: The client runs simplified physics locally to make controls feel responsive, then reconciles with authoritative server state.

### Connection Flow

1. Client loads page, establishes WebSocket connection
2. User clicks "Join" -> Client sends `JoinRoom` message
3. Server assigns player to room -> sends `RoomInfo` with player ID
4. Server broadcasts `PlayerJoin` to other players in room
5. Game loop: Client sends `Input`, Server broadcasts `StateUpdate`
6. On disconnect: Server broadcasts `PlayerLeave`, cleans up player

### File Structure

```
server/
├── cmd/gameserver/main.go    # Entry point, WebSocket handler
├── config/                   # Game constants
└── internal/
    ├── game/
    │   ├── room.go           # Room management, game loop
    │   ├── player.go         # Player state
    │   ├── physics.go        # Physics simulation
    │   ├── anticheat.go      # Validation
    │   └── spatial.go        # Collision optimization
    ├── matchmaker/           # Room assignment
    └── network/              # Binary protocol

client/
├── src/                      # TypeScript source
├── public/                   # Static assets
└── vite.config.ts           # Build configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `docker compose up --build`
5. Submit a pull request

## License

MIT
