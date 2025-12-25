import './styles/main.css';

import { CONFIG, getRoadCurve } from './config';
import { gameState, GameStateManager } from './game/state';
import { Physics } from './game/physics';
import { Renderer } from './render/renderer';
import { InputHandler } from './input/handler';
import { NetworkClient, NetworkCallbacks } from './network/client';
import { protocol } from './network/protocol';
import { HUD } from './ui/hud';
import { Leaderboard } from './ui/leaderboard';
import { Screens } from './ui/screens';
import { NetworkPlayerData } from './types';

class Game {
  private canvas: HTMLCanvasElement;
  private stateManager: GameStateManager;
  private physics: Physics;
  private renderer: Renderer;
  private inputHandler: InputHandler;
  private network: NetworkClient;
  private hud: HUD;
  private leaderboard: Leaderboard;
  private screens: Screens;

  private lastTime = 0;
  private lastSyncTime = 0;
  private animationFrameId: number | null = null;
  private physicsAccumulator = 0;
  private readonly PHYSICS_STEP = 1 / 60; // Fixed 60Hz physics

  constructor() {
    // Get canvas
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas not found');
    }

    // Initialize modules
    this.stateManager = gameState;
    this.physics = new Physics(this.stateManager);
    this.renderer = new Renderer(this.canvas, this.stateManager);
    this.inputHandler = new InputHandler(this.stateManager, this.canvas);

    // Initialize UI
    this.hud = new HUD(this.stateManager);
    this.leaderboard = new Leaderboard(this.stateManager);
    this.screens = new Screens();

    // Initialize network
    this.network = new NetworkClient(this.createNetworkCallbacks());

    this.setupUI();
  }

  // Create network callbacks
  private createNetworkCallbacks(): NetworkCallbacks {
    return {
      onConnect: () => {
        this.stateManager.setConnected(true);
        this.hud.setStatus('Connected');
      },

      onDisconnect: () => {
        this.stateManager.setConnected(false);
        this.hud.setStatus('Disconnected');
        this.stopGame();
        this.screens.showStartScreen();
      },

      onStateUpdate: (_tick: number, players: NetworkPlayerData[]) => {
        // Update remote players from server state
        const activeIds = new Set<number>();

        players.forEach((p) => {
          if (p.id === this.stateManager.localPlayer.id) {
            // Update local player from server (authoritative)
            // Only update position if significantly different (anti-cheat correction)
            // Smooth correction toward server position (no hard snaps)
            const local = this.stateManager.localPlayer;
            const correctionSpeed = 0.1; // 10% per update toward server
            local.x += (p.x - local.x) * correctionSpeed;
            local.y += (p.y - local.y) * correctionSpeed;

            // Always sync rating from server
            local.rating = p.rating;
            local.exploded = protocol.isExploded(p.flags);
          } else {
            // Remote player
            activeIds.add(p.id);
            this.stateManager.updateRemotePlayer(p.id, {
              x: p.x,
              y: p.y,
              speed: p.speed,
              angle: p.angle,
              rating: p.rating,
              color: protocol.getColorHex(p.color),
              exploded: protocol.isExploded(p.flags),
            });
          }
        });

        // Remove players not in update
        this.stateManager.remotePlayers.forEach((_, id) => {
          if (!activeIds.has(id) && id !== this.stateManager.localPlayer.id) {
            this.stateManager.removeRemotePlayer(id);
          }
        });

        // Update leaderboard
        this.leaderboard.update();
      },

      onPlayerJoin: (id: number, name: string, color: number) => {
        this.stateManager.updateRemotePlayer(id, {
          name,
          color: protocol.getColorHex(color),
        });
      },

      onPlayerLeave: (id: number) => {
        this.stateManager.removeRemotePlayer(id);
        this.leaderboard.update();
      },

      onRoomInfo: (roomId: string, _playerCount: number, _maxPlayers: number, yourId: number) => {
        this.stateManager.setPlayerId(yourId);
        this.hud.setStatus(`Room: ${roomId.slice(0, 8)}`);
      },

      onError: (_code: number, message: string) => {
        this.screens.showError(message);
      },

      onLatencyUpdate: (_latency: number) => {
        // Could display latency in UI if needed
      },
    };
  }

  // Setup UI event handlers
  private setupUI(): void {
    // Set player name
    this.screens.setPlayerName(this.stateManager.localPlayer.name);

    // Color selection
    this.screens.setOnColorChange((colorIndex) => {
      this.stateManager.setColor(colorIndex);
    });

    // Join button
    this.screens.setOnJoin((colorIndex) => {
      this.stateManager.setColor(colorIndex);
      this.startGame();
    });

    // Control mode change
    this.inputHandler.setOnControlModeChange((mode) => {
      this.hud.setControlMode(mode);
    });

    // Initialize input handler
    this.inputHandler.init();
  }

  // Start the game
  private startGame(): void {
    // Connect to server if not connected
    if (!this.stateManager.gameState.connected) {
      this.network.connect();
    }

    // Join room
    const name = this.stateManager.localPlayer.name;
    const colorIndex = this.stateManager.getColorIndex();
    this.network.joinRoom(name, colorIndex);

    // Start game state
    this.stateManager.startGame();

    // Center mouse if in mouse mode
    if (this.stateManager.controlMode === 'mouse') {
      this.stateManager.setMousePosition(
        this.canvas.width / 2,
        this.canvas.height * CONFIG.CAMERA_Y_OFFSET
      );
    }

    // Hide start screen
    this.screens.hideStartScreen();
    this.hud.setControlMode(this.stateManager.controlMode);

    // Start game loop
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  // Stop the game
  private stopGame(): void {
    this.stateManager.stopGame();

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.network.leaveRoom();
  }

  // Main game loop
  private gameLoop(timestamp: number): void {
    if (!this.stateManager.isRunning) return;

    // Calculate delta time and accumulate
    const frameTime = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    this.physicsAccumulator += frameTime;

    // Handle explosion and respawn
    this.handleExplosionState();

    // Fixed timestep physics - run multiple steps if needed
    while (this.physicsAccumulator >= this.PHYSICS_STEP) {
      this.physics.update(this.PHYSICS_STEP, this.canvas);
      this.physicsAccumulator -= this.PHYSICS_STEP;
    }

    // These can run at variable rate
    this.physics.updateRemotePlayers();
    this.physics.updateParticles(frameTime);

    // Predict turns
    const turnPrediction = this.physics.predictTurn();
    this.hud.setTurnWarning(turnPrediction.isSharp, turnPrediction.direction ?? undefined);

    // Render
    this.renderer.render();

    // Update HUD
    this.hud.update();

    // Send input to server
    this.sendInput(timestamp);

    // Request next frame
    this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // Send input to server
  private sendInput(timestamp: number): void {
    if (timestamp - this.lastSyncTime < CONFIG.SYNC_RATE_MS) {
      return;
    }
    this.lastSyncTime = timestamp;

    const steering = this.inputHandler.getSteering();
    const throttle = this.inputHandler.getThrottle();

    this.network.sendInput(
      this.stateManager.gameState.keys,
      steering,
      throttle
    );
  }

  // Handle explosion state
  private handleExplosionState(): void {
    const { localPlayer } = this.stateManager.gameState;

    if (localPlayer.exploded && !this.isWastedScreenVisible()) {
      // Show wasted screen
      this.screens.showWastedScreen();

      // Schedule respawn
      setTimeout(() => {
        this.stateManager.respawnPlayer(getRoadCurve);
        this.screens.hideWastedScreen();
      }, CONFIG.RESPAWN_DELAY_MS);
    }
  }

  // Check if wasted screen is visible
  private isWastedScreenVisible(): boolean {
    const wastedScreen = document.getElementById('wasted-screen');
    return wastedScreen ? !wastedScreen.classList.contains('hidden') : false;
  }

  // Initialize and start
  async init(): Promise<void> {
    // Pre-connect to server
    this.network.connect();
  }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const game = new Game();
  await game.init();
});
