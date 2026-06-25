/**
 * Fivefive brand primitives. Single React-side render of the wordmark and
 * the five-in-a-row mark; styling lives in index.css under `.ff-wordmark` /
 * `.ff-mark` so non-React surfaces (SVG icons, public HTML samples) can
 * match exactly. Mark geometry mirrors public/icons/mark-only.svg.
 */
interface MarkProps {
  /** Sets the overall mark size in rem (mark stays square). */
  sizeRem?: number;
  className?: string;
}

export function FivefiveMark({ sizeRem = 3.5, className = "" }: MarkProps) {
  return (
    <span
      className={`ff-mark ${className}`}
      style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g stroke="var(--ff-navy-ink)" strokeWidth="2.6">
          <circle cx="18" cy="50" r="5.2" fill="var(--ff-navy)" />
          <circle cx="34" cy="50" r="5.2" fill="var(--ff-navy)" />
          <circle cx="50" cy="50" r="6.8" fill="var(--ff-coral)" />
          <circle cx="66" cy="50" r="5.2" fill="var(--ff-navy)" />
          <circle cx="82" cy="50" r="5.2" fill="var(--ff-navy)" />
        </g>
      </svg>
    </span>
  );
}

interface WordmarkProps {
  sizeRem?: number;
  variant?: "default" | "tight" | "lean";
  className?: string;
}

export function FivefiveWordmark({
  sizeRem = 3,
  variant = "default",
  className = "",
}: WordmarkProps) {
  const variantClass =
    variant === "tight" ? " ff-wordmark--tight"
    : variant === "lean" ? " ff-wordmark--lean"
    : "";
  return (
    <span
      className={`ff-wordmark${variantClass} ${className}`}
      style={{ fontSize: `${sizeRem}rem` }}
    >
      fivefive
    </span>
  );
}

/** Horizontal lockup — mark to the left, wordmark to the right. */
export function FivefiveLockup({
  sizeRem = 3,
  className = "",
}: { sizeRem?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-4 ${className}`}>
      <FivefiveMark sizeRem={sizeRem} />
      <FivefiveWordmark sizeRem={sizeRem * 0.85} />
    </span>
  );
}
