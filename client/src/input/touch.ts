import { ControlMode } from '@/types';

export type MobileControlMode = 'joystick' | 'tilt';

export class TouchController {
  private mode: MobileControlMode = 'joystick';
  private joystickContainer: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private modeToggle: HTMLElement | null = null;
  private modeIcon: HTMLElement | null = null;

  // Joystick state
  private joystickActive = false;
  private joystickStartX = 0;
  private joystickStartY = 0;
  private joystickX = 0;
  private joystickY = 0;
  private maxDistance = 50;

  // Tilt state
  private tiltX = 0;
  private tiltSupported = false;
  private tiltPermissionGranted = false;

  // Output values (-1 to 1)
  private _steering = 0;
  private _throttle = 0;

  // Callbacks
  private onModeChange?: (mode: ControlMode) => void;

  // Check if device is mobile/touch
  static isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  constructor() {
    // Check tilt support
    this.tiltSupported = 'DeviceOrientationEvent' in window;
  }

  // Initialize touch controls
  init(): void {
    // Get DOM elements
    this.joystickContainer = document.getElementById('mobile-joystick');
    this.joystickKnob = document.querySelector('.joystick-knob');
    this.modeToggle = document.getElementById('mobile-mode-toggle');
    this.modeIcon = document.getElementById('mobile-mode-icon');

    if (!this.joystickContainer || !this.joystickKnob || !this.modeToggle) {
      console.warn('Mobile control elements not found');
      return;
    }

    // Load saved mode
    const savedMode = localStorage.getItem('mobile_control_mode') as MobileControlMode;
    if (savedMode && (savedMode === 'joystick' || savedMode === 'tilt')) {
      this.mode = savedMode;
    }

    // Setup event listeners
    this.setupJoystick();
    this.setupModeToggle();

    // Update icon
    this.updateModeIcon();
  }

  // Show mobile controls
  show(): void {
    if (this.joystickContainer) {
      this.joystickContainer.classList.remove('hidden');
    }
    if (this.modeToggle) {
      this.modeToggle.classList.remove('hidden');
    }

    // Request tilt permission if in tilt mode
    if (this.mode === 'tilt') {
      this.requestTiltPermission();
    }
  }

  // Hide mobile controls
  hide(): void {
    if (this.joystickContainer) {
      this.joystickContainer.classList.add('hidden');
    }
    if (this.modeToggle) {
      this.modeToggle.classList.add('hidden');
    }
  }

  // Setup joystick touch events
  private setupJoystick(): void {
    if (!this.joystickContainer) return;

    const joystickBase = this.joystickContainer.querySelector('.joystick-base');
    if (!joystickBase) return;

    // Touch start
    joystickBase.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = (e as TouchEvent).touches[0];
      const rect = joystickBase.getBoundingClientRect();

      this.joystickActive = true;
      this.joystickStartX = rect.left + rect.width / 2;
      this.joystickStartY = rect.top + rect.height / 2;

      this.updateJoystick(touch.clientX, touch.clientY);
    }, { passive: false });

    // Touch move
    joystickBase.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.joystickActive) return;

      const touch = (e as TouchEvent).touches[0];
      this.updateJoystick(touch.clientX, touch.clientY);
    }, { passive: false });

    // Touch end
    const touchEnd = () => {
      this.joystickActive = false;
      this.joystickX = 0;
      this.joystickY = 0;
      this.resetKnobPosition();

      if (this.mode === 'joystick') {
        this._steering = 0;
        this._throttle = 0;
      }
    };

    joystickBase.addEventListener('touchend', touchEnd);
    joystickBase.addEventListener('touchcancel', touchEnd);
  }

  // Update joystick position
  private updateJoystick(touchX: number, touchY: number): void {
    let dx = touchX - this.joystickStartX;
    let dy = touchY - this.joystickStartY;

    // Calculate distance
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Clamp to max distance
    if (distance > this.maxDistance) {
      dx = (dx / distance) * this.maxDistance;
      dy = (dy / distance) * this.maxDistance;
    }

    this.joystickX = dx / this.maxDistance;
    this.joystickY = dy / this.maxDistance;

    // Update knob position
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // Update output values if in joystick mode
    if (this.mode === 'joystick') {
      this._steering = this.joystickX;
      this._throttle = -this.joystickY; // Invert Y: up = positive throttle
    }
  }

  // Reset knob to center
  private resetKnobPosition(): void {
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate(0, 0)';
    }
  }

  // Setup mode toggle button
  private setupModeToggle(): void {
    if (!this.modeToggle) return;

    this.modeToggle.addEventListener('click', () => {
      this.toggleMode();
    });
  }

  // Toggle between joystick and tilt modes
  toggleMode(): MobileControlMode {
    if (this.mode === 'joystick') {
      this.mode = 'tilt';
      this.requestTiltPermission();
    } else {
      this.mode = 'joystick';
      this.stopTilt();
    }

    // Save mode
    localStorage.setItem('mobile_control_mode', this.mode);

    // Update icon
    this.updateModeIcon();

    // Notify callback
    this.onModeChange?.(this.mode);

    return this.mode;
  }

  // Update mode icon
  private updateModeIcon(): void {
    if (!this.modeIcon) return;

    if (this.mode === 'joystick') {
      this.modeIcon.textContent = '🎮';
    } else {
      this.modeIcon.textContent = '📱';
    }
  }

  // Request tilt/orientation permission (required on iOS 13+)
  private async requestTiltPermission(): Promise<void> {
    if (!this.tiltSupported) {
      console.warn('Device orientation not supported');
      return;
    }

    // Check if permission API exists (iOS 13+)
    const DeviceOrientationEvent = window.DeviceOrientationEvent as typeof window.DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          this.tiltPermissionGranted = true;
          this.startTilt();
        }
      } catch (error) {
        console.warn('Tilt permission denied:', error);
      }
    } else {
      // Non-iOS or older iOS - permission not required
      this.tiltPermissionGranted = true;
      this.startTilt();
    }
  }

  // Start listening to tilt events
  private startTilt(): void {
    if (!this.tiltPermissionGranted) return;

    window.addEventListener('deviceorientation', this.handleTilt);
  }

  // Stop listening to tilt events
  private stopTilt(): void {
    window.removeEventListener('deviceorientation', this.handleTilt);
  }

  // Handle device orientation event
  private handleTilt = (e: DeviceOrientationEvent): void => {
    if (this.mode !== 'tilt') return;

    // gamma: left-right tilt (-90 to 90)
    // beta: front-back tilt (-180 to 180)
    const gamma = e.gamma ?? 0;
    const beta = e.beta ?? 0;

    // Normalize values
    // Steering: gamma (-30 to 30 degrees maps to -1 to 1)
    this.tiltX = Math.max(-1, Math.min(1, gamma / 30));

    // Throttle: beta (0 to 60 degrees maps to 0 to 1, 0 to -30 maps to 0 to -1)
    // Neutral position is around 45 degrees (phone held at angle)
    const neutralBeta = 45;
    const adjustedBeta = beta - neutralBeta;

    if (adjustedBeta < -15) {
      this._throttle = Math.min(1, Math.abs(adjustedBeta + 15) / 30);
    } else if (adjustedBeta > 15) {
      this._throttle = -1;
    } else {
      this._throttle = 0;
    }

    this._steering = this.tiltX;
  };

  // Set mode change callback
  setOnModeChange(callback: (mode: ControlMode) => void): void {
    this.onModeChange = callback;
  }

  // Get current steering value (-1 to 1)
  get steering(): number {
    return this._steering;
  }

  // Get current throttle value (-1 to 1)
  get throttle(): number {
    return this._throttle;
  }

  // Get current mode
  getMode(): MobileControlMode {
    return this.mode;
  }

  // Get mode as ControlMode type
  getControlMode(): ControlMode {
    return this.mode;
  }

  // Cleanup
  destroy(): void {
    this.stopTilt();
    this.joystickActive = false;
    this._steering = 0;
    this._throttle = 0;
  }
}
