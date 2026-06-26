import type { Action, ActionLog, BoardSquare, Card, Chip, Team, PlayerId, Fivefive } from "./types.js";

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
  /** Career fivefives personally closed across all games (players only). 0 for teams. */
  fivefivesClosed?: number;
  /** Career count of "winning fivefives" closed (the one that triggered a win). */
  winningFivefivesClosed?: number;
  /** Career MVP-credit count (players only). 0 for teams. */
  mvpGames?: number;
  /** Career points (fivefives × 5 + winning fivefives × 5 + MVPs × 10). */
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
  /** Top 5 players by lifetime fivefives-closed. */
  topPlayersByFivefives: ScoreboardEntry[];
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
  /** True for server-side AI seats. */
  isBot: boolean;
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
  /** Number of read-only spectators currently watching. */
  spectatorCount: number;
  /** Epoch ms when the game will auto-start (everyone ready), or null. */
  autoStartAt: number | null;
  /** UUID of the currently-running (or just-finished) game. Lets the
   *  win-overlay open Faizi analysis. Null until first game starts. */
  gameId: string | null;
  /** Host-chosen pre-game settings. Auto-start reads these so it doesn't
   *  silently revert to defaults. Manual host start uses these too unless
   *  the host overrides on the way out the door. Null fields = use the
   *  engine default for that knob (defaultFivefivesToWin / built-in deck /
   *  no timer). Broadcast in the room view so a host who refreshes mid-
   *  lobby sees their previous picks restored. */
  lobbySettings: {
    fivefivesToWin: number | null;
    deckId: string | null;
    turnTimerSec: number | null;
  };
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
  fivefivesClosed: number;
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
  fivefives: Fivefive[];
  /** Locked chip keys "r,c" — chips already part of a completed fivefive. */
  lockedChips: string[];
  winner: Team | null;
  discardedThisTurn: boolean;
  fivefivesToWin: number;
  teamFivefiveCounts: Record<Team, number>;
  /** Card-art manifest if the host picked a deck; null = built-in CSS rendering. */
  deck: DeckManifest | null;
  /** Display names for each team. */
  teamNames: Record<Team, string>;
  /** Player names crowned MVP this game. Empty until winner is non-null. */
  mvpNames: string[];
  /** Last 10 actions (most recent at end). Client renders the last 5 in popup. */
  recentActions: ActionLog[];
  /** Per-turn timer setting (seconds). null = no timer. */
  turnTimerSec: number | null;
  /** Epoch ms when the current turn auto-plays; null if no timer or before start. */
  turnExpiresAt: number | null;
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
  joinAsSpectator: (
    payload: { roomCode: string; spectatorName: string; authToken?: string },
    ack: (
      res: AckResult<{ spectatorId: string; room: RoomView; game: GameView | null }>,
    ) => void,
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
  /** Host-only. Persists a pre-game setting on the room so the auto-start
   *  countdown (and any future games in the same room) uses it. Pass only
   *  the fields you're changing; omitted fields stay as-is. Passing null
   *  for a field clears it (reverts that knob to the engine default). */
  updateLobbySettings: (
    payload: {
      fivefivesToWin?: number | null;
      deckId?: string | null;
      turnTimerSec?: number | null;
    },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  startGame: (
    payload: {
      fivefivesToWin?: number;
      deckId?: string | null;
      /** 0 / null = off, otherwise 30/60/90 second per-turn auto-play timer. */
      turnTimerSec?: number | null;
    },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  stopGame: (ack: (res: AckResult<{}>) => void) => void;
  addBot: (
    payload: { team: Team; difficulty: "easy" | "medium" | "hard" },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  removeBot: (
    payload: { playerId: PlayerId },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  renameTeam: (
    payload: { team: Team; name: string },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  sendSticker: (
    payload: { stickerId: string },
    ack: (res: AckResult<{}>) => void,
  ) => void;
  sendQuickChat: (
    payload: { chatId: string },
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
  sticker: (payload: StickerBroadcast) => void;
  quickChat: (payload: QuickChatBroadcast) => void;
}

export interface StickerBroadcast {
  /** Player who sent it. */
  fromPlayerId: PlayerId;
  fromName: string;
  stickerId: string;
  /** Server-assigned id, lets client dedupe + key overlay elements. */
  eventId: string;
}

export interface QuickChatBroadcast {
  fromPlayerId: PlayerId;
  fromName: string;
  /** Team color of the sender — lets the bubble tint to match. */
  fromTeam: Team | null;
  chatId: string;
  eventId: string;
}

export type AckResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Replay API                                                         */
/* ------------------------------------------------------------------ */

/** Lightweight summary row for the "recent games" list. */
export interface ReplaySummary {
  gameId: string;
  roomCode: string;
  startedAt: string;
  finishedAt: string | null;
  winningTeam: Team | null;
  /** Display name of the winning team, when known. */
  winningTeamName: string | null;
  /** Total action count (proxy for game length). */
  actionCount: number;
  /** Player names involved (up to 8). */
  playerNames: string[];
}

export interface ReplayPlayer {
  id: PlayerId;
  name: string;
  team: Team;
}

export interface ReplayAction {
  index: number;
  playerName: string;
  team: Team;
  rank: import("./types.js").Rank;
  suit: import("./types.js").Suit;
  type: "place" | "remove" | "discardDead";
  /** Board position; null for discardDead. */
  pos: { r: number; c: number } | null;
}

export interface ReplayDetail {
  gameId: string;
  roomCode: string;
  deckId: string | null;
  fivefivesToWin: number;
  teamNames: Record<Team, string>;
  players: ReplayPlayer[];
  startedAt: string;
  finishedAt: string | null;
  winningTeam: Team | null;
  actions: ReplayAction[];
}
