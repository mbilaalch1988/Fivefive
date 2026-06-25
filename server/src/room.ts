import {
  applyAction,
  createInitialState,
  toGameView,
  type Action,
  type DeckManifest,
  type GameState,
  type GameView,
  type PlayerId,
  type RoomView,
  type Seat,
  type SeatInput,
  type Team,
} from "@fivefive/shared";
import { randomUUID } from "node:crypto";
import {
  loadRoomState,
  persistGameAction,
  persistGameFinish,
  persistGameStart,
  persistTeamName,
  persistWin,
  type PlayerGameContribution,
  type WinRecord,
} from "./db.js";

interface RoomSeat {
  id: PlayerId;
  name: string;
  team: Team | null;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  /** Supabase auth.users.id if this player signed in; null = anonymous. */
  userId: string | null;
  /** True when this seat is filled by a server-side AI. */
  isBot: boolean;
  /** Difficulty hint for the bot decision engine. */
  botDifficulty: "easy" | "medium" | "hard" | null;
}

interface RoomSpectator {
  id: string;
  name: string;
  socketId: string;
  userId: string | null;
}

const TEAM_ORDER: Team[] = ["red", "blue", "green"];
const MAX_TEAM_NAME = 24;

export class Room {
  readonly code: string;
  hostId: PlayerId;
  seats: RoomSeat[] = [];
  spectators: RoomSpectator[] = [];
  game: GameState | null = null;
  /** UUID assigned at start, used for the replay log. Null while no game running. */
  gameId: string | null = null;
  /** How many action-log entries we've persisted for the current game. */
  private persistedActionCount = 0;
  /** Epoch ms when the lobby will auto-start; null when nobody-ready or already running. */
  autoStartAt: number | null = null;
  /** Per-turn timer setting (seconds). null = off, chosen by host at startGame. */
  turnTimerSec: number | null = null;
  /** Epoch ms when the current player's turn will auto-play. Null when no timer or game over. */
  turnExpiresAt: number | null = null;
  /** MVP player names from the most recently-completed game (cleared on next start). */
  lastMvpNames: string[] = [];
  deck: DeckManifest | null = null;
  teamNames: Record<Team, string> = { red: "Red", blue: "Blue", green: "Green" };
  teamScores: Record<Team, number> = { red: 0, blue: 0, green: 0 };
  playerScores: Record<string, number> = {};
  gamesPlayed = 0;

  constructor(
    code: string,
    host: { id: PlayerId; name: string; socketId: string; userId: string | null },
  ) {
    this.code = code;
    this.hostId = host.id;
    this.seats.push({
      id: host.id,
      name: host.name,
      team: null,
      ready: false,
      connected: true,
      socketId: host.socketId,
      userId: host.userId,
      isBot: false,
      botDifficulty: null,
    });
    // Fire-and-forget: if Postgres is connected and this room code was used
    // before (e.g. server restart), rehydrate the scoreboard + team names.
    void this.tryRehydrate();
  }

  private async tryRehydrate(): Promise<void> {
    const persisted = await loadRoomState(this.code);
    if (!persisted) return;
    this.gamesPlayed = persisted.gamesPlayed;
    this.teamNames = persisted.teamNames;
    this.teamScores = persisted.teamScores;
    this.playerScores = persisted.playerScores;
  }

  addPlayer(p: {
    id: PlayerId;
    name: string;
    socketId: string;
    userId: string | null;
  }): void {
    if (this.game) throw new Error("game already started");
    if (this.seats.length >= 12) throw new Error("room is full");
    this.seats.push({
      id: p.id,
      name: p.name,
      team: null,
      ready: false,
      connected: true,
      socketId: p.socketId,
      userId: p.userId,
      isBot: false,
      botDifficulty: null,
    });
  }

  /** Add a bot seat. Host-gated upstream. Bots are auto-ready + always
   *  "connected" so they don't trigger the reconnect indicator. */
  addBot(team: Team, difficulty: "easy" | "medium" | "hard"): RoomSeat {
    if (this.game) throw new Error("game already started");
    if (this.seats.length >= 12) throw new Error("room is full");
    const botCount = this.seats.filter((s) => s.isBot).length + 1;
    const name = `${difficulty === "easy" ? "Easy" : difficulty === "medium" ? "Medium" : "Hard"} bot ${botCount}`;
    const seat: RoomSeat = {
      id: `bot-${this.code}-${botCount}-${Date.now().toString(36)}`,
      name,
      team,
      ready: true,
      connected: true,
      socketId: null,
      userId: null,
      isBot: true,
      botDifficulty: difficulty,
    };
    this.seats.push(seat);
    return seat;
  }

  removeBot(playerId: PlayerId): void {
    if (this.game) throw new Error("cannot remove bot mid-game");
    const idx = this.seats.findIndex((s) => s.id === playerId && s.isBot);
    if (idx < 0) throw new Error("not a bot seat");
    this.seats.splice(idx, 1);
  }

  attachSocket(playerId: PlayerId, socketId: string): boolean {
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat) return false;
    seat.socketId = socketId;
    seat.connected = true;
    return true;
  }

  markDisconnected(socketId: string): RoomSeat | null {
    const seat = this.seats.find((s) => s.socketId === socketId);
    if (!seat) return null;
    seat.connected = false;
    seat.socketId = null;
    return seat;
  }

  addSpectator(s: {
    id: string;
    name: string;
    socketId: string;
    userId: string | null;
  }): void {
    if (this.spectators.length >= 20) throw new Error("too many spectators");
    this.spectators.push({
      id: s.id,
      name: s.name,
      socketId: s.socketId,
      userId: s.userId,
    });
  }

  removeSpectatorBySocketId(socketId: string): RoomSpectator | null {
    const idx = this.spectators.findIndex((s) => s.socketId === socketId);
    if (idx < 0) return null;
    return this.spectators.splice(idx, 1)[0] ?? null;
  }

  spectatorBySocketId(socketId: string): RoomSpectator | undefined {
    return this.spectators.find((s) => s.socketId === socketId);
  }

  removePlayer(playerId: PlayerId): void {
    if (this.game) throw new Error("cannot leave: game in progress");
    const idx = this.seats.findIndex((s) => s.id === playerId);
    if (idx < 0) return;
    this.seats.splice(idx, 1);
    if (this.hostId === playerId && this.seats.length > 0) {
      this.hostId = this.seats[0]!.id;
    }
  }

  isEmpty(): boolean {
    return this.seats.length === 0 && this.spectators.length === 0;
  }

  chooseTeam(playerId: PlayerId, team: Team): void {
    if (this.game) throw new Error("game already started");
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat) throw new Error("not in room");
    seat.team = team;
    seat.ready = false;
  }

  setReady(playerId: PlayerId, ready: boolean): void {
    if (this.game) throw new Error("game already started");
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat) throw new Error("not in room");
    if (ready && seat.team === null) throw new Error("pick a team first");
    seat.ready = ready;
  }

  renameTeam(team: Team, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("name required");
    if (trimmed.length > MAX_TEAM_NAME) {
      throw new Error(`name too long (max ${MAX_TEAM_NAME})`);
    }
    this.teamNames[team] = trimmed;
    void persistTeamName(this.code, team, trimmed);
  }

  canStart(): boolean {
    if (this.game) return false;
    if (this.seats.length < 2) return false;
    // Every seat must have picked a team, be ready, and be reachable
    // (bots count as connected). A disconnected player blocks auto-start
    // until they rejoin or are removed.
    if (
      !this.seats.every(
        (s) => s.team !== null && s.ready && (s.connected || s.isBot),
      )
    ) {
      return false;
    }
    // Need at least one human, otherwise nobody's watching.
    if (!this.seats.some((s) => !s.isBot)) return false;
    const teams = new Set(this.seats.map((s) => s.team));
    if (teams.size < 2) return false;
    const counts = new Map<Team, number>();
    for (const s of this.seats) {
      counts.set(s.team!, (counts.get(s.team!) ?? 0) + 1);
    }
    const sizes = [...counts.values()];
    return sizes.every((n) => n === sizes[0]);
  }

  /** True if it's currently a bot's turn. */
  isBotTurn(): { seat: RoomSeat; difficulty: "easy" | "medium" | "hard" } | null {
    if (!this.game || this.game.winner) return null;
    const currentId = this.game.players[this.game.turnIdx]?.id;
    if (!currentId) return null;
    const seat = this.seats.find((s) => s.id === currentId);
    if (!seat || !seat.isBot || !seat.botDifficulty) return null;
    return { seat, difficulty: seat.botDifficulty };
  }

  start(
    opts: {
      fivefivesToWin?: number;
      seed?: number;
      deckId?: string | null;
      deck?: DeckManifest | null;
      /** Per-turn timer in seconds. null = off (default). */
      turnTimerSec?: number | null;
    } = {},
  ): void {
    if (!this.canStart()) throw new Error("cannot start: lobby not ready");

    const byTeam = new Map<Team, RoomSeat[]>();
    for (const s of this.seats) {
      const arr = byTeam.get(s.team!) ?? [];
      arr.push(s);
      byTeam.set(s.team!, arr);
    }

    const presentTeams = TEAM_ORDER.filter((t) => byTeam.has(t));
    const perTeam = byTeam.get(presentTeams[0]!)!.length;
    const orderedSeats: RoomSeat[] = [];
    for (let i = 0; i < perTeam; i++) {
      for (const t of presentTeams) {
        const seat = byTeam.get(t)![i]!;
        orderedSeats.push(seat);
      }
    }

    const seatInputs: SeatInput[] = orderedSeats.map((s) => ({
      id: s.id,
      name: s.name,
      team: s.team!,
    }));

    this.game = createInitialState(seatInputs, {
      fivefivesToWin: opts.fivefivesToWin,
      seed: opts.seed,
      deckId: opts.deckId ?? null,
    });
    // Randomize who goes first so the host doesn't always have the advantage.
    this.game.turnIdx = Math.floor(Math.random() * this.game.players.length);
    this.deck = opts.deck ?? null;
    this.lastMvpNames = [];
    this.turnTimerSec = opts.turnTimerSec ?? null;
    this.turnExpiresAt = null;

    // Fire-and-forget: assign a game id and persist the start record so we
    // can build a replay later. Failures (e.g. no DB) are logged but don't
    // block gameplay.
    this.gameId = randomUUID();
    this.persistedActionCount = 0;
    void persistGameStart({
      gameId: this.gameId,
      roomCode: this.code,
      deckId: opts.deckId ?? null,
      fivefivesToWin: this.game.config.fivefivesToWin,
      teamNames: { ...this.teamNames },
      players: seatInputs.map((s) => ({ id: s.id, name: s.name, team: s.team })),
      initialSeed: this.game.config.seed,
    });
  }

  applyAction(playerId: PlayerId, action: Action) {
    if (!this.game) throw new Error("game not started");
    const result = applyAction(this.game, playerId, action);
    // Persist any newly-logged actions to the replay log. We rely on the
    // fact that applyAction appends one entry on success; even on the rare
    // path where actionLog rotates (capped at 10), persistedActionCount
    // is the global, ever-growing index.
    if (result.ok && this.gameId) {
      const total = result.state.actionLog.length;
      // We know exactly one new action was appended on success.
      const last = result.state.actionLog[total - 1];
      if (last) {
        const player = result.state.players.find((p) => p.id === last.playerId);
        const team = player?.team ?? "red";
        const idx = this.persistedActionCount;
        this.persistedActionCount += 1;
        void persistGameAction({
          gameId: this.gameId,
          index: idx,
          playerName: last.playerName,
          team,
          rank: last.card.rank,
          suit: last.card.suit,
          type: last.type,
          pos: last.pos ?? null,
        });
      }
    }
    return result;
  }

  /** Call after applyAction; if a winner was just declared, record the win. */
  maybeRecordWin(): boolean {
    if (!this.game || !this.game.winner) return false;
    const winner = this.game.winner;
    if (this.gameId) void persistGameFinish(this.gameId, winner);
    this.teamScores[winner] = (this.teamScores[winner] ?? 0) + 1;

    // MVP: winning-team player(s) with the most fivefivesClosed in this game.
    const winners = this.game.players.filter((p) => p.team === winner);
    const maxSeqs = winners.reduce((m, p) => Math.max(m, p.stats.fivefivesClosed), 0);
    const mvpNames = maxSeqs > 0
      ? winners.filter((p) => p.stats.fivefivesClosed === maxSeqs).map((p) => p.name)
      : [];
    this.lastMvpNames = mvpNames;

    const winningPlayerId = this.game.winningFivefivePlayerId;
    const winningNames: string[] = [];
    const allTeamNames = new Set<string>();
    const contributions: PlayerGameContribution[] = [];
    for (const p of this.game.players) {
      allTeamNames.add(this.teamNames[p.team]);
      const isWinner = p.team === winner;
      if (isWinner) {
        this.playerScores[p.name] = (this.playerScores[p.name] ?? 0) + 1;
        winningNames.push(p.name);
      }
      const seat = this.seats.find((s) => s.id === p.id);
      contributions.push({
        name: p.name,
        userId: seat?.userId ?? null,
        chipsPlaced: p.stats.chipsPlaced,
        fivefivesClosed: p.stats.fivefivesClosed,
        isWinner,
        isMvp: mvpNames.includes(p.name),
        isWinningSequencePlayer: p.id === winningPlayerId,
      });
    }
    this.gamesPlayed += 1;
    const record: WinRecord = {
      roomCode: this.code,
      winningTeam: winner,
      winningPlayerNames: winningNames,
      allTeamNames: [...allTeamNames],
      winningTeamName: this.teamNames[winner],
      contributions,
    };
    void persistWin(record);
    return true;
  }

  stop(): void {
    if (!this.game) return;
    // Mark abandoned games (no winner) finished so they don't sit open
    // forever in game_log. winning_team stays NULL to indicate abandonment.
    if (this.gameId && !this.game.winner) {
      void persistGameFinish(this.gameId, null);
    }
    this.game = null;
    this.deck = null;
    this.gameId = null;
    this.persistedActionCount = 0;
    this.turnTimerSec = null;
    this.turnExpiresAt = null;
    for (const seat of this.seats) seat.ready = false;
  }

  roomView(): RoomView {
    const seats: Seat[] = this.seats.map((s) => ({
      id: s.id,
      name: s.name,
      team: s.team,
      ready: s.ready,
      connected: s.connected,
      isHost: s.id === this.hostId,
      isBot: s.isBot,
    }));
    return {
      code: this.code,
      hostId: this.hostId,
      seats,
      inGame: this.game !== null,
      teamNames: { ...this.teamNames },
      teamScores: { ...this.teamScores },
      playerScores: { ...this.playerScores },
      gamesPlayed: this.gamesPlayed,
      spectatorCount: this.spectators.length,
      autoStartAt: this.autoStartAt,
      gameId: this.gameId,
    };
  }

  gameView(viewerId: PlayerId | null): GameView | null {
    if (!this.game) return null;
    const view = toGameView(this.game, viewerId);
    view.deck = this.deck;
    view.teamNames = { ...this.teamNames };
    view.mvpNames = [...this.lastMvpNames];
    view.players = view.players.map((p) => {
      const seat = this.seats.find((s) => s.id === p.id);
      return { ...p, connected: seat?.connected ?? false };
    });
    view.turnTimerSec = this.turnTimerSec;
    view.turnExpiresAt = this.turnExpiresAt;
    return view;
  }

  connectedSocketIds(): string[] {
    return this.seats
      .filter((s) => s.connected && s.socketId !== null)
      .map((s) => s.socketId!);
  }

  spectatorSocketIds(): string[] {
    return this.spectators.map((s) => s.socketId);
  }

  seatBySocketId(socketId: string): RoomSeat | undefined {
    return this.seats.find((s) => s.socketId === socketId);
  }
}
