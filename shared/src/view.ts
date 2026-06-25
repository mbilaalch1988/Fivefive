import { posKey } from "./board.js";
import type { GameView, PlayerPublic } from "./protocol.js";
import type { GameState, PlayerId, Team } from "./types.js";

export function toGameView(state: GameState, viewerId: PlayerId | null): GameView {
  const players: PlayerPublic[] = state.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    handCount: p.hand.length,
    connected: true, // server overlays real connection state where needed
    isCurrentTurn: i === state.turnIdx,
    chipsPlaced: p.stats.chipsPlaced,
    chipsRemoved: p.stats.chipsRemoved,
    fivefivesClosed: p.stats.fivefivesClosed,
  }));

  const viewer = state.players.find((p) => p.id === viewerId);
  const myHand = viewer ? viewer.hand : [];

  const teamFivefiveCounts: Record<Team, number> = { red: 0, blue: 0, green: 0 };
  for (const s of state.fivefives) teamFivefiveCounts[s.team]++;

  const top = state.discardPile[state.discardPile.length - 1] ?? null;

  return {
    board: state.board,
    chips: state.chips,
    players,
    myHand,
    turnIdx: state.turnIdx,
    drawPileCount: state.drawPile.length,
    discardPileTop: top,
    fivefives: state.fivefives,
    lockedChips: Array.from(state.lockedChips),
    winner: state.winner,
    discardedThisTurn: state.discardedThisTurn,
    fivefivesToWin: state.config.fivefivesToWin,
    teamFivefiveCounts,
    deck: null, // server overrides with the Room's manifest if any
    teamNames: { red: "Red", blue: "Blue", green: "Green" },
    mvpNames: [], // server fills this in after recording the win
    recentActions: state.actionLog.slice(-5),
    turnTimerSec: null,   // server overlays from Room config
    turnExpiresAt: null,  // server overlays from Room scheduling state
  };
}

export { posKey };
