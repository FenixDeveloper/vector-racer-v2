import { GameStateManager } from '@/game/state';

export class InputHandler {
  private stateManager: GameStateManager;
  private canvas: HTMLCanvasElement;

  // Key mapping
  private keyMap: Record<string, keyof typeof this.stateManager.gameState.keys> = {
    ArrowUp: 'ArrowUp',
    KeyW: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    KeyS: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    KeyA: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    KeyD: 'ArrowRight',
  };

  // Callbacks
  private onControlModeChange?: (mode: 'keyboard' | 'mouse') => void;

  constructor(stateManager: GameStateManager, canvas: HTMLCanvasElement) {
    this.stateManager = stateManager;
    this.canvas = canvas;
  }

  // Initialize input handlers
  init(): void {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('blur', this.handleBlur.bind(this));
  }

  // Cleanup
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    window.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    window.removeEventListener('blur', this.handleBlur.bind(this));
  }

  // Set control mode change callback
  setOnControlModeChange(callback: (mode: 'keyboard' | 'mouse') => void): void {
    this.onControlModeChange = callback;
  }

  // Handle key down
  private handleKeyDown(e: KeyboardEvent): void {
    const mappedKey = this.keyMap[e.code];

    if (mappedKey) {
      this.stateManager.setKey(mappedKey, true);
    }

    // Toggle control mode with Space
    if (e.code === 'Space') {
      e.preventDefault();
      const newMode = this.stateManager.toggleControlMode();

      // Center mouse position when switching to mouse mode
      if (newMode === 'mouse') {
        this.stateManager.setMousePosition(
          this.canvas.width / 2,
          this.canvas.height * 0.7
        );
      }

      this.onControlModeChange?.(newMode);
    }
  }

  // Handle key up
  private handleKeyUp(e: KeyboardEvent): void {
    const mappedKey = this.keyMap[e.code];

    if (mappedKey) {
      this.stateManager.setKey(mappedKey, false);
    }
  }

  // Handle mouse move
  private handleMouseMove(e: MouseEvent): void {
    if (this.stateManager.controlMode === 'mouse') {
      const rect = this.canvas.getBoundingClientRect();
      this.stateManager.setMousePosition(
        e.clientX - rect.left,
        e.clientY - rect.top
      );
    }
  }

  // Handle window blur (release all keys)
  private handleBlur(): void {
    this.stateManager.setKey('ArrowUp', false);
    this.stateManager.setKey('ArrowDown', false);
    this.stateManager.setKey('ArrowLeft', false);
    this.stateManager.setKey('ArrowRight', false);
  }

  // Get current steering value (-1 to 1) for network
  getSteering(): number {
    const state = this.stateManager.gameState;

    if (state.controlMode === 'keyboard') {
      if (state.keys.ArrowLeft) return -1;
      if (state.keys.ArrowRight) return 1;
      return 0;
    } else {
      const cx = this.canvas.width / 2;
      const dx = state.mouse.x - cx;
      return Math.min(1, Math.max(-1, dx / 250));
    }
  }

  // Get current throttle value (-1 to 1) for network
  getThrottle(): number {
    const state = this.stateManager.gameState;

    if (state.controlMode === 'keyboard') {
      if (state.keys.ArrowUp) return 1;
      if (state.keys.ArrowDown) return -1;
      return 0;
    } else {
      const cy = this.canvas.height * 0.7;
      const dy = state.mouse.y - cy;

      if (dy < -20) {
        return Math.min(1, Math.abs(dy) / 200);
      } else if (dy > 20) {
        return -1;
      }
      return 0;
    }
  }
}
