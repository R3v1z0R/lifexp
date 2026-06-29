import { useCallback, useState } from "react";
import { Text, Pressable, StyleSheet, View, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { startTracking } from "../../lib/track/tracker";
import { getActiveSession, listSavedSessions, deleteSession, type TrackSession } from "../../lib/track/db";
import { formatValueWithUnit } from "../../lib/track/geo";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const TRACKABLE = new Set(["running", "cycling", "walking", "swimming"]);

export default function Track() {
  const router = useRouter();
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = (activitiesQuery.data?.activities ?? []).filter((a) => TRACKABLE.has(a.slug));

  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState<TrackSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reload the saved-history list. Kept prompt-free so it is safe to call from an
  // Alert callback; the resume prompt lives only in the focus effect below.
  const refreshHistory = useCallback(() => {
    listSavedSessions().then(setSaved).catch(() => setSaved([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listSavedSessions().then((s) => { if (!cancelled) setSaved(s); }).catch(() => { if (!cancelled) setSaved([]); });
      getActiveSession().then((active) => {
        if (!cancelled && active) {
          Alert.alert("Resume tracking?", "You have an unfinished activity.", [
            { text: "Discard", style: "destructive", onPress: () => deleteSession(active.id).then(refreshHistory) },
            { text: "Resume", onPress: () => router.push("/track/active") },
          ]);
        }
      });
      return () => { cancelled = true; };
    }, [refreshHistory, router]),
  );

  const onStart = async () => {
    setError(null);
    const res = await startTracking(slug);
    if (!res.ok) {
      setError(
        res.reason === "foreground-denied"
          ? "Location permission is required to track. Enable it in Settings."
          : "Background location is required so tracking continues with the screen off. Enable \"Always\" in Settings.",
      );
      return;
    }
    router.push("/track/active");
  };

  return (
    <Screen>
      <Text style={styles.h1}>Track activity</Text>
      <Card>
        <Text style={styles.label}>Activity</Text>
        <View style={styles.chips}>
          {activities.map((a) => (
            <Pressable
              key={a.slug}
              onPress={() => { setSlug(a.slug); setError(null); }}
              style={[styles.chip, slug === a.slug && styles.chipActive]}
            >
              <Text style={[styles.chipText, slug === a.slug && styles.chipTextActive]}>{a.name}</Text>
            </Pressable>
          ))}
        </View>
        {slug === "swimming" && (
          <Text style={styles.muted}>Note: GPS is unreliable in water — open-water only.</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, !slug && styles.buttonDisabled]}
          disabled={!slug}
          onPress={onStart}
        >
          <Text style={styles.buttonText}>Start tracking</Text>
        </Pressable>
      </Card>

      <Text style={styles.h2}>History</Text>
      {saved.length === 0 && <Text style={styles.muted}>No tracked activities yet.</Text>}
      {saved.map((s) => (
        <Pressable key={s.id} onPress={() => router.push(`/track/${s.id}`)}>
          <Card>
            <Text style={styles.rowTitle}>{s.activity_slug}</Text>
            <Text style={styles.muted}>
              {formatValueWithUnit(s.activity_slug, s.value ?? 0)} · +{s.final_xp ?? 0} XP · {new Date(s.started_at).toLocaleDateString()}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.md },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
  chipText: { color: colors.muted, fontFamily: fonts.body },
  chipTextActive: { color: colors.ink, fontFamily: fonts.bodyBold },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  rowTitle: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 16, textTransform: "capitalize" },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
});
