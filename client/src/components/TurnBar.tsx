import { useEffect, useState } from "react";
import type { GameView, PlayerId, Team } from "@fivefive/shared";
import { TEAM_CHIP } from "../lib/cards";
import { makeNickname } from "../lib/nickname";

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
}

/** Team-color CSS values keyed off the brand palette. The scorebar pill
 *  uses these for the chip dot and the swappable outer glow. */
const TEAM_COLOR_VAR: Record<Team, string> = {
  red:   "var(--ff-coral)",
  blue:  "var(--ff-sky)",
  green: "var(--ff-mint)",
};

/**
 * Top-of-screen scoreboard. Single black pill modelled on a soccer broadcast
 * overlay:  [⏱ timer] · [chip RED  N] · [brand mark] · [N  BLUE chip] · [meta]
 *
 * The outer glow tints to the CURRENT player's team color so a glance tells
 * you whose turn it is. Below the pill: compact player badges (still useful
 * for multi-player games), an optional reconnect banner, and the existing
 * turn-countdown progress bar that mirrors the timer text in the pill.
 */
export function TurnBar({ view, myPlayerId }: Props) {
  const nextIdx = (view.turnIdx + 1) % view.players.length;
  const currentPlayer = view.players[view.turnIdx];
  const currentTeam: Team | null = currentPlayer?.team ?? null;

  // Teams that actually have a player seated. Empty fivefive counts for
  // teams with no player don't render.
  const seatedTeams = new Set<Team>();
  for (const p of view.players) seatedTeams.add(p.team);

  // Order the pill: red·blue·green priority, drop unseated teams, then the
  // first two go in the pill and any third spills onto its own line beneath.
  const ordered: Team[] = (["red", "blue", "green"] as Team[]).filter((t) =>
    seatedTeams.has(t),
  );
  const leftTeam: Team = ordered[0] ?? "red";
  const rightTeam: Team = ordered[1] ?? "blue";
  const extraTeam: Team | null = ordered[2] ?? null;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <ScoreBarPill
        view={view}
        leftTeam={leftTeam}
        rightTeam={rightTeam}
        glowTeam={currentTeam}
      />

      {extraTeam !== null && (
        <ExtraTeamLine
          team={extraTeam}
          name={view.teamNames[extraTeam]}
          score={view.teamFivefiveCounts[extraTeam]}
        />
      )}

      {/* Player badges — compact row, current player highlighted, next subtly. */}
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

      {/* "Waiting for X to reconnect…" — only when it's the disconnected
          player's turn; the badge dot covers the off-turn case. */}
      {(() => {
        if (!currentPlayer || currentPlayer.connected || view.winner) return null;
        return (
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              background: "rgba(244, 63, 94, 0.1)",
              borderColor: "rgba(244, 63, 94, 0.4)",
              color: "#fda4af",
            }}
            data-testid="reconnect-banner"
          >
            <span className="reconnect-dot relative inline-flex w-2 h-2 rounded-full bg-rose-400" />
            Waiting for {currentPlayer.name} to reconnect…
          </div>
        );
      })()}

      {view.turnTimerSec !== null && view.turnExpiresAt !== null && !view.winner && (
        <TurnCountdown
          expiresAt={view.turnExpiresAt}
          totalSec={view.turnTimerSec}
          currentPlayerName={currentPlayer?.name ?? "Player"}
          isMyTurn={currentPlayer?.id === myPlayerId}
        />
      )}
    </div>
  );
}

/* ============================================================ */
/* ScoreBarPill — the main soccer-overlay pill                  */
/* ============================================================ */

function ScoreBarPill({
  view,
  leftTeam,
  rightTeam,
  glowTeam,
}: {
  view: GameView;
  leftTeam: Team;
  rightTeam: Team;
  glowTeam: Team | null;
}) {
  // Time slot: per-turn countdown if the host enabled one, else show "--:--"
  // so the slot doesn't collapse and surrounding spacing stays stable.
  const timeText = useTimerText(view);

  const glowColor = glowTeam ? TEAM_COLOR_VAR[glowTeam] : "var(--ff-gold)";

  return (
    <div
      className="ff-scorebar-pill"
      style={{ ["--ff-glow" as string]: glowColor }}
      data-testid="scorebar"
    >
      <div className="ff-scorebar-pill__time" data-testid="scorebar-time">
        {timeText}
      </div>

      <TeamSlot
        side="left"
        team={leftTeam}
        name={view.teamNames[leftTeam]}
        score={view.teamFivefiveCounts[leftTeam]}
      />

      <div className="ff-scorebar-pill__mark" aria-hidden="true">
        <MarkSvg />
      </div>

      <TeamSlot
        side="right"
        team={rightTeam}
        name={view.teamNames[rightTeam]}
        score={view.teamFivefiveCounts[rightTeam]}
      />

      <div className="ff-scorebar-pill__meta">
        <span>NEED&nbsp;{view.fivefivesToWin}</span>
        <span className="opacity-50">·</span>
        <span>{view.drawPileCount}&nbsp;LEFT</span>
      </div>
    </div>
  );
}

function TeamSlot({
  side,
  team,
  name,
  score,
}: {
  side: "left" | "right";
  team: Team;
  name: string;
  score: number;
}) {
  // Right side mirrors the left so the brand mark sits centered between
  // matching shapes (chip-name-score on left, score-name-chip on right).
  const chip = (
    <span
      className="ff-scorebar-pill__chip"
      style={{ background: TEAM_COLOR_VAR[team] }}
    />
  );
  const nameEl = <span className="ff-scorebar-pill__name">{name.toUpperCase().slice(0, 4)}</span>;
  const scoreEl = <span className="ff-scorebar-pill__score">{score}</span>;
  return (
    <div className={`ff-scorebar-pill__team ff-scorebar-pill__team--${side}`}>
      {side === "left" ? (
        <>
          {chip}
          {nameEl}
          {scoreEl}
        </>
      ) : (
        <>
          {scoreEl}
          {nameEl}
          {chip}
        </>
      )}
    </div>
  );
}

function ExtraTeamLine({ team, name, score }: { team: Team; name: string; score: number }) {
  return (
    <div className="ff-scorebar-extra" data-testid="scorebar-extra-team">
      <span
        className="ff-scorebar-pill__chip"
        style={{ background: TEAM_COLOR_VAR[team] }}
      />
      <span className="ff-scorebar-pill__name">{name.toUpperCase().slice(0, 4)}</span>
      <span className="ff-scorebar-pill__score">{score}</span>
    </div>
  );
}

/** Brand mark in the center of the pill — five chips in a row, center coral. */
function MarkSvg() {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="6" width="88" height="88" rx="20" fill="var(--ff-gold)" stroke="var(--ff-navy-ink)" strokeWidth="3" />
      <g stroke="var(--ff-navy-ink)" strokeWidth="2.6">
        <circle cx="18" cy="50" r="5.2" fill="var(--ff-navy)" />
        <circle cx="34" cy="50" r="5.2" fill="var(--ff-navy)" />
        <circle cx="50" cy="50" r="6.8" fill="var(--ff-coral)" />
        <circle cx="66" cy="50" r="5.2" fill="var(--ff-navy)" />
        <circle cx="82" cy="50" r="5.2" fill="var(--ff-navy)" />
      </g>
    </svg>
  );
}

/* ============================================================ */
/* useTimerText — picks turn-countdown text or a stable dash    */
/* ============================================================ */

function useTimerText(view: GameView): string {
  const [remaining, setRemaining] = useState<number | null>(() =>
    view.turnExpiresAt
      ? Math.max(0, Math.ceil((view.turnExpiresAt - Date.now()) / 1000))
      : null,
  );
  useEffect(() => {
    if (view.turnExpiresAt === null || view.winner !== null) {
      setRemaining(null);
      return;
    }
    function tick() {
      setRemaining(Math.max(0, Math.ceil((view.turnExpiresAt! - Date.now()) / 1000)));
    }
    tick();
    const h = window.setInterval(tick, 250);
    return () => window.clearInterval(h);
  }, [view.turnExpiresAt, view.winner]);

  if (remaining === null) return "––:––";
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/* ============================================================ */
/* TurnCountdown — thin progress bar that mirrors the timer     */
/* ============================================================ */

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
      className="w-full max-w-md flex items-center gap-2 px-2 py-1 rounded-2xl text-xs"
      style={{ background: "var(--md-surface-1)" }}
      data-testid="turn-countdown"
    >
      <div className="flex-1 h-1.5 rounded-full bg-ff-navy-soft overflow-hidden">
        <div
          className={`h-full ${fillColor} transition-all duration-200`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 truncate max-w-[8rem] text-ff-cream">
        {isMyTurn ? "your turn" : currentPlayerName}
      </span>
    </div>
  );
}

/* ============================================================ */
/* PlayerBadge — same component as before, unchanged behaviour  */
/* ============================================================ */

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
