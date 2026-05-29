import { useState } from "react";

interface Props {
  connected: boolean;
  error: string | null;
  onClearError: () => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string, name: string) => Promise<void>;
}

export function LandingScreen({
  connected,
  error,
  onClearError,
  onCreate,
  onJoin,
}: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const canCreate = name.trim().length > 0 && !busy && connected;
  const canJoin = canCreate && code.trim().length > 0;

  async function go(fn: () => Promise<void>) {
    setBusy(true);
    onClearError();
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-wide">Sequence</h1>
          <p className="text-slate-400 text-sm mt-1">
            {connected ? "Online" : "Connecting…"}
          </p>
        </header>

        {error && (
          <div className="bg-rose-700/80 px-3 py-2 rounded text-sm flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-rose-100 underline text-xs"
            >
              dismiss
            </button>
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-300">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={20}
              className="mt-1 w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 focus:border-amber-400 focus:outline-none"
              placeholder="e.g. Alex"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={!canCreate}
          onClick={() => go(() => onCreate(name.trim()))}
          className="w-full py-3 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 font-semibold"
        >
          Create new room
        </button>

        <div className="relative py-2 text-center">
          <span className="bg-slate-900 px-2 text-slate-500 text-xs relative z-10">
            or
          </span>
          <div className="absolute inset-x-0 top-1/2 border-t border-slate-700 -z-0" />
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-300">Room code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={6}
              className="mt-1 w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 focus:border-amber-400 focus:outline-none font-mono tracking-widest uppercase"
              placeholder="ABCD"
            />
          </label>
          <button
            type="button"
            disabled={!canJoin}
            onClick={() => go(() => onJoin(code.trim(), name.trim()))}
            className="w-full py-3 rounded bg-sky-600 hover:bg-sky-700 disabled:bg-slate-700 disabled:text-slate-400 font-semibold"
          >
            Join room
          </button>
        </div>
      </div>
    </div>
  );
}
