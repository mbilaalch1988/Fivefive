import { cloneElement, useMemo, type CSSProperties, type ReactElement } from "react";

/**
 * Ambient background loops for non-playable screens (landing, lobby,
 * spectate-lobby, hall-of-fame). Five variants from the brand canvas:
 * 1. confetti — outlined chips drift up from below
 * 2. grid — pulsing dot grid with a winning diagonal lit in coral
 * 3. glow — four soft orbs drift slowly, screen-blend
 * 4. fall — chips rain from above
 * 5. parallax — three rows of chips pan at different speeds
 *
 * Keyframes live in index.css (ff-bg-*). All elements use CSS vars
 * from the brand palette so swapping --ff-* recolors the loops.
 */
export type BackgroundVariant =
  | "confetti"
  | "grid"
  | "glow"
  | "fall"
  | "parallax";

const ALL_VARIANTS: BackgroundVariant[] = [
  "confetti",
  "grid",
  "glow",
  "fall",
  "parallax",
];

/* Mulberry32 — small deterministic PRNG so a seed gives stable layout. */
function mulberry(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BackgroundLoopProps {
  /** Specific variant; omit to pick one at random on mount. */
  variant?: BackgroundVariant;
  /** Optional className to merge with the fixed-fill wrapper. */
  className?: string;
}

export function BackgroundLoop({
  variant,
  className = "",
}: BackgroundLoopProps) {
  // Pick a variant once per mount so re-renders don't reshuffle the layout
  // mid-animation. New page visit → fresh background.
  const chosen = useMemo<BackgroundVariant>(
    () => variant ?? ALL_VARIANTS[Math.floor(Math.random() * ALL_VARIANTS.length)]!,
    [variant],
  );

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 -z-0 pointer-events-none overflow-hidden ${className}`}
    >
      {renderVariant(chosen)}
    </div>
  );
}

function renderVariant(v: BackgroundVariant): ReactElement {
  switch (v) {
    case "confetti": return <ConfettiRise />;
    case "grid":     return <SequenceGrid />;
    case "glow":     return <DriftingGlow />;
    case "fall":     return <FallingChips />;
    case "parallax": return <DotParallax />;
  }
}

/* ============================================================ */
/* Variant 1 — Confetti rise                                    */
/* ============================================================ */
function ConfettiRise() {
  const rand = useMemo(() => mulberry(11), []);
  const cols = ["var(--ff-gold)", "var(--ff-coral)", "var(--ff-sky)", "var(--ff-mint)"];
  const parts = useMemo(() => {
    const out: ReactElement[] = [];
    for (let i = 0; i < 26; i++) {
      const c = cols[Math.floor(rand() * cols.length)]!;
      const sz = 8 + Math.floor(rand() * 20);
      const left = rand() * 100;
      const dur = 7 + rand() * 8;
      const delay = -rand() * dur;
      const driftDur = 2.4 + rand() * 1.8;
      const driftDelay = -rand() * driftDur;
      const filled = rand() < 0.25;
      out.push(
        <span
          key={`p${i}`}
          style={{
            position: "absolute",
            left: `${left}%`,
            bottom: "-10%",
            animation: `ff-bg-rise ${dur}s linear ${delay}s infinite`,
          }}
        >
          <span
            style={{
              display: "block",
              width: sz,
              height: sz,
              borderRadius: 999,
              border: `3px solid ${c}`,
              background: filled ? c : "transparent",
              boxSizing: "border-box",
              animation: `ff-bg-drift ${driftDur}s ease-in-out ${driftDelay}s infinite`,
            }}
          />
        </span>,
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Glow x="20%" y="25%" size={360} color="var(--ff-gold)"  opacity={0.10} />
      <Glow x="85%" y="82%" size={380} color="var(--ff-coral)" opacity={0.09} />
      {parts}
    </>
  );
}

/* ============================================================ */
/* Variant 2 — Sequence grid                                    */
/* ============================================================ */
function SequenceGrid() {
  const cols = 11;
  const rows = 6;
  const dots = useMemo(() => {
    const out: ReactElement[] = [];
    let k = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ((i + 0.5) / cols) * 100;
        const y = ((j + 0.5) / rows) * 100;
        const pulseDur = 3.4 + ((i + j) % 4) * 0.6;
        const pulseDelay = ((i * j) % 7) * 0.2;
        out.push(
          <span
            key={`d${k++}`}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: 9,
              height: 9,
              marginLeft: -4.5,
              marginTop: -4.5,
              borderRadius: 999,
              border: "2px solid var(--ff-gold)",
              boxSizing: "border-box",
              animation: `ff-bg-pulse ${pulseDur}s ease-in-out ${pulseDelay}s infinite`,
            }}
          />,
        );
      }
    }
    return out;
  }, []);
  const winning = useMemo(() => {
    const diag: Array<[number, number]> = [[3, 1], [4, 2], [5, 3], [6, 4], [7, 5]];
    return diag.map(([cx, cy], idx) => {
      const x = ((cx + 0.5) / cols) * 100;
      const y = ((cy + 0.5) / rows) * 100;
      const center = idx === 2;
      const sz = center ? 22 : 17;
      return (
        <span
          key={`w${idx}`}
          style={{
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            width: sz,
            height: sz,
            marginLeft: -sz / 2,
            marginTop: -sz / 2,
            borderRadius: 999,
            background: center ? "var(--ff-coral)" : "var(--ff-gold)",
            border: "2.5px solid var(--ff-navy-ink)",
            boxSizing: "border-box",
            animation: `ff-bg-win 3.2s ease-in-out ${idx * 0.22}s infinite`,
          }}
        />
      );
    });
  }, []);
  return (
    <>
      <Glow x="50%" y="50%" size={440} color="var(--ff-gold)" opacity={0.06} />
      {dots}
      {winning}
    </>
  );
}

/* ============================================================ */
/* Variant 3 — Drifting glow                                    */
/* ============================================================ */
function DriftingGlow() {
  const orbs: Array<[string, string, number, string, number, number]> = [
    ["30%", "42%", 360, "var(--ff-gold)",  24, 0.42],
    ["72%", "64%", 400, "var(--ff-coral)", 20, 0.36],
    ["56%", "24%", 300, "var(--ff-sky)",   17, 0.34],
    ["20%", "82%", 280, "var(--ff-mint)",  26, 0.28],
  ];
  return (
    <>
      {orbs.map(([x, y, s, c, dur, op], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: s,
            height: s,
            marginLeft: -s / 2,
            marginTop: -s / 2,
            borderRadius: 999,
            background: `radial-gradient(circle, ${c} 0%, transparent 68%)`,
            opacity: op,
            mixBlendMode: "screen",
            animation: `ff-bg-orb ${dur}s ease-in-out infinite`,
          }}
        />
      ))}
    </>
  );
}

/* ============================================================ */
/* Variant 4 — Falling chips                                    */
/* ============================================================ */
function FallingChips() {
  const rand = useMemo(() => mulberry(7), []);
  const cols = ["var(--ff-gold)", "var(--ff-coral)", "var(--ff-sky)", "var(--ff-mint)"];
  const xs = [9, 20, 31, 42, 53, 64, 75, 86, 93];
  const parts = useMemo(() => {
    const out: ReactElement[] = [];
    for (let i = 0; i < 15; i++) {
      const l = xs[i % xs.length]! + (rand() * 4 - 2);
      const sz = 14 + Math.floor(rand() * 12);
      const c = cols[Math.floor(rand() * cols.length)]!;
      const dur = 3.4 + rand() * 2.6;
      const del = -rand() * dur;
      const top = 18 + rand() * 72;
      out.push(
        <span
          key={`f${i}`}
          style={{
            position: "absolute",
            left: `${l}%`,
            top: `${top}%`,
            width: sz,
            height: sz,
            marginLeft: -sz / 2,
            borderRadius: 999,
            background: c,
            border: "2.5px solid var(--ff-navy-ink)",
            boxSizing: "border-box",
            animation: `ff-bg-fall ${dur}s cubic-bezier(.45,0,.5,1) ${del}s infinite`,
          }}
        />,
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Glow x="50%" y="112%" size={440} color="var(--ff-gold)" opacity={0.08} />
      {parts}
    </>
  );
}

/* ============================================================ */
/* Variant 5 — Dot parallax                                     */
/* ============================================================ */
function DotParallax() {
  return (
    <>
      <Glow x="50%" y="50%" size={440} color="var(--ff-sky)" opacity={0.06} />
      <ParallaxRow base="var(--ff-sky)"  speed={22} top="18%" size={12} hasWin={false} />
      <ParallaxRow base="var(--ff-gold)" speed={13} top="46%" size={18} hasWin={true}  />
      <ParallaxRow base="var(--ff-mint)" speed={9}  top="74%" size={10} hasWin={false} />
    </>
  );
}

function ParallaxRow({
  base, speed, top, size, hasWin,
}: { base: string; speed: number; top: string; size: number; hasWin: boolean }) {
  const seq = useMemo(() => {
    const n = 18;
    const out: ReactElement[] = [];
    for (let i = 0; i < n; i++) {
      const inWin = hasWin && i >= 6 && i <= 10;
      const c = inWin ? (i === 8 ? "var(--ff-coral)" : "var(--ff-gold)") : base;
      out.push(
        <span
          key={`s${i}`}
          style={{
            flex: "none",
            width: size,
            height: size,
            borderRadius: 999,
            border: `2.5px solid ${inWin ? "var(--ff-navy-ink)" : c}`,
            background: inWin ? c : "transparent",
            opacity: inWin ? 1 : 0.6,
            boxSizing: "border-box",
          }}
        />,
      );
    }
    return out;
  }, [base, size, hasWin]);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          gap: `${size * 1.5}px`,
          width: "max-content",
          animation: `ff-bg-pan ${speed}s linear infinite`,
        }}
      >
        {seq}
        {seq.map((el, i) => cloneElement(el, { key: `b${i}` }))}
      </div>
    </div>
  );
}

/* Shared: soft radial glow blob used as the bottom layer of several variants. */
function Glow({ x, y, size, color, opacity }: {
  x: string; y: string; size: number; color: string; opacity: number;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    borderRadius: 999,
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    opacity,
    pointerEvents: "none",
  };
  return <div style={style} />;
}
