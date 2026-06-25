/**
 * Connect as a player, join the given room, pick a team, mark ready, then hold
 * the connection open. Usage:
 *   tsx scripts/joinAs.ts <ROOM_CODE> <NAME> <TEAM>
 * Press Ctrl-C to disconnect.
 */
import { io as ioClient, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@fivefive/shared";

const URL = `http://localhost:${process.env.PORT ?? 3001}`;

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

function emitAck<T>(s: Client, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const args = payload === undefined ? [] : [payload];
    (s.emit as any)(event, ...args, (res: any) => {
      if (res && res.ok === false) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

async function main() {
  const [roomCode, name, team] = process.argv.slice(2);
  if (!roomCode || !name || !team) {
    console.error("usage: joinAs.ts <ROOM_CODE> <NAME> <TEAM>");
    process.exit(2);
  }

  const s: Client = ioClient(URL, { transports: ["websocket"] });
  await new Promise<void>((res, rej) => {
    s.once("connect", () => res());
    s.once("connect_error", rej);
  });

  s.on("room", (r) => console.log(`[room] seats=${r.seats.map((x) => `${x.name}/${x.team}/${x.ready ? "R" : "_"}`).join(",")} inGame=${r.inGame}`));
  s.on("game", (g) => console.log(`[game] turn=${g.players[g.turnIdx]?.name} draw=${g.drawPileCount} winner=${g.winner ?? "-"}`));

  const join = await emitAck<{ ok: true; playerId: string }>(s, "joinRoom", {
    roomCode,
    playerName: name,
  });
  console.log(`joined ${roomCode} as ${name} (${join.playerId})`);

  await emitAck(s, "chooseTeam", { team });
  await emitAck(s, "setReady", { ready: true });
  console.log(`${name}: team=${team} ready=true`);

  process.on("SIGINT", () => {
    s.disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
