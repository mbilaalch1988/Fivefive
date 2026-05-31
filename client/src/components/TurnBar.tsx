import type { GameView, PlayerId, Team } from "@sequence/shared";
import { TEAM_CHIP } from "../lib/cards";
import { makeNickname } from "../lib/nickname";

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
}

export function TurnBar({ view, myPlayerId }: Props) {
  const teams = Object.keys(view.teamSequenceCounts) as Team[];
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

      <div
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-2 sm:p-2.5 rounded-2xl text-xs sm:text-sm"
        style={{ background: "var(--md-surface-1)" }}
      >
        <span style={{ color: "var(--md-on-surface-variant)" }}>Need {view.sequencesToWin}:</span>
        {teams.map((t) => {
          const count = view.teamSequenceCounts[t];
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
  const nick = makeNickname(name);
  // Visual hierarchy: current > next > others. Implemented via ring color +
  // glow strength + scale. All badges keep their team chip color so identity
  // stays readable.
  const ring = isCurrent
    ? "ring-4 ring-amber-300 shadow-[0_0_14px_3px_rgba(252,211,77,0.7)] scale-110"
    : isNext
      ? "ring-2 ring-zinc-200/60 shadow-[0_0_8px_1px_rgba(228,228,231,0.35)]"
      : "ring-1 ring-white/10";
  const dim = !isCurrent && !isNext ? "opacity-70" : "";
  return (
    <div
      title={`${name}${isCurrent ? " (current turn)" : isNext ? " (up next)" : ""}`}
      className={`relative transition-all ${dim}`}
    >
      <div
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${TEAM_CHIP[team]} ${ring}`}
        style={{
          boxShadow:
            "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1.5px 2px rgba(0,0,0,0.25)",
        }}
      >
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
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[0.55rem] uppercase tracking-widest text-rose-400"
          title="offline"
        >
          ✕
        </span>
      )}
    </div>
  );
}
