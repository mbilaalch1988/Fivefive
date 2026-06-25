/**
 * Fivefive brand primitives. Single React-side render of the wordmark and
 * the "55" mark; styling lives in index.css under `.ff-wordmark` / `.ff-mark`
 * so non-React surfaces (SVG icons, public HTML samples) can match exactly.
 */
interface MarkProps {
  /** Sets the overall mark size — number and coral dot scale from this. */
  sizeRem?: number;
  className?: string;
}

export function FivefiveMark({ sizeRem = 3.5, className = "" }: MarkProps) {
  return (
    <span
      className={`ff-mark ${className}`}
      style={{ fontSize: `${sizeRem * 0.55}rem`, width: `${sizeRem}rem`, height: `${sizeRem}rem` }}
      aria-hidden="true"
    >
      55
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
