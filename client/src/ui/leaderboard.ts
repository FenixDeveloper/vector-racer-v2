import { GameStateManager } from '@/game/state';
import { LeaderboardEntry } from '@/types';

export class Leaderboard {
  private stateManager: GameStateManager;
  private element: HTMLElement;

  constructor(stateManager: GameStateManager) {
    this.stateManager = stateManager;
    this.element = document.getElementById('leaderboard')!;
  }

  // Update leaderboard display
  update(): void {
    const { localPlayer, remotePlayers } = this.stateManager.gameState;

    // Build player list
    const players: LeaderboardEntry[] = [];

    // Add local player
    if (localPlayer.id) {
      players.push({
        name: localPlayer.name,
        rating: localPlayer.rating,
        isLocal: true,
      });
    }

    // Add remote players
    remotePlayers.forEach((p) => {
      players.push({
        name: p.name,
        rating: p.rating,
        isLocal: false,
      });
    });

    // Sort by rating (descending)
    players.sort((a, b) => b.rating - a.rating);

    // Get top 10
    const top10 = players.slice(0, 10);

    // Find local player rank
    const myRank = players.findIndex((p) => p.isLocal);
    const isInTop10 = myRank < 10 && myRank !== -1;

    // Build HTML
    let html = top10
      .map(
        (p, i) => `
        <li class="${p.isLocal ? 'local-player' : ''}">
          <div class="player-info">
            <span class="rank">${i + 1}</span>
            <span class="name">${this.escapeHtml(p.name)}</span>
          </div>
          <span class="rating">${Math.floor(p.rating).toLocaleString()}</span>
        </li>
      `
      )
      .join('');

    // Add local player if not in top 10
    if (!isInTop10 && myRank !== -1) {
      const me = players[myRank];
      html += `
        <li class="separator">...</li>
        <li class="local-player">
          <div class="player-info">
            <span class="rank">${myRank + 1}</span>
            <span class="name">${this.escapeHtml(me.name)}</span>
          </div>
          <span class="rating">${Math.floor(me.rating).toLocaleString()}</span>
        </li>
      `;
    }

    this.element.innerHTML = html || '<li class="placeholder">No players</li>';
  }

  // Escape HTML to prevent XSS
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
