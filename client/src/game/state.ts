import { GameState, LocalPlayer, RemotePlayer, ControlMode, ColorPalette } from '@/types';
import { getOrAssignName } from '@/config';

// Create initial game state
export function createGameState(): GameState {
  return {
    running: false,
    controlMode: 'keyboard',
    localPlayer: createLocalPlayer(),
    keys: {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    },
    mouse: { x: 0, y: 0 },
    remotePlayers: new Map(),
    particles: [],
    camera: { shakeX: 0, shakeY: 0 },
    connected: false,
  };
}

// Create initial local player
function createLocalPlayer(): LocalPlayer {
  return {
    id: 0,
    name: getOrAssignName(),
    color: ColorPalette[0],
    x: 0,
    y: 0,
    speed: 0,
    angle: 0,
    rating: 0,
    exploded: false,
    lastSync: 0,
  };
}

// Game state manager
export class GameStateManager {
  private state: GameState;
  private colorIndex = 0;

  constructor() {
    this.state = createGameState();
  }

  get gameState(): GameState {
    return this.state;
  }

  get localPlayer(): LocalPlayer {
    return this.state.localPlayer;
  }

  get remotePlayers(): Map<number, RemotePlayer> {
    return this.state.remotePlayers;
  }

  get isRunning(): boolean {
    return this.state.running;
  }

  get controlMode(): ControlMode {
    return this.state.controlMode;
  }

  // Start the game
  startGame(): void {
    this.state.running = true;
    this.state.localPlayer.x = 0;
    this.state.localPlayer.y = 0;
    this.state.localPlayer.speed = 0;
    this.state.localPlayer.rating = 0;
    this.state.localPlayer.exploded = false;
  }

  // Stop the game
  stopGame(): void {
    this.state.running = false;
  }

  // Set player ID from server
  setPlayerId(id: number): void {
    this.state.localPlayer.id = id;
  }

  // Set color
  setColor(colorIndex: number): void {
    this.colorIndex = colorIndex;
    this.state.localPlayer.color = ColorPalette[colorIndex % ColorPalette.length];
  }

  getColorIndex(): number {
    return this.colorIndex;
  }

  // Toggle control mode
  toggleControlMode(): ControlMode {
    this.state.controlMode = this.state.controlMode === 'keyboard' ? 'mouse' : 'keyboard';
    return this.state.controlMode;
  }

  // Force keyboard mode (after crash)
  forceKeyboardMode(): void {
    this.state.controlMode = 'keyboard';
  }

  // Set connection state
  setConnected(connected: boolean): void {
    this.state.connected = connected;
  }

  // Update key state
  setKey(key: keyof typeof this.state.keys, pressed: boolean): void {
    this.state.keys[key] = pressed;
  }

  // Update mouse position
  setMousePosition(x: number, y: number): void {
    this.state.mouse.x = x;
    this.state.mouse.y = y;
  }

  // Add or update remote player
  updateRemotePlayer(id: number, data: Partial<RemotePlayer>): void {
    const existing = this.state.remotePlayers.get(id);
    const now = Date.now();

    if (existing) {
      // Update existing
      if (data.x !== undefined) existing.packetX = data.x;
      if (data.y !== undefined) existing.packetY = data.y;
      if (data.speed !== undefined) existing.speed = data.speed;
      if (data.angle !== undefined) existing.angle = data.angle;
      if (data.rating !== undefined) existing.rating = data.rating;
      if (data.color !== undefined) existing.color = data.color;
      if (data.name !== undefined) existing.name = data.name;
      if (data.exploded !== undefined) existing.exploded = data.exploded;
      existing.lastPacketTime = now;
    } else {
      // New player
      const newPlayer: RemotePlayer = {
        id,
        name: data.name || 'Unknown',
        color: data.color || ColorPalette[0],
        x: data.x || 0,
        y: data.y || 0,
        speed: data.speed || 0,
        angle: data.angle || 0,
        rating: data.rating || 0,
        exploded: data.exploded || false,
        packetX: data.x || 0,
        packetY: data.y || 0,
        currentX: data.x || 0,
        currentY: data.y || 0,
        lastPacketTime: now,
      };
      this.state.remotePlayers.set(id, newPlayer);
    }
  }

  // Remove remote player
  removeRemotePlayer(id: number): void {
    this.state.remotePlayers.delete(id);
  }

  // Clear all remote players
  clearRemotePlayers(): void {
    this.state.remotePlayers.clear();
  }

  // Explode player
  explodePlayer(): void {
    this.state.localPlayer.exploded = true;
    this.state.localPlayer.rating = 0;
  }

  // Respawn player - move forward to avoid dying at same spot
  respawnPlayer(getRoadCurve: (y: number) => number): void {
    this.state.localPlayer.exploded = false;
    this.state.localPlayer.speed = 0;
    this.state.localPlayer.angle = 0;
    // Move forward to safe position (must match server: Y += 200)
    this.state.localPlayer.y += 200;
    this.state.localPlayer.x = getRoadCurve(this.state.localPlayer.y);
  }

  // Add particles
  addParticles(particles: typeof this.state.particles): void {
    this.state.particles.push(...particles);
  }

  // Clear expired particles
  pruneParticles(): void {
    this.state.particles = this.state.particles.filter(p => p.life > 0);
  }

  // Shake camera
  shakeCamera(x: number, y: number): void {
    this.state.camera.shakeX = x;
    this.state.camera.shakeY = y;
  }

  // Decay camera shake
  decayCameraShake(factor: number = 0.9): void {
    this.state.camera.shakeX *= factor;
    this.state.camera.shakeY *= factor;
  }

  // Reset state
  reset(): void {
    this.state = createGameState();
    this.state.localPlayer.color = ColorPalette[this.colorIndex % ColorPalette.length];
  }
}

// Singleton instance
export const gameState = new GameStateManager();
