import { randomBytes } from "node:crypto";

/** 16-hex-char id, sufficient for player identity across reconnects. */
export function newPlayerId(): string {
  return randomBytes(8).toString("hex");
}

/** Unambiguous room code alphabet (no 0/O, 1/I, etc.). */
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode(length = 4): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ROOM_ALPHABET[bytes[i]! % ROOM_ALPHABET.length];
  }
  return out;
}
