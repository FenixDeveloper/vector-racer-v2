// Player state types
export interface PlayerState {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  speed: number;
  angle: number;
  rating: number;
  exploded: boolean;
}

export interface LocalPlayer extends PlayerState {
  lastSync: number;
}

export interface RemotePlayer extends PlayerState {
  packetX: number;
  packetY: number;
  currentX: number;
  currentY: number;
  lastPacketTime: number;
}

// Input types
export interface KeyState {
  ArrowUp: boolean;
  ArrowDown: boolean;
  ArrowLeft: boolean;
  ArrowRight: boolean;
}

export interface MouseState {
  x: number;
  y: number;
}

export type ControlMode = 'keyboard' | 'mouse';

// Particle system
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

// Camera
export interface Camera {
  shakeX: number;
  shakeY: number;
}

// Game state
export interface GameState {
  running: boolean;
  controlMode: ControlMode;
  localPlayer: LocalPlayer;
  keys: KeyState;
  mouse: MouseState;
  remotePlayers: Map<number, RemotePlayer>;
  particles: Particle[];
  camera: Camera;
  connected: boolean;
}

// Network message types
export enum MessageType {
  // Client -> Server
  Input = 0x01,
  JoinRoom = 0x02,
  LeaveRoom = 0x03,
  Ping = 0x04,

  // Server -> Client
  StateUpdate = 0x10,
  PlayerJoin = 0x11,
  PlayerLeave = 0x12,
  PlayerDeath = 0x13,
  RoomInfo = 0x14,
  Pong = 0x15,
  Error = 0xff,
}

// Network player data from server
export interface NetworkPlayerData {
  id: number;
  x: number;
  y: number;
  speed: number;
  angle: number;
  rating: number;
  flags: number;
  color: number;
}

// Key flags for binary protocol
export const KeyFlags = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
} as const;

// Player flags
export const PlayerFlags = {
  Exploded: 1 << 0,
  Respawning: 1 << 1,
} as const;

// Color palette (matches server)
export const ColorPalette: string[] = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
  '#f472b6', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#84cc16', // Lime
  '#ec4899', // Fuchsia
  '#14b8a6', // Teal
  '#a855f7', // Violet
  '#fbbf24', // Amber
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f43f5e', // Rose
];

// Leaderboard entry
export interface LeaderboardEntry {
  name: string;
  rating: number;
  isLocal: boolean;
}
