interface Props {
  /** Screen-space rectangle of the targeted board cell. */
  rect: { left: number; top: number; width: number; height: number };
  /** "remove" = one-eyed Jack (red glow); "place" = two-eyed Jack (indigo glow). */
  variant: "remove" | "place";
}

/**
 * One-shot transient overlay that draws an expanding ring + a glowing "J"
 * over a specific board cell when a Jack is played. The parent (GameScreen)
 * is responsible for removing the element after the keyframe duration.
 */
export function JackEffect({ rect, variant }: Props) {
  const color = variant === "remove" ? "#fb7185" : "#a5b4fc"; // rose-400 vs indigo-300
  return (
    <div
      className="fixed jack-effect z-30"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        color,
      }}
    >
      <div className="jack-effect-ring" />
      <div className="jack-effect-glyph">J</div>
    </div>
  );
}
