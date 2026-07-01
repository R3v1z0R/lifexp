import { Pressable, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTimer } from "../lib/useTimer";
import { formatElapsed } from "../lib/timer";
import { colors, fonts, spacing } from "../theme";

// Global "timer running" banner shown across the tab screens. Tapping it jumps to
// the Log tab where the timer can be stopped and filed into a log.
export function TimerBanner() {
  const { running, elapsedMs, label } = useTimer();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  if (!running) return null;
  return (
    <Pressable
      onPress={() => router.push("/(tabs)/log")}
      style={[styles.banner, { paddingTop: insets.top + spacing.sm }]}
    >
      <Text style={styles.time}>● {formatElapsed(elapsedMs)}</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label ?? "timer running"}
      </Text>
      <Text style={styles.cta}>Go to log →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.xp,
  },
  time: { fontFamily: fonts.hud, color: colors.xp, fontSize: 14 },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, flex: 1 },
  cta: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 13 },
});
