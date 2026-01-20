import { CONFIG, getRoadCurve } from '@/config';
import { GameStateManager } from './state';
import { Particle } from '@/types';

export class Physics {
  private stateManager: GameStateManager;

  constructor(stateManager: GameStateManager) {
    this.stateManager = stateManager;
  }

  // Update local player physics
  update(dt: number, canvas: HTMLCanvasElement): void {
    const state = this.stateManager.gameState;
    const p = state.localPlayer;

    if (p.exploded) return;

    const { keys, mouse, controlMode } = state;

    let accForce = 0;
    let turnDir = 0;

    // Update rating based on speed
    if (p.speed > 0) {
      const speedFactor = p.speed / 100;
      p.rating += (speedFactor * speedFactor) * dt * 0.5;
    }

    // Process input based on control mode
    if (controlMode === 'keyboard') {
      if (keys.ArrowUp) accForce = CONFIG.ACCELERATION;
      if (keys.ArrowDown) accForce = -CONFIG.BRAKING;
      if (keys.ArrowLeft) turnDir = -1;
      if (keys.ArrowRight) turnDir = 1;
    } else {
      // Mouse control
      const cx = canvas.width / 2;
      const cy = canvas.height * CONFIG.CAMERA_Y_OFFSET;
      const dx = mouse.x - cx;
      const dy = mouse.y - cy;

      const turnRatio = Math.min(1, Math.max(-1, dx / CONFIG.MOUSE_SENSITIVITY_X));
      turnDir = Math.abs(turnRatio) > 0.1 ? turnRatio : 0;

      if (dy < -20) {
        const gasRatio = Math.min(1, Math.abs(dy) / CONFIG.MOUSE_SENSITIVITY_Y);
        accForce = CONFIG.ACCELERATION * gasRatio;
      } else if (dy > 20) {
        accForce = -CONFIG.BRAKING;
      }
    }

    // Check road boundaries
    const roadCenter = getRoadCurve(p.y);
    const distFromCenter = Math.abs(p.x - roadCenter);
    const roadHalfWidth = CONFIG.ROAD_WIDTH / 2;
    const carHalfWidth = CONFIG.CAR_WIDTH / 2;
    const edgeDist = distFromCenter - roadHalfWidth;
    const isOffRoad = edgeDist > -carHalfWidth;

    // Explosion check
    if (edgeDist > CONFIG.ROAD_WIDTH * CONFIG.EXPLOSION_TOLERANCE) {
      this.triggerExplosion();
      return;
    }

    // Friction
    const activeFriction = isOffRoad ? CONFIG.FRICTION_OFFROAD : CONFIG.FRICTION_ROAD;

    // Natural friction decay
    if (accForce === 0 && p.speed > 0) {
      p.speed = Math.max(0, p.speed - activeFriction * dt);
    }
    if (accForce === 0 && p.speed < 0) {
      p.speed = Math.min(0, p.speed + activeFriction * dt);
    }

    // Off-road speed reduction
    if (isOffRoad && accForce !== 0) {
      p.speed -= p.speed * 2.0 * dt;
    }

    // Apply acceleration
    p.speed += accForce * dt;
    p.speed = Math.max(-CONFIG.MAX_SPEED * 0.2, Math.min(p.speed, CONFIG.MAX_SPEED));

    // Steering with understeer
    const speedRatio = Math.abs(p.speed) / CONFIG.MAX_SPEED;
    const understeerFactor = Math.max(CONFIG.MIN_TURN_AUTHORITY, 1.0 - (speedRatio * CONFIG.INERTIA_DAMPENING));

    if (Math.abs(turnDir) > 0.01 && Math.abs(p.speed) > 20) {
      p.x += turnDir * CONFIG.TURN_SPEED * understeerFactor * dt;
      p.angle = turnDir * 25 * understeerFactor;

      // Speed penalty from turning
      p.speed *= 1 - (0.3 * Math.abs(turnDir) * dt);
    } else {
      p.angle *= 0.9;
    }

    // Update position
    p.y += p.speed * dt;

    // Check collisions with remote players
    this.checkCollisions(dt);

    // Decay camera shake
    this.stateManager.decayCameraShake();
  }

  // Check collisions with remote players
  private checkCollisions(dt: number): void {
    const p = this.stateManager.localPlayer;

    this.stateManager.remotePlayers.forEach((other) => {
      const dx = p.x - other.currentX;
      const dy = p.y - other.currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = CONFIG.CAR_WIDTH * 1.4;

      if (dist < minDist && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        const otherSpeed = other.speed || 0;
        const speedDiff = p.speed - otherSpeed;

        let pushPower = CONFIG.PUSH_FORCE * (Math.abs(p.speed) + 100) * dt;

        if (speedDiff > CONFIG.SPEED_DIFF_THRESHOLD) {
          pushPower *= CONFIG.SPEED_DIFF_MULTIPLIER;
          this.stateManager.shakeCamera(
            Math.random() * 10 - 5,
            Math.random() * 10 - 5
          );
        }

        p.x += nx * pushPower;
        p.y += ny * pushPower;
        p.speed *= 0.9;
      }
    });
  }

  // Update remote player positions using dead reckoning
  updateRemotePlayers(): void {
    const now = Date.now();

    this.stateManager.remotePlayers.forEach((remote) => {
      // Predict future position based on last packet
      const timeSincePacket = (now - remote.lastPacketTime) / 1000;
      const predictedY = remote.packetY + (remote.speed * timeSincePacket);
      const predictedX = remote.packetX;

      // Interpolate towards prediction
      const t = 0.1;
      remote.currentX = remote.currentX + (predictedX - remote.currentX) * t;
      remote.currentY = remote.currentY + (predictedY - remote.currentY) * t;
    });
  }

  // Trigger player explosion
  private triggerExplosion(): void {
    const p = this.stateManager.localPlayer;
    if (p.exploded) return;

    // Spawn explosion particles
    const particles = this.createExplosionParticles(p.x, p.y, p.color);
    this.stateManager.addParticles(particles);

    // Explode player
    this.stateManager.explodePlayer();

    // Switch to keyboard/joystick mode for safety (not mouse/tilt)
    const mode = this.stateManager.controlMode;
    if (mode === 'mouse' || mode === 'tilt') {
      this.stateManager.forceDefaultMode(mode === 'tilt');
    }
  }

  // Create explosion particles
  private createExplosionParticles(x: number, y: number, color: string): Particle[] {
    const particles: Particle[] = [];

    for (let i = 0; i < CONFIG.EXPLOSION_PARTICLES; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 800,
        vy: (Math.random() - 0.5) * 800,
        life: 1.0,
        color: i % 2 === 0 ? color : '#fbbf24',
        size: Math.random() * 6 + 2,
      });
    }

    return particles;
  }

  // Update particles
  updateParticles(dt: number): void {
    const { particles } = this.stateManager.gameState;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * CONFIG.PARTICLE_DECAY;

      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  // Predict upcoming turns
  predictTurn(): { isSharp: boolean; direction: 'left' | 'right' | null } {
    const p = this.stateManager.localPlayer;
    const currentX = getRoadCurve(p.y);
    const futureX = getRoadCurve(p.y + CONFIG.TURN_LOOKAHEAD);
    const delta = futureX - currentX;

    if (Math.abs(delta) > CONFIG.SHARP_TURN_THRESHOLD) {
      return {
        isSharp: true,
        direction: delta > 0 ? 'right' : 'left',
      };
    }

    return { isSharp: false, direction: null };
  }
}
