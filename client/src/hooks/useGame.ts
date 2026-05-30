import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Action,
  DeckSummary,
  GameView,
  PlayerId,
  RoomView,
  Team,
} from "@sequence/shared";
import { emit, getSocket, type SequenceSocket } from "../lib/socket";
import { supabase } from "../lib/supabase";

/** Fetch the current Supabase access token, if signed in. Used as a bearer
 *  for createRoom / joinRoom so the server can tie scores to user_id. */
async function currentAuthToken(): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? undefined;
}

export type Phase = "landing" | "lobby" | "game";

const STORAGE_KEY = "sequence.session";

interface StoredSession {
  roomCode: string;
  playerId: PlayerId;
}

function loadStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveStored(s: StoredSession | null): void {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export interface UseGame {
  phase: Phase;
  connected: boolean;
  playerId: PlayerId | null;
  roomCode: string | null;
  room: RoomView | null;
  game: GameView | null;
  error: string | null;
  clearError: () => void;

  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => Promise<void>;
  leave: () => Promise<void>;
  chooseTeam: (team: Team) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  decks: DeckSummary[];
  startGame: (opts?: { sequencesToWin?: number; deckId?: string | null }) => Promise<void>;
  stopGame: () => Promise<void>;
  renameTeam: (team: Team, name: string) => Promise<void>;
  doAction: (action: Action) => Promise<{ ok: boolean; error?: string }>;
}

export function useGame(): UseGame {
  const socketRef = useRef<SequenceSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decks, setDecks] = useState<DeckSummary[]>([]);

  const phase: Phase = game ? "game" : room ? "lobby" : "landing";

  // Fetch available decks once on mount.
  useEffect(() => {
    const apiBase =
      import.meta.env.VITE_SERVER_URL ??
      (import.meta.env.DEV ? "http://localhost:3001" : "");
    fetch(`${apiBase}/api/decks`)
      .then((r) => (r.ok ? r.json() : { decks: [] }))
      .then((data: { decks: DeckSummary[] }) => setDecks(data.decks ?? []))
      .catch(() => setDecks([]));
  }, []);

  // Socket lifecycle + event subscriptions.
  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    const onConnect = () => {
      setConnected(true);
      // On (re)connect, attempt to rejoin if we have stored credentials.
      const stored = loadStored();
      if (stored) {
        void rejoinStored(s, stored).then((restored) => {
          if (restored) {
            setPlayerId(stored.playerId);
            setRoomCode(stored.roomCode);
            setRoom(restored.room);
            setGame(restored.game);
          } else {
            saveStored(null);
          }
        });
      }
    };

    const onDisconnect = () => setConnected(false);
    const onRoom = (r: RoomView) => {
      setRoom(r);
      // Server cleared the game (host stopped it, or it ended) — drop our copy
      // so the App router falls back to the lobby screen.
      if (!r.inGame) setGame(null);
    };
    const onGame = (g: GameView) => setGame(g);
    const onErr = (m: string) => setError(m);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("room", onRoom);
    s.on("game", onGame);
    s.on("errorMsg", onErr);

    // If already connected (Vite HMR re-mounts), run onConnect once.
    if (s.connected) onConnect();

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("room", onRoom);
      s.off("game", onGame);
      s.off("errorMsg", onErr);
    };
  }, []);

  const handleAck = useCallback(
    (res: unknown): { ok: boolean; error?: string } => {
      const r = res as { ok: boolean; error?: string };
      if (!r.ok) setError(r.error ?? "request failed");
      return r;
    },
    [],
  );

  const createRoom = useCallback(
    async (name: string) => {
      const s = socketRef.current!;
      const authToken = await currentAuthToken();
      const res = (await emit(s, "createRoom", { playerName: name, authToken })) as
        | { ok: true; roomCode: string; playerId: PlayerId; room: RoomView }
        | { ok: false; error: string };
      handleAck(res);
      if (res.ok) {
        setPlayerId(res.playerId);
        setRoomCode(res.roomCode);
        setRoom(res.room);
        saveStored({ roomCode: res.roomCode, playerId: res.playerId });
      }
    },
    [handleAck],
  );

  const joinRoom = useCallback(
    async (code: string, name: string) => {
      const s = socketRef.current!;
      const authToken = await currentAuthToken();
      const res = (await emit(s, "joinRoom", {
        roomCode: code.toUpperCase(),
        playerName: name,
        authToken,
      })) as
        | { ok: true; playerId: PlayerId; room: RoomView }
        | { ok: false; error: string };
      handleAck(res);
      if (res.ok) {
        setPlayerId(res.playerId);
        setRoomCode(code.toUpperCase());
        setRoom(res.room);
        saveStored({ roomCode: code.toUpperCase(), playerId: res.playerId });
      }
    },
    [handleAck],
  );

  const leave = useCallback(async () => {
    const s = socketRef.current!;
    await emit(s, "leaveRoom");
    setRoom(null);
    setGame(null);
    setPlayerId(null);
    setRoomCode(null);
    saveStored(null);
  }, []);

  const chooseTeam = useCallback(
    async (team: Team) => {
      const s = socketRef.current!;
      const res = (await emit(s, "chooseTeam", { team })) as {
        ok: boolean;
        error?: string;
      };
      handleAck(res);
    },
    [handleAck],
  );

  const setReady = useCallback(
    async (ready: boolean) => {
      const s = socketRef.current!;
      const res = (await emit(s, "setReady", { ready })) as {
        ok: boolean;
        error?: string;
      };
      handleAck(res);
    },
    [handleAck],
  );

  const startGame = useCallback(
    async (opts: { sequencesToWin?: number; deckId?: string | null } = {}) => {
      const s = socketRef.current!;
      const res = (await emit(s, "startGame", opts)) as {
        ok: boolean;
        error?: string;
      };
      handleAck(res);
    },
    [handleAck],
  );

  const stopGame = useCallback(async () => {
    const s = socketRef.current!;
    const res = (await emit(s, "stopGame")) as { ok: boolean; error?: string };
    handleAck(res);
  }, [handleAck]);

  const renameTeam = useCallback(
    async (team: Team, name: string) => {
      const s = socketRef.current!;
      const res = (await emit(s, "renameTeam", { team, name })) as {
        ok: boolean;
        error?: string;
      };
      handleAck(res);
    },
    [handleAck],
  );

  const doAction = useCallback(
    async (action: Action) => {
      const s = socketRef.current!;
      const res = (await emit(s, "doAction", action)) as {
        ok: boolean;
        error?: string;
      };
      handleAck(res);
      return res;
    },
    [handleAck],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    phase,
    connected,
    playerId,
    roomCode,
    room,
    game,
    error,
    clearError,
    createRoom,
    joinRoom,
    leave,
    chooseTeam,
    setReady,
    decks,
    startGame,
    stopGame,
    renameTeam,
    doAction,
  };
}

async function rejoinStored(
  s: SequenceSocket,
  stored: StoredSession,
): Promise<{ room: RoomView; game: GameView | null } | null> {
  const res = (await emit(s, "rejoin", stored)) as
    | { ok: true; room: RoomView; game: GameView | null }
    | { ok: false; error: string };
  if (!res.ok) return null;
  return { room: res.room, game: res.game };
}
