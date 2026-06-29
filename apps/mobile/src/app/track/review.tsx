import { useEffect, useState } from "react";
import { Text, TextInput, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type LogResponse } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getEndedSession, getPoints, saveSession, deleteSession } from "../../lib/track/db";
import { summarize, type GeoPoint } from "../../lib/track/geo";
import { buildLogBody, clampValue } from "../../lib/track/submit";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { XpResultCard } from "../../components/XpResultCard";
import { ActivityIndicator } from "react-native";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Review() {
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activitySlug, setActivitySlug] = useState("");
  const [value, setValue] = useState("");
  const [bounds, setBounds] = useState<{ min: number; max: number } | null>(null);
  // Intensity inputs are held as raw text so a cleared field stays empty rather than
  // collapsing to 0; they are parsed (and empties dropped) at submit time.
  const [intensity, setIntensity] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getEndedSession();
        if (cancelled) return;
        if (!session) {
          router.replace("/(tabs)/track");
          return;
        }
        setSessionId(session.id);
        setActivitySlug(session.activity_slug);
        const pts = await getPoints(session.id);
        if (cancelled) return;
        const geo: GeoPoint[] = pts.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
        const summary = summarize(geo, session.paused_ms);
        const activities = await api.activities();
        if (cancelled) return;
        const def = activities.activities.find((a) => a.slug === session.activity_slug);
        if (!def) {
          setError("Activity definition unavailable.");
          return;
        }
        setBounds({ min: def.min_value, max: def.max_value });
        const body = buildLogBody(def, summary);
        setValue(String(body.value));
        setIntensity(
          Object.fromEntries(Object.entries(body.intensityInputs ?? {}).map(([k, v]) => [k, String(v)])),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load session data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onSave = async () => {
    if (!sessionId || pending) return; // re-entry guard against double submit
    const parsed = Number(value);
    if (!parsed || parsed <= 0) {
      setError("Distance is zero — nothing to log. Discard instead.");
      return;
    }
    // Re-clamp the user-edited value to the activity's range so an out-of-range edit
    // can't be rejected by the server after the fact.
    const numericValue = bounds ? clampValue(parsed, bounds.min, bounds.max) : parsed;
    // Parse intensity text back to numbers, dropping any field the user cleared.
    const intensityInputs: Record<string, number> = {};
    for (const [k, t] of Object.entries(intensity)) {
      const n = Number(t);
      if (t.trim() !== "" && Number.isFinite(n)) intensityInputs[k] = n;
    }
    const hasIntensity = Object.keys(intensityInputs).length > 0;
    setPending(true);
    setError(null);
    let res: LogResponse;
    try {
      res = await api.createLog({
        activitySlug,
        value: numericValue,
        intensityInputs: hasIntensity ? intensityInputs : undefined,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save activity.");
      setPending(false);
      return;
    }
    // The server has committed the log and awarded XP — point of no return. Show the
    // result now so the form (and its Save button) is replaced; the local bookkeeping
    // below is best-effort and must never let the user re-submit and double-award XP.
    setResult(res);
    try {
      await saveSession(sessionId, numericValue, JSON.stringify(intensityInputs), res.xpBreakdown.final_xp);
      await refreshMe();
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch {
      // Log is already persisted server-side; a local mirror/refresh failure is non-fatal.
    } finally {
      setPending(false);
    }
  };

  const onDiscard = async () => {
    if (sessionId) await deleteSession(sessionId);
    router.replace("/(tabs)/track");
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.xp} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <Text style={styles.h1}>Saved</Text>
        <XpResultCard result={result} />
        <Pressable style={styles.button} onPress={() => router.replace("/(tabs)/track")}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.h1}>Review</Text>
      <Card>
        <Text style={styles.label}>Activity</Text>
        <Text style={styles.activity}>{activitySlug}</Text>
        <Text style={styles.label}>Distance / amount</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={value}
          onChangeText={setValue}
        />
        {Object.entries(intensity).map(([k, v]) => (
          <View key={k} style={styles.intensityRow}>
            <Text style={styles.label}>{k}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={v}
              onChangeText={(t) => setIntensity((p) => ({ ...p, [k]: t }))}
            />
          </View>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.secondary]} onPress={onDiscard}>
          <Text style={styles.secondaryText}>Discard</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.save, pending && styles.disabled]}
          disabled={pending}
          onPress={onSave}
        >
          <Text style={styles.buttonText}>{pending ? "Saving…" : "Save & earn XP"}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  activity: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 18, textTransform: "capitalize" },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  intensityRow: { gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.md },
  button: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  secondary: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  save: { backgroundColor: colors.xp },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
});
