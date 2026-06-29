import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme";

/**
 * First-screen welcome. Just verifies the brand theme renders, the
 * shared package imports, and the asset pipeline works. Replaced by
 * the real auth + room flow in the next session.
 */
export function LandingScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.lockup}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.mark}
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.wordmark}>fivefive</Text>
      </View>

      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Native shell · v0.1</Text>
        </View>
      </View>

      <Text style={styles.tagline}>
        Royal Navy + Cartoon · running on React Native
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mark: {
    width: 96,
    height: 96,
    borderRadius: radii.lg,
  },
  wordmark: {
    color: colors.gold,
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -1.5,
    // Hard navy-ink shadow approximating the web's text-shadow: 3px 3px 0
    textShadowColor: colors.navyInk,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderColor: colors.navyInk,
  },
  pillText: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 14,
  },
  tagline: {
    color: colors.creamSoft,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
    opacity: 0.8,
  },
});
