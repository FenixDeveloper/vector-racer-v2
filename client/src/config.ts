// Game configuration - must match server exactly for deterministic physics

// Dynamically determine WebSocket URL based on current location
function getDefaultWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8080/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  // Get base path from current location (e.g., /race/)
  const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
  return `${protocol}//${host}${basePath}/ws`;
}

export const CONFIG = {
  // Dimensions
  CAR_WIDTH: 20,
  CAR_HEIGHT: 34,
  ROAD_WIDTH: 400,
  CAMERA_Y_OFFSET: 0.7,

  // Network
  SYNC_RATE_MS: 80, // Client sync rate (12.5 Hz)
  SERVER_URL: import.meta.env.VITE_SERVER_URL || getDefaultWebSocketUrl(),

  // Physics / Gameplay
  MAX_SPEED: 1400,
  ACCELERATION: 900,
  BRAKING: 2000,
  FRICTION_ROAD: 250,
  FRICTION_OFFROAD: 5000,
  INERTIA_DAMPENING: 0.3,
  MIN_TURN_AUTHORITY: 0.5,
  EXPLOSION_TOLERANCE: 0.35,

  // Steering
  TURN_SPEED: 550,

  // Mouse Control
  MOUSE_SENSITIVITY_X: 250,
  MOUSE_SENSITIVITY_Y: 200,

  // Collision / Combat
  PUSH_FORCE: 2.0,
  SPEED_DIFF_MULTIPLIER: 3.5,
  SPEED_DIFF_THRESHOLD: 200,

  // Road Generation (must match server exactly)
  ROAD_SCALE: 0.001,
  ROAD_AMPLITUDE: 600,

  // Particles
  EXPLOSION_PARTICLES: 30,
  PARTICLE_DECAY: 1.5,

  // Respawn
  RESPAWN_DELAY_MS: 2500,

  // Turn prediction
  TURN_LOOKAHEAD: 800,
  SHARP_TURN_THRESHOLD: 350,
} as const;

// Road curve calculation - MUST match server implementation exactly
export function getRoadCurve(worldY: number): number {
  const baseCurve = Math.sin(worldY * CONFIG.ROAD_SCALE) * CONFIG.ROAD_AMPLITUDE;
  const sharpTurn = Math.pow(Math.sin(worldY * CONFIG.ROAD_SCALE * 1.5), 3) * (CONFIG.ROAD_AMPLITUDE * 0.5);
  return baseCurve + sharpTurn;
}

// Name generation
const ADJECTIVES = ['Swift', 'Turbo', 'Neon', 'Iron', 'Cyber', 'Rogue', 'Apex', 'Ghost', 'Hyper', 'Shadow', 'Rapid', 'Drifting', 'Electric'];
const ANIMALS = ['Fox', 'Hawk', 'Bear', 'Wolf', 'Tiger', 'Eagle', 'Shark', 'Falcon', 'Cobra', 'Viper', 'Badger', 'Panda', 'Lynx'];

export function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${ani}`;
}

export function getOrAssignName(): string {
  let name = localStorage.getItem('racer_name');
  if (!name) {
    name = generateName();
    localStorage.setItem('racer_name', name);
  }
  return name;
}
