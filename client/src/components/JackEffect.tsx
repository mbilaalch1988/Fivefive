interface Props {
  /** Screen-space rectangle of the targeted board cell. */
  rect: { left: number; top: number; width: number; height: number };
  /** "remove" = one-eyed Jack; "place" = two-eyed Jack. */
  variant: "remove" | "place";
}

/**
 * One-shot transient overlay drawn over a Jack-target cell.
 *
 * Two-eyed Jack (place): magical sparkle burst — central glow, expanding
 * starburst, and 8 sparkles radiating outward. Indigo-amber tones to
 * suggest "wild placement."
 *
 * One-eyed Jack (remove): electric zap + crack — central glow, sharp
 * lightning bolts on 4 axes, and an outward shockwave. Rose-red tones
 * to suggest "destruction."
 */
export function JackEffect({ rect, variant }: Props) {
  return (
    <div
      className="fixed pointer-events-none z-30"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    >
      {variant === "place" ? <TwoEyedJackBurst /> : <OneEyedJackZap />}
    </div>
  );
}

/* ---------------- Two-eyed Jack: magical burst ---------------- */
function TwoEyedJackBurst() {
  // 8 sparkles at compass points, staggered.
  const sparkles = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className="absolute inset-0">
      {/* Outer halo glow. */}
      <div className="jack2-glow" />
      {/* Expanding starburst frame. */}
      <div className="jack2-burst" />
      {/* Central spinning starlette. */}
      <div className="jack2-star">✦</div>
      {/* Sparkles radiating outward. */}
      {sparkles.map((i) => {
        const angle = (i / sparkles.length) * 360;
        return (
          <span
            key={i}
            className="jack2-sparkle"
            style={{
              transform: `rotate(${angle}deg) translateY(-1.4em)`,
              animationDelay: `${i * 60}ms`,
            }}
          >
            ✦
          </span>
        );
      })}
    </div>
  );
}

/* ---------------- One-eyed Jack: electric zap ----------------- */
function OneEyedJackZap() {
  // 4 lightning bolts at NE/SE/SW/NW for an "X" shatter pattern.
  const bolts = [45, 135, 225, 315];
  return (
    <div className="absolute inset-0">
      {/* Initial flash. */}
      <div className="jack1-flash" />
      {/* Outward shockwave ring. */}
      <div className="jack1-shock" />
      {/* Lightning bolts. */}
      {bolts.map((a, i) => (
        <span
          key={i}
          className="jack1-bolt"
          style={{
            transform: `rotate(${a}deg) translateY(-50%)`,
            animationDelay: `${i * 30}ms`,
          }}
        />
      ))}
      {/* Central X glyph that smashes in then fades. */}
      <div className="jack1-glyph">✕</div>
    </div>
  );
}
