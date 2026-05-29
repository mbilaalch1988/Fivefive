import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Server, type Socket } from "socket.io";
import {
  SHARED_VERSION,
  type Action,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Team,
} from "@sequence/shared";
import { Room } from "./room.js";
import { RoomRegistry } from "./registry.js";
import { DeckRegistry } from "./decks.js";
import { getTopPlayers, getTopTeams, initDb, isPersistenceEnabled } from "./db.js";
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

app.get("/api/scoreboard", async (_req, res) => {
  if (!isPersistenceEnabled()) {
    res.json({ topPlayers: [], topTeams: [], persisted: false });
    return;
  }
  const [topPlayers, topTeams] = await Promise.all([getTopPlayers(5), getTopTeams(5)]);
  res.json({ topPlayers, topTeams, persisted: true });
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

function broadcastGame(room: Room): void {
  // Per-player redacted view: emit individually to each connected socket.
  for (const seat of room.seats) {
    if (!seat.connected || !seat.socketId) continue;
    const view = room.gameView(seat.id);
    if (view) io.to(seat.socketId).emit("game", view);
  }
}

io.on("connection", (socket) => {
  console.log(`[io] connect ${socket.id}`);

  socket.on("createRoom", ({ playerName }, ack) => {
    try {
      const name = (playerName ?? "").trim();
      if (!name) return ack({ ok: false, error: "name required" });
      const playerId = newPlayerId();
      const room = registry.create({ id: playerId, name, socketId: socket.id });
      attach(socket, room.code);
      ack({ ok: true, roomCode: room.code, playerId, room: room.roomView() });
      broadcastRoom(room);
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("joinRoom", ({ roomCode, playerName }, ack) => {
    try {
      const code = (roomCode ?? "").trim().toUpperCase();
      const name = (playerName ?? "").trim();
      if (!code) return ack({ ok: false, error: "room code required" });
      if (!name) return ack({ ok: false, error: "name required" });
      const room = registry.get(code);
      if (!room) return ack({ ok: false, error: "room not found" });
      if (room.game) return ack({ ok: false, error: "game already in progress" });
      const playerId = newPlayerId();
      room.addPlayer({ id: playerId, name, socketId: socket.id });
      attach(socket, room.code);
      ack({ ok: true, playerId, room: room.roomView() });
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
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
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
        room.markDisconnected(socket.id);
        broadcastRoom(room);
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
