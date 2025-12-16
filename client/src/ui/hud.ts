import { GameStateManager } from '@/game/state';

export class HUD {
  private stateManager: GameStateManager;

  // DOM elements
  private statusText: HTMLElement;
  private ratingDisplay: HTMLElement;
  private speedDisplay: HTMLElement;
  private controlModeDisplay: HTMLElement;
  private turnIndicator: HTMLElement;
  private turnDirection: HTMLElement;

  constructor(stateManager: GameStateManager) {
    this.stateManager = stateManager;

    // Get DOM elements
    this.statusText = document.getElementById('status-txt')!;
    this.ratingDisplay = document.getElementById('rating-display')!;
    this.speedDisplay = document.getElementById('speed-display')!;
    this.controlModeDisplay = document.getElementById('control-mode-display')!;
    this.turnIndicator = document.getElementById('turn-indicator')!;
    this.turnDirection = document.getElementById('turn-direction')!;
  }

  // Update HUD display
  update(): void {
    const { localPlayer } = this.stateManager.gameState;

    // Update speed
    const speedKmh = Math.floor(Math.abs(localPlayer.speed / 10));
    this.speedDisplay.textContent = `${speedKmh} km/h`;

    // Speed color
    if (speedKmh > 100) {
      this.speedDisplay.classList.add('speed-fast');
    } else {
      this.speedDisplay.classList.remove('speed-fast');
    }

    // Update rating
    this.ratingDisplay.textContent = Math.floor(localPlayer.rating).toLocaleString();
  }

  // Set connection status
  setStatus(status: string): void {
    this.statusText.textContent = status;
  }

  // Set control mode display
  setControlMode(mode: 'keyboard' | 'mouse'): void {
    this.controlModeDisplay.textContent = mode.toUpperCase();
    this.controlModeDisplay.classList.toggle('mouse-mode', mode === 'mouse');
  }

  // Show/hide turn warning
  setTurnWarning(show: boolean, direction?: 'left' | 'right'): void {
    if (show && direction) {
      this.turnIndicator.classList.remove('hidden');
      this.turnDirection.textContent = direction === 'right' ? 'RIGHT' : 'LEFT';
    } else {
      this.turnIndicator.classList.add('hidden');
    }
  }
}
