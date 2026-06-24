import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Server, type Socket } from "socket.io";
import {
  SHARED_VERSION,
  isValidStickerId,
  isValidQuickChatId,
  pickRandomLegalAction,
  type Action,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Team,
} from "@sequence/shared";
import { randomUUID } from "node:crypto";
import { Room } from "./room.js";
import { RoomRegistry } from "./registry.js";
import { DeckRegistry } from "./decks.js";
import { botDecide, scoredCandidates } from "./botAI.js";
import {
  analyzeForPlayer,
  buildCheckpointsForPlayer,
  buildFaiziRoast,
  summarizeFaiziMoves,
  type FaiziAnalysis,
  type FaiziRoast,
  type SeatInput,
} from "@sequence/shared";
import {
  claimAnonymousName,
  createAccount,
  deletePushSubscription,
  getAccountByUserId,
  getAnonymousStatsForName,
  getGameInitialSeed,
  getPagedPlayersByPoints,
  getPagedTeams,
  getPushSubscriptions,
  getReplay,
  getTopPlayers,
  getTopPlayersByMvp,
  getTopPlayersByPoints,
  getTopPlayersBySequences,
  getTopTeams,
  initDb,
  isPersistenceEnabled,
  isUsernameAvailable,
  listRecentReplays,
  savePushSubscription,
  updateDisplayName,
} from "./db.js";
import {
  SubscriptionGoneError,
  getVapidPublicKey,
  initPush,
  isPushConfigured,
  sendPush,
} from "./push.js";
import { verifyToken } from "./jwt.js";
import { newPlayerId } from "./util.js";

const PORT = Number(process.env.PORT ?? 3001);
const IS_PROD = process.env.NODE_ENV === "production";
// In dev the React app is served by Vite on a different origin; in prod we
// serve client/dist from the same Node process so there's no cross-origin.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? (IS_PROD ? true : "http://localhost:5173");

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN as cors.CorsOptions["origin"] }));
const registry = new RoomRegistry();
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    shared: SHARED_VERSION,
    rooms: registry.size(),
    persistence: isPersistenceEnabled() ? "postgres" : "in-memory",
    push: isPushConfigured() ? "configured" : "disabled",
  });
});

app.use(express.json({ limit: "16kb" }));

// Web push: expose VAPID public key so the client can subscribe.
app.get("/api/push/vapid-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "push not configured" });
    return;
  }
  res.json({ publicKey: key });
});

// Subscribe — client posts its PushSubscription object plus the room + player it
// belongs to. Idempotent on endpoint.
app.post("/api/push/subscribe", async (req, res) => {
  const body = req.body as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    roomCode?: string;
    playerId?: string;
  };
  const sub = body?.subscription;
  const roomCode = (body?.roomCode ?? "").trim().toUpperCase();
  const playerId = (body?.playerId ?? "").trim();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({ error: "missing subscription fields" });
    return;
  }
  if (!roomCode || !playerId) {
    res.status(400).json({ error: "missing roomCode/playerId" });
    return;
  }
  await savePushSubscription({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    roomCode,
    playerId,
  });
  res.json({ ok: true });
});

// Unsubscribe — body: { endpoint }
app.post("/api/push/unsubscribe", async (req, res) => {
  const endpoint = (req.body as { endpoint?: string })?.endpoint;
  if (!endpoint) {
    res.status(400).json({ error: "missing endpoint" });
    return;
  }
  await deletePushSubscription(endpoint);
  res.json({ ok: true });
});

// In production, serve the built React client and fall back to index.html for
// SPA routes. The build lives at <repo>/client/dist; this file lives at
// <repo>/server/src/index.ts, so the path is ../../client/dist.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CARD_LAYOUT = join(__dirname, "..", "..", "Card_layout");
const deckRegistry = new DeckRegistry(CARD_LAYOUT);

if (existsSync(CARD_LAYOUT)) {
  app.use("/decks", express.static(CARD_LAYOUT));
}
app.get("/api/decks", (_req, res) => {
  res.json({ decks: deckRegistry.list() });
});

// Full manifest for a single deck — used by the replay viewer to render
// card art on the board. Returns 404 if the deck is gone.
app.get("/api/decks/:id", (req, res) => {
  const id = String(req.params.id ?? "");
  const manifest = deckRegistry.get(id);
  if (!manifest) {
    res.status(404).json({ error: "deck not found" });
    return;
  }
  res.json(manifest);
});

// Manual deck-folder rescan. Useful when you add a new deck without redeploying.
app.post("/api/decks/refresh", (_req, res) => {
  deckRegistry.reload();
  res.json({ ok: true, count: deckRegistry.list().length, decks: deckRegistry.list() });
});

app.get("/api/scoreboard/players", async (req, res) => {
  const perPage = Math.max(1, Math.min(50, Number(req.query.perPage) || 10));
  const page = Math.max(0, Number(req.query.page) || 0);
  const result = await getPagedPlayersByPoints(perPage, page);
  res.json(result);
});

app.get("/api/scoreboard/teams", async (req, res) => {
  const perPage = Math.max(1, Math.min(50, Number(req.query.perPage) || 10));
  const page = Math.max(0, Number(req.query.page) || 0);
  const result = await getPagedTeams(perPage, page);
  res.json(result);
});

app.get("/api/replays", async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const rows = await listRecentReplays(limit);
  res.json({ replays: rows });
});

app.get("/api/replays/:gameId", async (req, res) => {
  const id = String(req.params.gameId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "invalid game id" });
    return;
  }
  const detail = await getReplay(id);
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(detail);
});

/* ------------------------------------------------------------ */
/* Account endpoints (mandatory-account migration)              */
/* ------------------------------------------------------------ */

/**
 * Pull the Authorization: Bearer JWT, verify with Supabase JWT secret,
 * return the verified user. 401 if missing/invalid.
 */
async function requireAuth(
  req: express.Request,
  res: express.Response,
): Promise<{ userId: string; email?: string } | null> {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const verified = await verifyToken(token);
  if (!verified) {
    res.status(401).json({ error: "auth required" });
    return null;
  }
  return { userId: verified.userId };
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX = 24;

function validateUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(v)) return null;
  return v;
}

function validateDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length === 0 || v.length > DISPLAY_NAME_MAX) return null;
  return v;
}

/** Lightweight check used by the sign-up form for live availability. */
app.get("/api/accounts/check-username", async (req, res) => {
  const u = validateUsername(req.query.username);
  if (!u) {
    res.status(400).json({ available: false, error: "username must be 3-20 chars, lowercase letters/numbers/underscore" });
    return;
  }
  const available = await isUsernameAvailable(u);
  res.json({ available });
});

/** Get the currently authenticated user's account row, if any. */
app.get("/api/accounts/me", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const account = await getAccountByUserId(auth.userId);
  if (!account) {
    res.json({ account: null });
    return;
  }
  res.json({ account });
});

/**
 * Create the account row for a freshly-verified Supabase user. Caller
 * supplies the desired username + display name. Username must be unique
 * (case-insensitive). One account per user_id — a second call from the
 * same user 409s.
 */
app.post("/api/accounts/register", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const username = validateUsername(req.body?.username);
  const displayName = validateDisplayName(req.body?.displayName) ?? username;
  if (!username) {
    res.status(400).json({ error: "invalid username" });
    return;
  }
  // Reject if already registered (UX nicety; the DB would 500 on PK collision otherwise).
  const existing = await getAccountByUserId(auth.userId);
  if (existing) {
    res.status(409).json({ error: "account already exists", account: existing });
    return;
  }
  if (!(await isUsernameAvailable(username))) {
    res.status(409).json({ error: "username already taken" });
    return;
  }
  try {
    const account = await createAccount({
      userId: auth.userId,
      username,
      displayName: displayName ?? username,
      email: typeof req.body?.email === "string" ? req.body.email : null,
    });
    res.json({ account });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Update the signed-in user's display name. Username is immutable. */
app.patch("/api/accounts/me", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const displayName = validateDisplayName(req.body?.displayName);
  if (!displayName) {
    res.status(400).json({ error: "invalid display name" });
    return;
  }
  await updateDisplayName(auth.userId, displayName);
  const updated = await getAccountByUserId(auth.userId);
  res.json({ account: updated });
});

/**
 * Peek anonymous stats for a name (used by the claim prompt).
 * Returns 200 with stats payload, or { stats: null } when the name has
 * nothing unclaimed.
 */
app.get("/api/accounts/anonymous-stats", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const stats = await getAnonymousStatsForName(name);
  res.json({ stats });
});

/**
 * Claim an anonymous player_stats row for the signed-in user. The row's
 * lifetime stats get rolled into the account's user_stats; the anon row
 * is marked claimed_by_user_id so it disappears from anonymous leaderboards.
 */
app.post("/api/accounts/claim-name", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ok = await claimAnonymousName(auth.userId, name);
  if (!ok) {
    res.status(409).json({ error: "name not found or already claimed" });
    return;
  }
  res.json({ claimed: true });
});

/**
 * Faizi analysis: scoped to a specific player in a finished game. Replays
 * the game deterministically from the persisted RNG seed, then scores each
 * of that player's moves against the Hard-bot's preferred action at that
 * exact game state.
 */
app.get("/api/replays/:gameId/faizi", async (req, res) => {
  const id = String(req.params.gameId ?? "");
  const playerId = String(req.query.playerId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "invalid game id" });
    return;
  }
  if (!playerId) {
    res.status(400).json({ error: "playerId required" });
    return;
  }
  const detail = await getReplay(id);
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const seed = await getGameInitialSeed(id);
  if (seed === null) {
    const empty: FaiziAnalysis = {
      available: false,
      notes: "This game predates the analysis system (no RNG seed stored). New games starting now will be analyzable.",
      moves: [],
      summary: { best: 0, solid: 0, missed: 0, mistake: 0 },
    };
    res.json(empty);
    return;
  }
  const player = detail.players.find((p) => p.id === playerId);
  if (!player) {
    res.status(404).json({ error: "player not in this game" });
    return;
  }
  if (detail.actions.length < 10) {
    const empty: FaiziAnalysis = {
      available: false,
      notes: "Not enough moves to analyze — Faizi needs at least 10 actions in the game.",
      moves: [],
      summary: { best: 0, solid: 0, missed: 0, mistake: 0 },
    };
    res.json(empty);
    return;
  }

  const seats: SeatInput[] = detail.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
  }));

  try {
    const checkpoints = buildCheckpointsForPlayer(
      seed,
      seats,
      detail.sequencesToWin,
      detail.deckId,
      // DB returns rank/suit as plain string; cast to the shared union.
      detail.actions as Parameters<typeof buildCheckpointsForPlayer>[4],
      playerId,
    );
    const moves = analyzeForPlayer(checkpoints, playerId, faiziScorer);

    const out: FaiziAnalysis = {
      available: true,
      moves,
      summary: summarizeFaiziMoves(moves),
    };
    res.json(out);
  } catch (e) {
    console.warn("[faizi] failed:", (e as Error).message);
    res.status(500).json({ error: "analysis failed" });
  }
});

/**
 * Faizi Roast: same analysis engine but run for EVERY player in the game.
 * Returns satirical titles and an awards roster — meant for the post-game
 * group-laugh modal rather than serious self-improvement.
 */
app.get("/api/replays/:gameId/faizi/roast", async (req, res) => {
  const id = String(req.params.gameId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "invalid game id" });
    return;
  }
  const detail = await getReplay(id);
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const seed = await getGameInitialSeed(id);
  if (seed === null) {
    const empty: FaiziRoast = {
      available: false,
      notes: "This game predates the analysis system. New games starting now will be roastable.",
      players: [],
      awards: [],
      headline: "",
    };
    res.json(empty);
    return;
  }
  if (detail.actions.length < 10) {
    const empty: FaiziRoast = {
      available: false,
      notes: "Not enough moves to roast — Faizi needs at least 10 actions in the game.",
      players: [],
      awards: [],
      headline: "",
    };
    res.json(empty);
    return;
  }

  const seats: SeatInput[] = detail.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
  }));

  try {
    // Per-player analysis — same engine as /faizi, just run for each seat.
    const perPlayer = detail.players.map((p) => {
      const checkpoints = buildCheckpointsForPlayer(
        seed,
        seats,
        detail.sequencesToWin,
        detail.deckId,
        detail.actions as Parameters<typeof buildCheckpointsForPlayer>[4],
        p.id,
      );
      const moves = analyzeForPlayer(checkpoints, p.id, faiziScorer);
      return { playerId: p.id, name: p.name, team: p.team, moves };
    });

    const { players, awards, headline } = buildFaiziRoast(perPlayer);
    const out: FaiziRoast = { available: true, players, awards, headline };
    res.json(out);
  } catch (e) {
    console.warn("[faizi-roast] failed:", (e as Error).message);
    res.status(500).json({ error: "roast failed" });
  }
});

app.get("/api/scoreboard", async (_req, res) => {
  if (!isPersistenceEnabled()) {
    res.json({
      topPlayersByPoints: [],
      topPlayers: [],
      topTeams: [],
      topPlayersBySequences: [],
      topPlayersByMvp: [],
      persisted: false,
    });
    return;
  }
  const [
    topPlayersByPoints,
    topPlayers,
    topTeams,
    topPlayersBySequences,
    topPlayersByMvp,
  ] = await Promise.all([
    getTopPlayersByPoints(5),
    getTopPlayers(5),
    getTopTeams(5),
    getTopPlayersBySequences(5),
    getTopPlayersByMvp(5),
  ]);
  res.json({
    topPlayersByPoints,
    topPlayers,
    topTeams,
    topPlayersBySequences,
    topPlayersByMvp,
    persisted: true,
  });
});

const CLIENT_DIST = join(__dirname, "..", "..", "client", "dist");
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^\/(?!health|api|decks|socket\.io).*/, (_req, res) => {
    res.sendFile(join(CLIENT_DIST, "index.html"));
  });
  console.log(`[server] serving client from ${CLIENT_DIST}`);
} else if (IS_PROD) {
  console.warn(`[server] WARN: client build not found at ${CLIENT_DIST}`);
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN as cors.CorsOptions["origin"] },
});

/** Lookup: socketId → roomCode (the room a socket is currently attached to). */
const socketRoom = new Map<string, string>();

function attach(socket: Socket, roomCode: string): void {
  socketRoom.set(socket.id, roomCode);
  socket.join(`room:${roomCode}`);
}

function detach(socket: Socket): void {
  const code = socketRoom.get(socket.id);
  if (code) socket.leave(`room:${code}`);
  socketRoom.delete(socket.id);
}

function broadcastRoom(room: Room): void {
  io.to(`room:${room.code}`).emit("room", room.roomView());
}

/* ------------------------------------------------------------ */
/* Auto-start: 5s timer when everyone is ready                  */
/* ------------------------------------------------------------ */
const AUTO_START_MS = 5000;
const autoStartTimers = new Map<string, NodeJS.Timeout>();

function cancelAutoStart(room: Room): void {
  const t = autoStartTimers.get(room.code);
  if (t) clearTimeout(t);
  autoStartTimers.delete(room.code);
  room.autoStartAt = null;
}

/**
 * Call after any lobby state change (chooseTeam, setReady, addBot, removeBot,
 * leaveRoom). If the lobby is now in a canStart() state, schedule auto-start
 * after 5s; if it isn't, cancel any pending auto-start. Always re-broadcasts
 * so clients see the autoStartAt timestamp update.
 */
function refreshAutoStart(room: Room): void {
  if (room.game) {
    cancelAutoStart(room);
    return;
  }
  if (!room.canStart()) {
    cancelAutoStart(room);
    return;
  }
  // Already scheduled? Don't reset the timer.
  if (autoStartTimers.has(room.code)) return;

  room.autoStartAt = Date.now() + AUTO_START_MS;
  const timer = setTimeout(() => {
    autoStartTimers.delete(room.code);
    room.autoStartAt = null;
    if (!room.canStart()) {
      broadcastRoom(room);
      return;
    }
    try {
      // Auto-start with the host's last-saved settings (or defaults if none).
      room.start({});
      broadcastRoom(room);
      broadcastGame(room);
      scheduleBotTurn(room);
    } catch (e) {
      console.warn(`[auto-start] ${room.code} failed: ${(e as Error).message}`);
      broadcastRoom(room);
    }
  }, AUTO_START_MS);
  autoStartTimers.set(room.code, timer);
}

/**
 * If the current player is a bot, schedule its move after a small delay so
 * humans see what just happened. Re-invokes itself after bot's action since
 * (a) discardDead doesn't end the turn, and (b) the next seat might also
 * be a bot. Guarded so a stop/win/disconnect mid-delay is a no-op.
 */
function scheduleBotTurn(room: Room): void {
  const turn = room.isBotTurn();
  if (!turn) return;
  const delayMs = 700 + Math.random() * 900;
  setTimeout(() => {
    if (!room.game || room.game.winner) return;
    // Re-check in case the game state advanced (host stop, etc.)
    const stillTurn = room.isBotTurn();
    if (!stillTurn || stillTurn.seat.id !== turn.seat.id) return;
    const action = botDecide(room.game, turn.seat.id, turn.difficulty);
    if (!action) {
      console.warn(`[bot] ${turn.seat.name} found no legal action`);
      return;
    }
    try {
      const result = room.applyAction(turn.seat.id, action);
      if (!result.ok) {
        console.warn(`[bot] ${turn.seat.name} action failed: ${result.error}`);
        return;
      }
      const justWon = room.maybeRecordWin();
      broadcastGame(room);
      if (justWon) broadcastRoom(room);
      // Chain into the next bot turn (or stop if turn is human / game over).
      scheduleBotTurn(room);
      // Re-arm the human turn timer if the next seat is a player.
      if (!justWon) scheduleTurnTimer(room);
      else cancelTurnTimer(room);
    } catch (e) {
      console.warn(`[bot] applyAction threw: ${(e as Error).message}`);
    }
  }, delayMs);
}

/**
 * Send a "your turn" web push to every subscription registered for the
 * given (room, player) pair. Errors are swallowed; expired subscriptions
 * are removed from the DB.
 */
async function pushTurnNotification(room: Room, playerId: string): Promise<void> {
  if (!isPushConfigured()) return;
  const seat = room.seats.find((s) => s.id === playerId);
  if (!seat || seat.isBot) return;
  const subs = await getPushSubscriptions(room.code, playerId);
  if (subs.length === 0) return;
  for (const sub of subs) {
    try {
      await sendPush(sub, {
        title: "Your turn!",
        body: `It's your turn in room ${room.code}`,
        tag: `turn-${room.code}`,
        roomCode: room.code,
      });
    } catch (e) {
      if (e instanceof SubscriptionGoneError) {
        await deletePushSubscription(e.endpoint);
      } else {
        console.warn("[push] error:", (e as Error).message);
      }
    }
  }
}

/**
 * Shared Faizi scorer used by both the personal-analysis endpoint and the
 * group-roast endpoint. Wraps the bot's heuristic scorer to expose rank +
 * score, which the rank-based rater uses to avoid the "9% closeness =
 * mistake" trap when the bot finds a +1000 sequence completion.
 */
const faiziScorer: Parameters<typeof analyzeForPlayer>[2] = (state, pid) => {
  const candidates = scoredCandidates(state, pid);
  if (candidates.length === 0) {
    return {
      best: null,
      userRankAndScore: () => ({ rank: 999, score: 0, totalCandidates: 0 }),
    };
  }
  const best = candidates[0]!;
  return {
    best: { action: best.action, score: best.score },
    userRankAndScore: (action) => {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]!;
        const sameAction =
          c.action.type === action.type &&
          c.action.cardId === action.cardId &&
          ("pos" in c.action && "pos" in action
            ? c.action.pos.r === action.pos.r &&
              c.action.pos.c === action.pos.c
            : true);
        if (sameAction) {
          return {
            rank: i + 1,
            score: c.score,
            totalCandidates: candidates.length,
          };
        }
      }
      // Action wasn't in the candidate list (shouldn't happen for valid plays).
      return { rank: candidates.length + 1, score: 0, totalCandidates: candidates.length };
    },
  };
};

/* ------------------------------------------------------------ */
/* Per-turn timer: auto-play a random legal action on expiry    */
/* ------------------------------------------------------------ */
const turnTimers = new Map<string, NodeJS.Timeout>();

function cancelTurnTimer(room: Room): void {
  const t = turnTimers.get(room.code);
  if (t) clearTimeout(t);
  turnTimers.delete(room.code);
}

/**
 * Schedule the next per-turn auto-play. Bots use scheduleBotTurn already,
 * so the turn timer only fires for HUMAN seats. Called after every
 * broadcastGame so the timer always reflects the current turn.
 */
function scheduleTurnTimer(room: Room): void {
  cancelTurnTimer(room);
  if (!room.game) return;
  if (room.game.winner) return;
  if (!room.turnTimerSec) return;

  const current = room.game.players[room.game.turnIdx];
  if (!current) return;
  const seat = room.seats.find((s) => s.id === current.id);
  if (!seat || seat.isBot) {
    room.turnExpiresAt = null;
    return;
  }
  const ms = room.turnTimerSec * 1000;
  room.turnExpiresAt = Date.now() + ms;

  const timer = setTimeout(() => {
    turnTimers.delete(room.code);
    if (!room.game || room.game.winner) return;
    const stillCurrent = room.game.players[room.game.turnIdx];
    if (!stillCurrent || stillCurrent.id !== current.id) return;

    const action = pickRandomLegalAction(room.game, current.id);
    if (!action) {
      // Truly stuck — deadlock detector inside applyAction won't fire
      // without a successful action, so force-advance by clearing
      // the timer and letting the next setReady cycle handle it.
      console.warn(`[turn-timer] ${current.name} stuck, no action available`);
      return;
    }
    try {
      const result = room.applyAction(current.id, action);
      if (!result.ok) {
        console.warn(`[turn-timer] applyAction failed: ${result.error}`);
        return;
      }
      const justWon = room.maybeRecordWin();
      broadcastGame(room);
      if (justWon) broadcastRoom(room);
      if (!justWon) {
        scheduleBotTurn(room);
        scheduleTurnTimer(room);
      }
    } catch (e) {
      console.warn(`[turn-timer] applyAction threw: ${(e as Error).message}`);
    }
  }, ms);
  turnTimers.set(room.code, timer);
}

function broadcastGame(room: Room): void {
  // Per-player redacted view: emit individually to each connected socket.
  for (const seat of room.seats) {
    if (!seat.connected || !seat.socketId) continue;
    const view = room.gameView(seat.id);
    if (view) io.to(seat.socketId).emit("game", view);
  }
  // Spectators get the same view with no hand (viewerId=null).
  const spectatorView = room.gameView(null);
  if (spectatorView) {
    for (const sid of room.spectatorSocketIds()) {
      io.to(sid).emit("game", spectatorView);
    }
  }
}

io.on("connection", (socket) => {
  console.log(`[io] connect ${socket.id}`);

  socket.on("createRoom", async ({ playerName, authToken }, ack) => {
    try {
      const verified = await verifyToken(authToken);
      // If user is signed in, prefer the verified display name when none typed.
      const name = (playerName ?? verified?.displayName ?? "").trim();
      if (!name) return ack({ ok: false, error: "name required" });
      const playerId = newPlayerId();
      const room = registry.create({
        id: playerId,
        name,
        socketId: socket.id,
        userId: verified?.userId ?? null,
      });
      attach(socket, room.code);
      ack({ ok: true, roomCode: room.code, playerId, room: room.roomView() });
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("joinRoom", async ({ roomCode, playerName, authToken }, ack) => {
    try {
      const verified = await verifyToken(authToken);
      const code = (roomCode ?? "").trim().toUpperCase();
      const name = (playerName ?? verified?.displayName ?? "").trim();
      if (!code) return ack({ ok: false, error: "room code required" });
      if (!name) return ack({ ok: false, error: "name required" });
      const room = registry.get(code);
      if (!room) return ack({ ok: false, error: "room not found" });
      if (room.game) return ack({ ok: false, error: "game already in progress" });
      const playerId = newPlayerId();
      room.addPlayer({
        id: playerId,
        name,
        socketId: socket.id,
        userId: verified?.userId ?? null,
      });
      attach(socket, room.code);
      ack({ ok: true, playerId, room: room.roomView() });
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("joinAsSpectator", async ({ roomCode, spectatorName, authToken }, ack) => {
    try {
      const verified = await verifyToken(authToken);
      const code = (roomCode ?? "").trim().toUpperCase();
      const name = (spectatorName ?? verified?.displayName ?? "Spectator").trim() || "Spectator";
      if (!code) return ack({ ok: false, error: "room code required" });
      const room = registry.get(code);
      if (!room) return ack({ ok: false, error: "room not found" });
      const spectatorId = randomUUID();
      room.addSpectator({
        id: spectatorId,
        name,
        socketId: socket.id,
        userId: verified?.userId ?? null,
      });
      attach(socket, room.code);
      ack({
        ok: true,
        spectatorId,
        room: room.roomView(),
        game: room.gameView(null),
      });
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("rejoin", ({ roomCode, playerId }, ack) => {
    try {
      const room = registry.get(roomCode);
      if (!room) return ack({ ok: false, error: "room not found" });
      const ok = room.attachSocket(playerId, socket.id);
      if (!ok) return ack({ ok: false, error: "seat not found" });
      attach(socket, room.code);
      ack({ ok: true, room: room.roomView(), game: room.gameView(playerId) });
      broadcastRoom(room);
      if (room.game) {
        const view = room.gameView(playerId);
        if (view) socket.emit("game", view);
      }
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("chooseTeam", ({ team }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    try {
      room.chooseTeam(seat.id, team as Team);
      ack({ ok: true });
      refreshAutoStart(room);
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("setReady", ({ ready }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    try {
      room.setReady(seat.id, ready);
      ack({ ok: true });
      refreshAutoStart(room);
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("startGame", ({ sequencesToWin, deckId, turnTimerSec }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    if (seat.id !== room.hostId) {
      return ack({ ok: false, error: "only the host can start the game" });
    }
    const deck = deckId ? deckRegistry.get(deckId) ?? null : null;
    if (deckId && !deck) {
      return ack({ ok: false, error: `unknown deck "${deckId}"` });
    }
    const validatedTimer =
      turnTimerSec && [30, 60, 90].includes(turnTimerSec) ? turnTimerSec : null;
    try {
      cancelAutoStart(room);
      room.start({
        sequencesToWin,
        deckId: deck?.id ?? null,
        deck,
        turnTimerSec: validatedTimer,
      });
      ack({ ok: true });
      broadcastRoom(room);
      broadcastGame(room);
      // First-turn-may-be-a-bot.
      scheduleBotTurn(room);
      // Or kick off the turn timer if first player is human.
      scheduleTurnTimer(room);
      // Push the opening turn.
      const firstId = room.game?.players[room.game.turnIdx]?.id ?? null;
      if (firstId) void pushTurnNotification(room, firstId);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("stopGame", (ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    if (seat.id !== room.hostId) {
      return ack({ ok: false, error: "only the host can stop the game" });
    }
    try {
      cancelTurnTimer(room);
      room.stop();
      ack({ ok: true });
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("doAction", (action: Action, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    try {
      const prevTurnId = room.game?.players[room.game.turnIdx]?.id ?? null;
      const result = room.applyAction(seat.id, action);
      if (!result.ok) return ack({ ok: false, error: result.error });
      // Persist the win if this action ended the game; updated counts ride along
      // in the next room broadcast.
      const justWon = room.maybeRecordWin();
      ack({ ok: true });
      broadcastGame(room);
      if (justWon) broadcastRoom(room);
      // If the next player is a bot, schedule its turn.
      if (!justWon) {
        scheduleBotTurn(room);
        scheduleTurnTimer(room);
      } else {
        cancelTurnTimer(room);
      }
      // Push notification on turn flip — fire-and-forget.
      const newTurnId = room.game?.players[room.game.turnIdx]?.id ?? null;
      if (!justWon && newTurnId && newTurnId !== prevTurnId) {
        void pushTurnNotification(room, newTurnId);
      }
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("addBot", ({ team, difficulty }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    if (seat.id !== room.hostId) {
      return ack({ ok: false, error: "only the host can add bots" });
    }
    try {
      room.addBot(team, difficulty);
      ack({ ok: true });
      refreshAutoStart(room);
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("removeBot", ({ playerId }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    if (seat.id !== room.hostId) {
      return ack({ ok: false, error: "only the host can remove bots" });
    }
    try {
      room.removeBot(playerId);
      ack({ ok: true });
      refreshAutoStart(room);
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("sendSticker", ({ stickerId }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    // Players and spectators can both send stickers.
    const seat = room.seatBySocketId(socket.id);
    const spec = !seat ? room.spectatorBySocketId(socket.id) : undefined;
    if (!seat && !spec) return ack({ ok: false, error: "no seat" });
    if (!isValidStickerId(stickerId)) {
      return ack({ ok: false, error: "unknown sticker" });
    }
    ack({ ok: true });
    io.to(`room:${room.code}`).emit("sticker", {
      fromPlayerId: seat?.id ?? spec!.id,
      fromName: seat?.name ?? spec!.name,
      stickerId,
      eventId: randomUUID(),
    });
  });

  socket.on("sendQuickChat", ({ chatId }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    const spec = !seat ? room.spectatorBySocketId(socket.id) : undefined;
    if (!seat && !spec) return ack({ ok: false, error: "no seat" });
    if (!isValidQuickChatId(chatId)) {
      return ack({ ok: false, error: "unknown quick chat" });
    }
    ack({ ok: true });
    io.to(`room:${room.code}`).emit("quickChat", {
      fromPlayerId: seat?.id ?? spec!.id,
      fromName: seat?.name ?? spec!.name,
      fromTeam: seat?.team ?? null,
      chatId,
      eventId: randomUUID(),
    });
  });

  socket.on("renameTeam", ({ team, name }, ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    if (seat.id !== room.hostId) {
      return ack({ ok: false, error: "only the host can rename teams" });
    }
    try {
      room.renameTeam(team, name);
      ack({ ok: true });
      broadcastRoom(room);
      if (room.game) broadcastGame(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("leaveRoom", (ack) => {
    const code = socketRoom.get(socket.id);
    const room = code ? registry.get(code) : undefined;
    if (!room) return ack({ ok: false, error: "not in a room" });
    // Spectator leaving — pop from spectators list.
    const spec = room.spectatorBySocketId(socket.id);
    if (spec) {
      room.removeSpectatorBySocketId(socket.id);
      detach(socket);
      ack({ ok: true });
      if (room.isEmpty()) registry.delete(room.code);
      else broadcastRoom(room);
      return;
    }
    const seat = room.seatBySocketId(socket.id);
    if (!seat) return ack({ ok: false, error: "no seat" });
    try {
      room.removePlayer(seat.id);
      detach(socket);
      ack({ ok: true });
      if (room.isEmpty()) {
        cancelAutoStart(room);
        registry.delete(room.code);
      } else {
        refreshAutoStart(room);
        broadcastRoom(room);
      }
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[io] disconnect ${socket.id} (${reason})`);
    const code = socketRoom.get(socket.id);
    if (code) {
      const room = registry.get(code);
      if (room) {
        // Spectators are removed entirely on disconnect (no rejoin); seated
        // players just get marked offline so they can rejoin.
        const removedSpec = room.removeSpectatorBySocketId(socket.id);
        if (!removedSpec) {
          room.markDisconnected(socket.id);
        }
        if (room.isEmpty()) {
          cancelAutoStart(room);
          registry.delete(room.code);
        } else {
          // A disconnected player can no longer be "ready" in practice;
          // re-evaluate auto-start.
          refreshAutoStart(room);
          broadcastRoom(room);
        }
      }
    }
    detach(socket);
  });
});

initPush();
void initDb().finally(() => {
  httpServer.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`);
  });
});
