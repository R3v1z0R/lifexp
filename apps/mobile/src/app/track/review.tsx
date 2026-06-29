import { useEffect, useState } from "react";
import { Text, TextInput, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type LogResponse } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getActiveSession, getPoints, saveSession, deleteSession } from "../../lib/track/db";
import { summarize, type GeoPoint } from "../../lib/track/geo";
import { buildLogBody } from "../../lib/track/submit";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { XpResultCard } from "../../components/XpResultCard";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Review() {
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activitySlug, setActivitySlug] = useState("");
  const [value, setValue] = useState("");
  const [intensity, setIntensity] = useState<Record<string, number>>({});
  const [result, setResult] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getActiveSession();
      if (!session) {
        router.replace("/(tabs)/track");
        return;
      }
      setSessionId(session.id);
      setActivitySlug(session.activity_slug);
      const pts = await getPoints(session.id);
      const geo: GeoPoint[] = pts.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
      const summary = summarize(geo, session.paused_ms);
      const activities = await api.activities();
      const def = activities.activities.find((a) => a.slug === session.activity_slug);
      if (!def) {
        setError("Activity definition unavailable.");
        return;
      }
      const body = buildLogBody(def, summary);
      setValue(String(body.value));
      setIntensity(body.intensityInputs ?? {});
    })();
  }, [router]);

  const onSave = async () => {
    if (!sessionId) return;
    const numericValue = Number(value);
    if (!numericValue || numericValue <= 0) {
      setError("Distance is zero — nothing to log. Discard instead.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await api.createLog({
        activitySlug,
        value: numericValue,
        intensityInputs: Object.keys(intensity).length ? intensity : undefined,
      });
      await saveSession(sessionId, numericValue, JSON.stringify(intensity), res.xpBreakdown.final_xp);
      setResult(res);
      await refreshMe();
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save activity.");
    } finally {
      setPending(false);
    }
  };

  const onDiscard = async () => {
    if (sessionId) await deleteSession(sessionId);
    router.replace("/(tabs)/track");
  };

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
          <View key={k} style={{ gap: spacing.xs }}>
            <Text style={styles.label}>{k}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(v)}
              onChangeText={(t) => setIntensity((p) => ({ ...p, [k]: Number(t) }))}
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
  actions: { flexDirection: "row", gap: spacing.md },
  button: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  secondary: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  save: { backgroundColor: colors.xp },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
});
