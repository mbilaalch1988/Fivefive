import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@sequence/shared";

export type SequenceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let singleton: SequenceSocket | null = null;

export function getSocket(): SequenceSocket {
  if (singleton) return singleton;
  // VITE_SERVER_URL wins if set (e.g. for a separate API host).
  // Otherwise: in dev hit the local Node server on :3001; in prod use same-origin.
  const explicit = import.meta.env.VITE_SERVER_URL;
  const url = explicit ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
  singleton = io(url, { transports: ["websocket"], autoConnect: true });
  return singleton;
}

/** Promise-wrapped emit-with-ack. Use a single payload object per event. */
export function emit<E extends keyof ClientToServerEvents>(
  socket: SequenceSocket,
  event: E,
  payload?: unknown,
): Promise<unknown> {
  return new Promise((resolve) => {
    const args = payload === undefined ? [] : [payload];
    (socket.emit as (ev: string, ...a: unknown[]) => unknown)(
      event,
      ...args,
      (res: unknown) => resolve(res),
    );
  });
}
