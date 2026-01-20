import { GameStateManager } from '@/game/state';
import { ControlMode } from '@/types';
import { TouchController } from './touch';

export class InputHandler {
  private stateManager: GameStateManager;
  private canvas: HTMLCanvasElement;
  private touchController: TouchController | null = null;
  private isMobile: boolean;

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
  private onControlModeChange?: (mode: ControlMode) => void;

  constructor(stateManager: GameStateManager, canvas: HTMLCanvasElement) {
    this.stateManager = stateManager;
    this.canvas = canvas;
    this.isMobile = TouchController.isTouchDevice();
  }

  // Initialize input handlers
  init(): void {
    // Always setup keyboard/mouse for devices that have both
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('blur', this.handleBlur.bind(this));

    // Setup touch controls if on mobile
    if (this.isMobile) {
      this.touchController = new TouchController();
      this.touchController.init();
      this.touchController.setOnModeChange((mode) => {
        this.stateManager.setControlMode(mode);
        this.onControlModeChange?.(mode);
      });

      // Set initial mobile control mode
      const savedMode = localStorage.getItem('mobile_control_mode');
      if (savedMode === 'joystick' || savedMode === 'tilt') {
        this.stateManager.setControlMode(savedMode);
      } else {
        this.stateManager.setControlMode('joystick');
      }
    }
  }

  // Show mobile controls (call when game starts)
  showMobileControls(): void {
    if (this.touchController) {
      this.touchController.show();
    }
  }

  // Hide mobile controls (call when game stops)
  hideMobileControls(): void {
    if (this.touchController) {
      this.touchController.hide();
    }
  }

  // Cleanup
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    window.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    window.removeEventListener('blur', this.handleBlur.bind(this));

    if (this.touchController) {
      this.touchController.destroy();
    }
  }

  // Set control mode change callback
  setOnControlModeChange(callback: (mode: ControlMode) => void): void {
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
      const newMode = this.stateManager.toggleControlMode(this.isMobile);

      // Center mouse position when switching to mouse mode
      if (newMode === 'mouse') {
        this.stateManager.setMousePosition(
          this.canvas.width / 2,
          this.canvas.height * 0.7
        );
      }

      // Toggle touch controller mode if on mobile
      if (this.isMobile && this.touchController) {
        this.touchController.toggleMode();
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

    // Mobile touch controls
    if (this.isMobile && this.touchController) {
      const mode = state.controlMode;
      if (mode === 'joystick' || mode === 'tilt') {
        return this.touchController.steering;
      }
    }

    // Desktop controls
    if (state.controlMode === 'keyboard') {
      if (state.keys.ArrowLeft) return -1;
      if (state.keys.ArrowRight) return 1;
      return 0;
    } else if (state.controlMode === 'mouse') {
      const cx = this.canvas.width / 2;
      const dx = state.mouse.x - cx;
      return Math.min(1, Math.max(-1, dx / 250));
    }

    return 0;
  }

  // Get current throttle value (-1 to 1) for network
  getThrottle(): number {
    const state = this.stateManager.gameState;

    // Mobile touch controls
    if (this.isMobile && this.touchController) {
      const mode = state.controlMode;
      if (mode === 'joystick' || mode === 'tilt') {
        return this.touchController.throttle;
      }
    }

    // Desktop controls
    if (state.controlMode === 'keyboard') {
      if (state.keys.ArrowUp) return 1;
      if (state.keys.ArrowDown) return -1;
      return 0;
    } else if (state.controlMode === 'mouse') {
      const cy = this.canvas.height * 0.7;
      const dy = state.mouse.y - cy;

      if (dy < -20) {
        return Math.min(1, Math.abs(dy) / 200);
      } else if (dy > 20) {
        return -1;
      }
      return 0;
    }

    return 0;
  }

  // Check if running on mobile device
  isMobileDevice(): boolean {
    return this.isMobile;
  }
}
