import { View, StyleSheet } from "react-native";
import { colors, radii } from "../theme";

export function XpBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, backgroundColor: colors.bg, borderRadius: radii.pill, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  fill: { height: "100%", backgroundColor: colors.xp, borderRadius: radii.pill },
});
