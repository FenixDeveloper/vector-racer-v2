import { ColorPalette } from '@/types';
import { LANG } from '@/lang';

export class Screens {
  // DOM elements
  private startScreen: HTMLElement;
  private wastedScreen: HTMLElement;
  private welcomeName: HTMLElement;
  private colorSelector: HTMLElement;
  private joinButton: HTMLElement;
  private errorMessage: HTMLElement;

  // Callbacks
  private onJoin?: (colorIndex: number) => void;
  private onColorChange?: (colorIndex: number) => void;

  // State
  private selectedColorIndex = 0;

  constructor() {
    this.startScreen = document.getElementById('start-screen')!;
    this.wastedScreen = document.getElementById('wasted-screen')!;
    this.welcomeName = document.getElementById('welcome-name')!;
    this.colorSelector = document.getElementById('color-selector')!;
    this.joinButton = document.getElementById('join-btn')!;
    this.errorMessage = document.getElementById('error-msg')!;

    this.setupColorSelector();
    this.setupJoinButton();
  }

  // Set up color selector buttons
  private setupColorSelector(): void {
    // Create color buttons
    ColorPalette.slice(0, 8).forEach((color, index) => {
      const button = document.createElement('button');
      button.className = `color-btn ${index === 0 ? 'selected' : ''}`;
      button.style.backgroundColor = color;
      button.addEventListener('click', () => this.selectColor(index, button));
      this.colorSelector.appendChild(button);
    });
  }

  // Handle color selection
  private selectColor(index: number, button: HTMLElement): void {
    // Remove selected from all
    this.colorSelector.querySelectorAll('.color-btn').forEach((btn) => {
      btn.classList.remove('selected');
    });

    // Add selected to clicked
    button.classList.add('selected');
    this.selectedColorIndex = index;

    this.onColorChange?.(index);
  }

  // Set up join button
  private setupJoinButton(): void {
    this.joinButton.addEventListener('click', () => {
      this.onJoin?.(this.selectedColorIndex);
    });
  }

  // Set player name in welcome message
  setPlayerName(name: string): void {
    this.welcomeName.textContent = LANG.welcome(name);
  }

  // Show start screen
  showStartScreen(): void {
    this.startScreen.classList.remove('hidden');
    this.wastedScreen.classList.add('hidden');
  }

  // Hide start screen
  hideStartScreen(): void {
    this.startScreen.classList.add('hidden');
  }

  // Show wasted screen
  showWastedScreen(): void {
    this.wastedScreen.classList.remove('hidden');
    document.body.classList.add('shake');
  }

  // Hide wasted screen
  hideWastedScreen(): void {
    this.wastedScreen.classList.add('hidden');
    document.body.classList.remove('shake');
  }

  // Show error message
  showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
  }

  // Hide error message
  hideError(): void {
    this.errorMessage.classList.add('hidden');
  }

  // Set join callback
  setOnJoin(callback: (colorIndex: number) => void): void {
    this.onJoin = callback;
  }

  // Set color change callback
  setOnColorChange(callback: (colorIndex: number) => void): void {
    this.onColorChange = callback;
  }

  // Get selected color index
  getSelectedColorIndex(): number {
    return this.selectedColorIndex;
  }
}
