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
  }));

  const viewer = state.players.find((p) => p.id === viewerId);
  const myHand = viewer ? viewer.hand : [];

  const teamSequenceCounts: Record<Team, number> = { red: 0, blue: 0, green: 0 };
  for (const s of state.sequences) teamSequenceCounts[s.team]++;

  const top = state.discardPile[state.discardPile.length - 1] ?? null;

  return {
    board: state.board,
    chips: state.chips,
    players,
    myHand,
    turnIdx: state.turnIdx,
    drawPileCount: state.drawPile.length,
    discardPileTop: top,
    sequences: state.sequences,
    lockedChips: Array.from(state.lockedChips),
    winner: state.winner,
    discardedThisTurn: state.discardedThisTurn,
    sequencesToWin: state.config.sequencesToWin,
    teamSequenceCounts,
    deck: null, // server overrides with the Room's manifest if any
  };
}

export { posKey };
