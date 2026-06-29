import { useEffect, useRef, useState } from "react";
import { Text, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { getActiveSession, getPoints, type StoredPoint } from "../../lib/track/db";
import { stopTracking, pauseTracking, resumeTracking, finalizeSession } from "../../lib/track/tracker";
import { summarize, type GeoPoint } from "../../lib/track/geo";
import { TrackMap } from "../../components/TrackMap";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const fmtDuration = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export default function ActiveSession() {
  useKeepAwake();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [points, setPoints] = useState<StoredPoint[]>([]);
  const [pausedMs, setPausedMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const session = await getActiveSession();
      if (!session || cancelled) return;
      setSessionId(session.id);
      setPausedMs(session.paused_ms);
      setPoints(await getPoints(session.id));
    };
    poll();
    tick.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (tick.current) clearInterval(tick.current);
    };
  }, []);

  const geoPoints: GeoPoint[] = points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
  const summary = summarize(geoPoints, pausedMs);

  const onPauseToggle = async () => {
    if (!sessionId) return;
    if (paused) {
      await resumeTracking(sessionId);
      setPaused(false);
    } else {
      await pauseTracking(sessionId);
      setPaused(true);
    }
  };

  const onStop = async () => {
    if (!sessionId) return;
    await stopTracking();
    await finalizeSession(sessionId);
    if (tick.current) clearInterval(tick.current);
    router.replace("/track/review");
  };

  return (
    <Screen>
      <TrackMap points={points.map((p) => ({ lat: p.lat, lng: p.lng }))} />
      <Card>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{(summary.distanceM / 1000).toFixed(2)}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmtDuration(summary.movingMs)}</Text>
            <Text style={styles.statLabel}>moving</Text>
          </View>
        </View>
        {paused && <Text style={styles.paused}>Paused</Text>}
      </Card>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.secondary]} onPress={onPauseToggle}>
          <Text style={styles.secondaryText}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.stop]} onPress={onStop}>
          <Text style={styles.buttonText}>Stop</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statValue: { fontFamily: fonts.hud, fontSize: 36, color: colors.ink },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  paused: { textAlign: "center", color: colors.xp, fontFamily: fonts.bodyBold, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md },
  button: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  secondary: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  stop: { backgroundColor: colors.danger },
  buttonText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
});
