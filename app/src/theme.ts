/**
 * Fivefive brand tokens for the native app. Mirrors the Royal Navy
 * cartoon palette from the web client's index.css (--ff-* CSS vars).
 *
 * On native we don't have CSS variables, so values are exported as
 * plain constants and imported per-component. Add a token here once
 * and reference it everywhere.
 */
export const colors = {
  // Navy field
  navy:      "#0a1840",
  navySoft:  "#122560",
  navyCard:  "#1a2f78",
  navyInk:   "#060d2a",
  // Gold (primary accent)
  gold:      "#e4c373",
  goldDeep:  "#c9a35b",
  // Cream (on-navy text)
  cream:     "#fef3c7",
  creamSoft: "#fde68a",
  // Team chips + accents
  coral:     "#fb7185",
  coralDeep: "#e11d48",
  mint:      "#86efac",
  sky:       "#38bdf8",
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Standard cartoon outline shadow used on pills + stickers. On native
 * we approximate with shadowOffset + black-ish shadowColor. Hard 0px
 * blur replicates the flat "stamp" look of the web's `box-shadow: Xpx
 * Ypx 0 var(--ff-navy-ink)`.
 */
export const cartoonShadow = {
  shadowColor: colors.navyInk,
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 0,
  // Android needs elevation but the visual will differ slightly — RN
  // doesn't support 0-blur drop-shadows on Android without effort.
  elevation: 4,
} as const;
