import type { JSX } from "react";
import { Text, StyleSheet } from "react-native";
import type { LogResponse } from "../lib/api";
import { Card } from "./Card";
import { colors, fonts, spacing } from "../theme";

export function XpResultCard({ result }: { result: LogResponse }): JSX.Element {
  return (
    <Card>
      <Text style={styles.xpEarned}>+{result.xpBreakdown.final_xp} XP</Text>
      <Text style={styles.muted}>
        base {result.xpBreakdown.raw_xp} · ×{result.xpBreakdown.intensity_multiplier.toFixed(2)} intensity · ×
        {result.xpBreakdown.streak_multiplier.toFixed(2)} streak
      </Text>
      {result.heroLevelUp && (
        <Text style={styles.levelUp}>Hero reached level {result.heroLevelUp.new_level} ✦</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  xpEarned: { fontFamily: fonts.hud, fontSize: 28, color: colors.xp },
  muted: { fontFamily: fonts.body, color: colors.muted },
  levelUp: { color: colors.arcane2, fontFamily: fonts.bodyBold, marginTop: spacing.sm },
});
