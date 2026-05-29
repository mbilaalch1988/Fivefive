import type { Action, BoardSquare, Card, Chip, Team, PlayerId, Sequence } from "./types.js";

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
}

/* ------------------------------------------------------------------ */
/* Wire events                                                        */
/* ------------------------------------------------------------------ */

/** Client → server events with ack payload shape. */
export interface ClientToServerEvents {
  createRoom: (
    payload: { playerName: string },
    ack: (res: AckResult<{ roomCode: string; playerId: PlayerId; room: RoomView }>) => void,
  ) => void;
  joinRoom: (
    payload: { roomCode: string; playerName: string },
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
