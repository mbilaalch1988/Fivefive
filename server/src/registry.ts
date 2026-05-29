import { Room } from "./room.js";
import { newRoomCode } from "./util.js";

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(host: { id: string; name: string; socketId: string }): Room {
    let code = newRoomCode();
    let tries = 0;
    while (this.rooms.has(code)) {
      code = newRoomCode();
      if (++tries > 100) throw new Error("could not allocate a unique room code");
    }
    const room = new Room(code, host);
    this.rooms.set(code, room);
    return room;
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  /** For diagnostics. */
  size(): number {
    return this.rooms.size;
  }
}
