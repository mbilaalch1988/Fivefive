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
} from "@sequence/shared";

interface RoomSeat {
  id: PlayerId;
  name: string;
  team: Team | null;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
}

const TEAM_ORDER: Team[] = ["red", "blue", "green"];
const MAX_TEAM_NAME = 24;

export class Room {
  readonly code: string;
  hostId: PlayerId;
  seats: RoomSeat[] = [];
  game: GameState | null = null;
  deck: DeckManifest | null = null;
  teamNames: Record<Team, string> = { red: "Red", blue: "Blue", green: "Green" };
  teamScores: Record<Team, number> = { red: 0, blue: 0, green: 0 };
  playerScores: Record<string, number> = {};
  gamesPlayed = 0;

  constructor(code: string, host: { id: PlayerId; name: string; socketId: string }) {
    this.code = code;
    this.hostId = host.id;
    this.seats.push({
      id: host.id,
      name: host.name,
      team: null,
      ready: false,
      connected: true,
      socketId: host.socketId,
    });
  }

  addPlayer(p: { id: PlayerId; name: string; socketId: string }): void {
    if (this.game) throw new Error("game already started");
    if (this.seats.length >= 12) throw new Error("room is full");
    this.seats.push({
      id: p.id,
      name: p.name,
      team: null,
      ready: false,
      connected: true,
      socketId: p.socketId,
    });
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
    return this.seats.length === 0;
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
  }

  canStart(): boolean {
    if (this.game) return false;
    if (this.seats.length < 2) return false;
    if (!this.seats.every((s) => s.team !== null && s.ready)) return false;
    const teams = new Set(this.seats.map((s) => s.team));
    if (teams.size < 2) return false;
    const counts = new Map<Team, number>();
    for (const s of this.seats) {
      counts.set(s.team!, (counts.get(s.team!) ?? 0) + 1);
    }
    const sizes = [...counts.values()];
    return sizes.every((n) => n === sizes[0]);
  }

  start(
    opts: {
      sequencesToWin?: number;
      seed?: number;
      deckId?: string | null;
      deck?: DeckManifest | null;
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
      sequencesToWin: opts.sequencesToWin,
      seed: opts.seed,
      deckId: opts.deckId ?? null,
    });
    this.deck = opts.deck ?? null;
  }

  applyAction(playerId: PlayerId, action: Action) {
    if (!this.game) throw new Error("game not started");
    return applyAction(this.game, playerId, action);
  }

  /** Call after applyAction; if a winner was just declared, record the win. */
  maybeRecordWin(): boolean {
    if (!this.game || !this.game.winner) return false;
    if (this.game.winner) {
      const winner = this.game.winner;
      this.teamScores[winner] = (this.teamScores[winner] ?? 0) + 1;
      for (const p of this.game.players) {
        if (p.team === winner) {
          this.playerScores[p.name] = (this.playerScores[p.name] ?? 0) + 1;
        }
      }
      this.gamesPlayed += 1;
      return true;
    }
    return false;
  }

  stop(): void {
    if (!this.game) return;
    this.game = null;
    this.deck = null;
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
    };
  }

  gameView(viewerId: PlayerId | null): GameView | null {
    if (!this.game) return null;
    const view = toGameView(this.game, viewerId);
    view.deck = this.deck;
    view.teamNames = { ...this.teamNames };
    view.players = view.players.map((p) => {
      const seat = this.seats.find((s) => s.id === p.id);
      return { ...p, connected: seat?.connected ?? false };
    });
    return view;
  }

  connectedSocketIds(): string[] {
    return this.seats
      .filter((s) => s.connected && s.socketId !== null)
      .map((s) => s.socketId!);
  }

  seatBySocketId(socketId: string): RoomSeat | undefined {
    return this.seats.find((s) => s.socketId === socketId);
  }
}
