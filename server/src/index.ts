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
  type Action,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Team,
} from "@sequence/shared";
import { randomUUID } from "node:crypto";
import { Room } from "./room.js";
import { RoomRegistry } from "./registry.js";
import { DeckRegistry } from "./decks.js";
import { botDecide } from "./botAI.js";
import {
  getPagedPlayersByPoints,
  getPagedTeams,
  getReplay,
  getTopPlayers,
  getTopPlayersByMvp,
  getTopPlayersByPoints,
  getTopPlayersBySequences,
  getTopTeams,
  initDb,
  isPersistenceEnabled,
  listRecentReplays,
} from "./db.js";
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
  });
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
    } catch (e) {
      console.warn(`[bot] applyAction threw: ${(e as Error).message}`);
    }
  }, delayMs);
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

  socket.on("createRoom", ({ playerName, authToken }, ack) => {
    try {
      const verified = verifyToken(authToken);
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

  socket.on("joinRoom", ({ roomCode, playerName, authToken }, ack) => {
    try {
      const verified = verifyToken(authToken);
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

  socket.on("joinAsSpectator", ({ roomCode, spectatorName, authToken }, ack) => {
    try {
      const verified = verifyToken(authToken);
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
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("startGame", ({ sequencesToWin, deckId }, ack) => {
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
    try {
      room.start({ sequencesToWin, deckId: deck?.id ?? null, deck });
      ack({ ok: true });
      broadcastRoom(room);
      broadcastGame(room);
      // First-turn-may-be-a-bot.
      scheduleBotTurn(room);
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
      const result = room.applyAction(seat.id, action);
      if (!result.ok) return ack({ ok: false, error: result.error });
      // Persist the win if this action ended the game; updated counts ride along
      // in the next room broadcast.
      const justWon = room.maybeRecordWin();
      ack({ ok: true });
      broadcastGame(room);
      if (justWon) broadcastRoom(room);
      // If the next player is a bot, schedule its turn.
      if (!justWon) scheduleBotTurn(room);
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
      if (room.isEmpty()) registry.delete(room.code);
      else broadcastRoom(room);
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
        if (room.isEmpty()) registry.delete(room.code);
        else broadcastRoom(room);
      }
    }
    detach(socket);
  });
});

void initDb().finally(() => {
  httpServer.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`);
  });
});
