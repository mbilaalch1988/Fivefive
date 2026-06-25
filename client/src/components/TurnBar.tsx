import { useEffect, useState } from "react";
import type { GameView, PlayerId, Team } from "@fivefive/shared";
import { TEAM_CHIP } from "../lib/cards";
import { makeNickname } from "../lib/nickname";

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
}

export function TurnBar({ view, myPlayerId }: Props) {
  const teams = Object.keys(view.teamFivefiveCounts) as Team[];
  const nextIdx = (view.turnIdx + 1) % view.players.length;

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Row of player badges — current player highlighted, next subtly. */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center justify-center">
        {view.players.map((p, i) => {
          const isCurrent = i === view.turnIdx;
          const isNext = i === nextIdx && !isCurrent;
          const isMe = p.id === myPlayerId;
          return (
            <PlayerBadge
              key={p.id}
              name={p.name}
              team={p.team}
              isCurrent={isCurrent}
              isNext={isNext}
              isMe={isMe}
              connected={p.connected}
            />
          );
        })}
      </div>

      {/* "Waiting for X to reconnect…" — only shown when it's the disconnected
          player's turn, otherwise the badge dot is enough. */}
      {(() => {
        const current = view.players[view.turnIdx];
        if (!current || current.connected || view.winner) return null;
        return (
          <div
            className="self-center inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              background: "rgba(244, 63, 94, 0.1)",
              borderColor: "rgba(244, 63, 94, 0.4)",
              color: "#fda4af",
            }}
            data-testid="reconnect-banner"
          >
            <span className="reconnect-dot relative inline-flex w-2 h-2 rounded-full bg-rose-400" />
            Waiting for {current.name} to reconnect…
          </div>
        );
      })()}

      <div
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-2 sm:p-2.5 rounded-2xl text-xs sm:text-sm"
        style={{ background: "var(--md-surface-1)" }}
      >
        <span style={{ color: "var(--md-on-surface-variant)" }}>Need {view.fivefivesToWin}:</span>
        {teams.map((t) => {
          const count = view.teamFivefiveCounts[t];
          if (count === 0 && !view.players.some((p) => p.team === t)) return null;
          return (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded-full border ${TEAM_CHIP[t]}`} />
              {view.teamNames[t]}: <span className="font-semibold">{count}</span>
            </span>
          );
        })}
        <span className="ml-auto" style={{ color: "var(--md-on-surface-variant)" }}>
          Draw: {view.drawPileCount}
        </span>
      </div>

      {view.turnTimerSec !== null && view.turnExpiresAt !== null && !view.winner && (
        <TurnCountdown
          expiresAt={view.turnExpiresAt}
          totalSec={view.turnTimerSec}
          currentPlayerName={view.players[view.turnIdx]?.name ?? "Player"}
          isMyTurn={view.players[view.turnIdx]?.id === myPlayerId}
        />
      )}
    </div>
  );
}

function TurnCountdown({
  expiresAt,
  totalSec,
  currentPlayerName,
  isMyTurn,
}: {
  expiresAt: number;
  totalSec: number;
  currentPlayerName: string;
  isMyTurn: boolean;
}) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
  );
  useEffect(() => {
    function tick() {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }
    tick();
    const h = window.setInterval(tick, 250);
    return () => window.clearInterval(h);
  }, [expiresAt]);

  const pct = Math.max(0, Math.min(100, (remaining / totalSec) * 100));
  const urgent = remaining <= 10;
  const fillColor = urgent ? "bg-rose-500" : remaining <= 20 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div
      className="w-full flex items-center gap-2 px-2 py-1 rounded-2xl text-xs"
      style={{ background: "var(--md-surface-1)" }}
      data-testid="turn-countdown"
    >
      <span className={`shrink-0 font-semibold tabular-nums ${urgent ? "text-rose-300" : "text-ff-cream"}`}>
        ⏱ {remaining}s
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-ff-navy-soft overflow-hidden">
        <div
          className={`h-full ${fillColor} transition-all duration-200`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 truncate max-w-[8rem]" style={{ color: "var(--md-on-surface-variant)" }}>
        {isMyTurn ? "your turn" : currentPlayerName}
      </span>
    </div>
  );
}

function PlayerBadge({
  name,
  team,
  isCurrent,
  isNext,
  isMe,
  connected,
}: {
  name: string;
  team: Team;
  isCurrent: boolean;
  isNext: boolean;
  isMe: boolean;
  connected: boolean;
}) {
  const isBot = /\bbot\b/i.test(name);
  const nick = makeNickname(name);
  // Visual hierarchy: current > next > others. Current player uses an animated
  // gold pulse (.turn-pulse drives the box-shadow keyframe) instead of a flat
  // ring — much harder to miss than the static highlight before.
  const ring = isCurrent
    ? "turn-pulse scale-110"
    : isNext
      ? "ring-2 ring-zinc-200/60 shadow-[0_0_8px_1px_rgba(228,228,231,0.35)]"
      : "ring-1 ring-white/10";
  const dim = !isCurrent && !isNext ? "opacity-70" : "";
  return (
    <div
      title={`${name}${isCurrent ? " (current turn)" : isNext ? " (up next)" : ""}`}
      className={`relative transition-opacity duration-500 ease-out ${dim}`}
    >
      <div
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-all duration-500 ease-out ${TEAM_CHIP[team]} ${ring}`}
        style={{
          boxShadow:
            "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1.5px 2px rgba(0,0,0,0.25)",
        }}
      >
        {isBot && (
          <span className="text-white text-[0.65rem] leading-none" aria-label="bot">🤖</span>
        )}
        <span className="text-white text-xs sm:text-sm font-bold tracking-wide leading-none">
          {nick}
        </span>
        {isMe && (
          <span className="text-amber-200 text-[0.55rem] sm:text-[0.65rem] uppercase tracking-widest font-semibold leading-none">
            you
          </span>
        )}
      </div>
      {!connected && (
        <span
          className="reconnect-dot absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-zinc-900"
          title="reconnecting…"
          aria-label="reconnecting"
        />
      )}
    </div>
  );
}
