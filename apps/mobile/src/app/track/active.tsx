import { useEffect, useRef, useState } from "react";
import { Text, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { getActiveSession, getPoints, type StoredPoint } from "../../lib/track/db";
import { stopTracking, pauseTracking, resumeTracking, finalizeSession, reconcileTracking } from "../../lib/track/tracker";
import { summarize, accuratePoints, type GeoPoint } from "../../lib/track/geo";
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
  const [activitySlug, setActivitySlug] = useState("");
  const [points, setPoints] = useState<StoredPoint[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [pausedMs, setPausedMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconciled = false;
    const poll = async () => {
      const session = await getActiveSession();
      if (!session || cancelled) return;
      // On the first poll, restart GPS if the OS updates task isn't running (e.g.
      // resuming after an app kill); a paused session is left stopped.
      if (!reconciled) {
        reconciled = true;
        await reconcileTracking(session.id);
        if (cancelled) return;
      }
      setSessionId(session.id);
      setActivitySlug(session.activity_slug);
      setStartedAt(session.started_at);
      setPausedMs(session.paused_ms);
      setPausedAt(session.paused_at);
      setPaused(session.paused_at != null); // reflect the persisted pause state, not a stale local flag
      setPoints(await getPoints(session.id));
    };
    poll();
    tick.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (tick.current) clearInterval(tick.current);
    };
  }, []);

  // Drive a smooth 1-second clock for the elapsed/moving readout. GPS fixes only
  // land every few seconds, so deriving the time from point timestamps makes it
  // jump in chunks; a wall-clock tick keeps it ticking each second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const geoPoints: GeoPoint[] = points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
  const summary = summarize(geoPoints, pausedMs);
  // Moving time as wall-clock: counts up while running, freezes at the pause start.
  // (summary.movingMs only advances when a new GPS point lands; this ticks each second.)
  const liveMovingMs = startedAt > 0 ? Math.max(0, (pausedAt ?? now) - startedAt - pausedMs) : 0;
  const isSwim = activitySlug === "swimming";
  const distValue = isSwim
    ? String(Math.round(summary.distanceM))
    : (summary.distanceM / 1000).toFixed(2);
  const distUnit = isSwim ? "m" : "km";

  const onPauseToggle = async () => {
    if (!sessionId) return;
    if (paused) {
      await resumeTracking(sessionId);
      // Mirror flushPause locally so the clock resumes instantly instead of waiting
      // for the next poll (the poll then reconciles with the same DB values).
      if (pausedAt != null) setPausedMs((m) => m + Math.max(0, Date.now() - pausedAt));
      setPausedAt(null);
      setPaused(false);
    } else {
      await pauseTracking(sessionId);
      setPausedAt(Date.now()); // freeze the clock immediately on pause
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
      <TrackMap points={accuratePoints(points).map((p) => ({ lat: p.lat, lng: p.lng }))} />
      <Card>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{distValue}</Text>
            <Text style={styles.statLabel}>{distUnit}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmtDuration(liveMovingMs)}</Text>
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
