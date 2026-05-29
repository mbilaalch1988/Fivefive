/**
 * End-to-end smoke test against a running server on $PORT (default 3001).
 * Two clients create + join a room, ready up, start the game, and play one
 * action. Exits 0 on success, non-zero on any failure.
 */
import { io as ioClient, type Socket } from "socket.io-client";
import {
  buildCardIndex,
  cardKey,
  type ClientToServerEvents,
  type GameView,
  type RoomView,
  type ServerToClientEvents,
} from "@sequence/shared";

const URL = `http://localhost:${process.env.PORT ?? 3001}`;

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

function emitAck<T>(
  s: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const args: unknown[] = payload === undefined ? [] : [payload];
    (s.emit as any)(event, ...args, (res: any) => {
      if (res && res.ok === false) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

function once<E extends keyof ServerToClientEvents>(
  s: Client,
  ev: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((res) => {
    s.once(ev as string, (payload: any) => res(payload));
  });
}

async function connect(): Promise<Client> {
  const s: Client = ioClient(URL, { transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });
  return s;
}

function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  const a = await connect();
  const b = await connect();

  const aRoom = await emitAck<{ ok: true; roomCode: string; playerId: string; room: RoomView }>(
    a,
    "createRoom",
    { playerName: "Alice" },
  );
  console.log(`[a] created room ${aRoom.roomCode}`);

  const bWaitRoom = once(b, "room");
  const bJoin = await emitAck<{ ok: true; playerId: string; room: RoomView }>(
    b,
    "joinRoom",
    { roomCode: aRoom.roomCode, playerName: "Bob" },
  );
  await bWaitRoom; // sanity: b also gets a room push from join
  console.log(`[b] joined as ${bJoin.playerId}`);

  // Track latest room broadcasts.
  let aLatestRoom: RoomView = aRoom.room;
  let bLatestRoom: RoomView = bJoin.room;
  a.on("room", (r) => (aLatestRoom = r));
  b.on("room", (r) => (bLatestRoom = r));

  await emitAck(a, "chooseTeam", { team: "red" });
  await emitAck(b, "chooseTeam", { team: "blue" });
  await emitAck(a, "setReady", { ready: true });
  await emitAck(b, "setReady", { ready: true });

  // Both clients listen for the game push from startGame.
  const aGame = once(a, "game");
  const bGame = once(b, "game");
  await emitAck(a, "startGame", { sequencesToWin: 1 });
  const aView = await aGame;
  const bView = await bGame;

  expect(aView.myHand.length === 7, "Alice has 7 cards");
  expect(bView.myHand.length === 7, "Bob has 7 cards");
  expect(aView.players.length === 2, "two players in game");
  expect(aLatestRoom.inGame === true, "room marked inGame after start");
  expect(bLatestRoom.inGame === true, "Bob's room view also marked inGame");

  // Privacy: Alice's view must not expose Bob's hand.
  const bobInAView = aView.players.find((p) => p.id === bJoin.playerId)!;
  expect(bobInAView.handCount === 7, "Bob's handCount visible to Alice");
  expect((bobInAView as any).hand === undefined, "Alice does not see Bob's hand");

  // Pick a playable non-Jack from Alice's hand and play it.
  const idx = buildCardIndex(aView.board);
  let played = false;
  for (const card of aView.myHand) {
    if (card.rank === "J") continue;
    const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
    for (const p of positions) {
      if (aView.chips[p.r]![p.c] === null) {
        const aNext = once(a, "game");
        const bNext = once(b, "game");
        await emitAck(a, "doAction", { type: "place", cardId: card.id, pos: p });
        const a2 = await aNext;
        const b2 = await bNext;
        expect(a2.chips[p.r]![p.c] === "red", "chip placed for Alice");
        expect(b2.chips[p.r]![p.c] === "red", "Bob sees same chip");
        expect(a2.turnIdx === 1, "turn advanced to Bob");
        expect(a2.myHand.length === 7, "Alice drew a replacement");
        played = true;
        break;
      }
    }
    if (played) break;
  }
  expect(played, "Alice found a playable card");

  a.disconnect();
  b.disconnect();
  console.log("OK: end-to-end smoke test passed");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
