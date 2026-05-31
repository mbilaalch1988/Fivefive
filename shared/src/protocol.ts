import type { Action, ActionLog, BoardSquare, Card, Chip, Team, PlayerId, Sequence } from "./types.js";

/* ------------------------------------------------------------------ */
/* Deck (card-art) manifests                                          */
/* ------------------------------------------------------------------ */

/** A card-art deck. URLs are relative to /decks/<id>/ on the server. */
export interface DeckManifest {
  id: string;
  name: string;
  /** Path (relative to /decks/<id>/) of the card-back image. */
  back: string;
  /** Map from card code "RS"/"2H"/"TC"/... to image path. */
  cards: Record<string, string>;
}

/** Summary shown in lobby UI (excludes the full card map). */
export interface DeckSummary {
  id: string;
  name: string;
}

/** Paginated leaderboard slice. */
export interface PaginatedScoreboard {
  rows: ScoreboardEntry[];
  total: number;
  page: number;
  perPage: number;
}

/* ------------------------------------------------------------------ */
/* Global leaderboard                                                 */
/* ------------------------------------------------------------------ */

export interface ScoreboardEntry {
  name: string;
  wins: number;
  games: number;
  /** 0.0 to 1.0; 0 when games == 0. */
  ratio: number;
  /** Career sequences personally closed across all games (players only). 0 for teams. */
  sequencesClosed?: number;
  /** Career count of "winning sequences" closed (the one that triggered a win). */
  winningSequencesClosed?: number;
  /** Career MVP-credit count (players only). 0 for teams. */
  mvpGames?: number;
  /** Career points (sequences × 5 + winning sequences × 5 + MVPs × 10). */
  points?: number;
  /** True when this row is a signed-in user (stats keyed by Supabase user_id). */
  verified?: boolean;
}

export interface ScoreboardResponse {
  /** Top 5 players by career points (the headline ranking). */
  topPlayersByPoints: ScoreboardEntry[];
  /** Top 5 players by total wins. */
  topPlayers: ScoreboardEntry[];
  /** Top 5 teams by total wins. */
  topTeams: ScoreboardEntry[];
  /** Top 5 players by lifetime sequences-closed. */
  topPlayersBySequences: ScoreboardEntry[];
  /** Top 5 players by MVP-game count. */
  topPlayersByMvp: ScoreboardEntry[];
  /** True when the response came from Postgres; false = nothing persisted yet. */
  persisted: boolean;
}

/* ------------------------------------------------------------------ */
/* Lobby                                                              */
/* ------------------------------------------------------------------ */

export interface Seat {
  id: PlayerId;
  name: string;
  team: Team | null; // null = unseated
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  hostId: PlayerId;
  seats: Seat[];
  inGame: boolean;
  /** Display names for each team (host-customizable). */
  teamNames: Record<Team, string>;
  /** Cumulative team wins in this room session. */
  teamScores: Record<Team, number>;
  /** Cumulative player wins keyed by display name. */
  playerScores: Record<string, number>;
  /** Total games completed in this room. */
  gamesPlayed: number;
}

/* ------------------------------------------------------------------ */
/* Game view (per-player, with hidden info redacted)                  */
/* ------------------------------------------------------------------ */

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  team: Team;
  handCount: number;
  connected: boolean;
  isCurrentTurn: boolean;
  /** Per-player stats for the current game. */
  chipsPlaced: number;
  chipsRemoved: number;
  sequencesClosed: number;
}

export interface GameView {
  board: BoardSquare[][];
  chips: Chip[][];
  players: PlayerPublic[];
  /** Cards held by the viewer (empty if spectator). */
  myHand: Card[];
  /** Index into `players` whose turn it is. */
  turnIdx: number;
  drawPileCount: number;
  discardPileTop: Card | null;
  sequences: Sequence[];
  /** Locked chip keys "r,c" — chips already part of a completed sequence. */
  lockedChips: string[];
  winner: Team | null;
  discardedThisTurn: boolean;
  sequencesToWin: number;
  teamSequenceCounts: Record<Team, number>;
  /** Card-art manifest if the host picked a deck; null = built-in CSS rendering. */
  deck: DeckManifest | null;
  /** Display names for each team. */
  teamNames: Record<Team, string>;
  /** Player names crowned MVP this game. Empty until winner is non-null. */
  mvpNames: string[];
  /** Last 10 actions (most recent at end). Client renders the last 5 in popup. */
  recentActions: ActionLog[];
}

/* ------------------------------------------------------------------ */
/* Wire events                                                        */
/* ------------------------------------------------------------------ */

/** Client → server events with ack payload shape. */
export interface ClientToServerEvents {
  createRoom: (
    payload: { playerName: string; authToken?: string },
    ack: (res: AckResult<{ roomCode: string; playerId: PlayerId; room: RoomView }>) => void,
  ) => void;
  joinRoom: (
    payload: { roomCode: string; playerName: string; authToken?: string },
    ack: (res: AckResult<{ playerId: PlayerId; room: RoomView }>) => void,
  ) => void;
  rejoin: (
    payload: { roomCode: string; playerId: PlayerId },
    ack: (res: AckResult<{ room: RoomView; game: GameView | null }>) => void,
  ) => void;
  chooseTeam: (
    payload: { team: Team },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  setReady: (
    payload: { ready: boolean },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  startGame: (
    payload: { sequencesToWin?: number; deckId?: string | null },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  stopGame: (ack: (res: AckResult<{}>) => void) => void;
  renameTeam: (
    payload: { team: Team; name: string },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  doAction: (
    payload: Action,
    ack: (res: AckResult<{}>) => void,
  ) => void;
  leaveRoom: (ack: (res: AckResult<{}>) => void) => void;
}

/** Server → client broadcast events. */
export interface ServerToClientEvents {
  room: (room: RoomView) => void;
  game: (game: GameView) => void;
  errorMsg: (message: string) => void;
}

export type AckResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
