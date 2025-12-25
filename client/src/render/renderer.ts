import { CONFIG, getRoadCurve } from '@/config';
import { GameStateManager } from '@/game/state';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stateManager: GameStateManager;

  constructor(canvas: HTMLCanvasElement, stateManager: GameStateManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.stateManager = stateManager;
  }

  // Resize canvas to window
  resize(): void {
    if (this.canvas.width !== window.innerWidth || this.canvas.height !== window.innerHeight) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  // Main render function
  render(): void {
    this.resize();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const { localPlayer, camera } = this.stateManager.gameState;
    const camY = localPlayer.y;
    const camX = localPlayer.x;

    // Draw road
    this.drawRoad(camY);

    // Project world coordinates to screen
    const project = (wx: number, wy: number) => ({
      x: this.canvas.width / 2 + (wx - camX) + camera.shakeX,
      y: this.canvas.height * CONFIG.CAMERA_Y_OFFSET - (wy - camY) + camera.shakeY,
    });

    // Draw remote players
    this.stateManager.remotePlayers.forEach((remote) => {
      const screen = project(remote.currentX, remote.currentY);
      if (screen.y > -50 && screen.y < this.canvas.height + 50) {
        this.drawCar(screen.x, screen.y, remote.angle, remote.color, false, remote.name);
      }
    });

    // Draw local player
    const localScreen = project(localPlayer.x, localPlayer.y);
    this.drawCar(localScreen.x, localScreen.y, localPlayer.angle, localPlayer.color, true);

    // Draw particles
    this.drawParticles(camX, camY);

    // Draw mouse cursor in mouse mode
    if (this.stateManager.controlMode === 'mouse') {
      this.drawMouseCursor();
    }
  }

  // Draw the road
  private drawRoad(camY: number): void {
    const totalHeight = this.canvas.height;
    const segmentHeight = 20;
    const drawDistance = totalHeight + 400;
    const { camera, localPlayer } = this.stateManager.gameState;

    // Use raw camera - no smoothing (test)
    const useCamX = localPlayer.x;
    const useCamY = camY;

    const startY = Math.floor((useCamY - totalHeight * CONFIG.CAMERA_Y_OFFSET) / segmentHeight) * segmentHeight;

    // Background
    this.ctx.fillStyle = '#064e3b';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = startY; y < startY + drawDistance; y += segmentHeight) {
      const relY = y - useCamY;
      const screenY = this.canvas.height * CONFIG.CAMERA_Y_OFFSET - relY;

      if (screenY < -segmentHeight || screenY > this.canvas.height + segmentHeight) continue;

      // Use raw camera X
      const drawX = Math.round((this.canvas.width / 2) + (getRoadCurve(y) - useCamX) + camera.shakeX);
      const drawY = Math.round(screenY + camera.shakeY);

      const segmentIndex = Math.floor(y / segmentHeight);
      const isDark = segmentIndex % 2 === 0;

      // Road edge (curb)
      this.ctx.fillStyle = isDark ? '#b91c1c' : '#f3f4f6';
      this.ctx.fillRect(drawX - CONFIG.ROAD_WIDTH / 2 - 25, drawY - segmentHeight, CONFIG.ROAD_WIDTH + 50, segmentHeight + 1);

      // Road surface
      this.ctx.fillStyle = isDark ? '#1f2937' : '#374151';
      this.ctx.fillRect(drawX - CONFIG.ROAD_WIDTH / 2, drawY - segmentHeight, CONFIG.ROAD_WIDTH, segmentHeight + 1);

      // Center line
      if (segmentIndex % 4 < 2) {
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.fillRect(drawX - 2, drawY - segmentHeight, 4, segmentHeight + 1);
      }
    }
  }

  // Draw a car
  private drawCar(x: number, y: number, angle: number, color: string, isLocal: boolean, name?: string): void {

    if (isLocal && this.stateManager.localPlayer.exploded) return;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate((angle * Math.PI) / 180);

    // Shadow
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.ctx.beginPath();
    this.ctx.roundRect(-CONFIG.CAR_WIDTH / 2 + 4, -CONFIG.CAR_HEIGHT / 2 + 4, CONFIG.CAR_WIDTH, CONFIG.CAR_HEIGHT, 4);
    this.ctx.fill();

    // Body
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect(-CONFIG.CAR_WIDTH / 2, -CONFIG.CAR_HEIGHT / 2, CONFIG.CAR_WIDTH, CONFIG.CAR_HEIGHT, 4);
    this.ctx.fill();

    // Center stripe
    this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
    this.ctx.fillRect(-4, -CONFIG.CAR_HEIGHT / 2, 8, CONFIG.CAR_HEIGHT);

    // Windshield
    this.ctx.fillStyle = '#111827';
    this.ctx.beginPath();
    this.ctx.roundRect(-CONFIG.CAR_WIDTH / 2 + 2, -CONFIG.CAR_HEIGHT / 2 + 6, CONFIG.CAR_WIDTH - 4, CONFIG.CAR_HEIGHT * 0.5, 2);
    this.ctx.fill();

    // Headlights
    this.ctx.fillStyle = '#fef08a';
    this.ctx.shadowColor = '#fef08a';
    this.ctx.shadowBlur = 10;
    this.ctx.fillRect(-CONFIG.CAR_WIDTH / 2 + 2, -CONFIG.CAR_HEIGHT / 2, 5, 3);
    this.ctx.fillRect(CONFIG.CAR_WIDTH / 2 - 7, -CONFIG.CAR_HEIGHT / 2, 5, 3);
    this.ctx.shadowBlur = 0;

    // Brake lights
    const isBraking = this.isBraking();
    if (isBraking && isLocal) {
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#ef4444';
      this.ctx.fillStyle = '#ff0000';
    } else {
      this.ctx.fillStyle = '#7f1d1d';
    }
    this.ctx.fillRect(-CONFIG.CAR_WIDTH / 2 + 2, CONFIG.CAR_HEIGHT / 2 - 2, 5, 2);
    this.ctx.fillRect(CONFIG.CAR_WIDTH / 2 - 7, CONFIG.CAR_HEIGHT / 2 - 2, 5, 2);
    this.ctx.shadowBlur = 0;

    this.ctx.restore();

    // Draw name for remote players
    if (!isLocal && name) {
      this.ctx.fillStyle = 'white';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.shadowColor = 'black';
      this.ctx.shadowBlur = 4;
      this.ctx.fillText(name, x, y - 30);
      this.ctx.shadowBlur = 0;
    }
  }

  // Check if player is braking
  private isBraking(): boolean {
    const { keys, mouse, controlMode } = this.stateManager.gameState;

    if (controlMode === 'keyboard') {
      return keys.ArrowDown;
    } else {
      const cy = this.canvas.height * CONFIG.CAMERA_Y_OFFSET;
      return mouse.y - cy > 20;
    }
  }

  // Draw particles
  private drawParticles(camX: number, camY: number): void {
    const { particles, camera } = this.stateManager.gameState;

    particles.forEach((p) => {
      const sx = this.canvas.width / 2 + (p.x - camX) + camera.shakeX;
      const sy = this.canvas.height * CONFIG.CAMERA_Y_OFFSET - (p.y - camY) + camera.shakeY;

      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
    });
  }

  // Draw mouse cursor
  private drawMouseCursor(): void {
    const { mouse } = this.stateManager.gameState;

    this.ctx.beginPath();
    this.ctx.arc(mouse.x, mouse.y, 5, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.fill();
    this.ctx.strokeStyle = '#fbbf24';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Line to center
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height * CONFIG.CAMERA_Y_OFFSET;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(mouse.x, mouse.y);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.stroke();
  }
}
