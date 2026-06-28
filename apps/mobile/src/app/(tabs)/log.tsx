import { useMemo, useState } from "react";
import { Text, TextInput, Pressable, StyleSheet, View } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type LogResponse } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Log() {
  const { refreshMe } = useAuth();
  const qc = useQueryClient();
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = activitiesQuery.data?.activities ?? [];

  const [slug, setSlug] = useState("");
  const selected = useMemo(() => activities.find((a) => a.slug === slug), [activities, slug]);
  const [value, setValue] = useState("");
  const [intensity, setIntensity] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intensityQuery = useQuery({
    queryKey: ["intensity", slug],
    queryFn: () => api.intensity(slug),
    enabled: Boolean(slug),
  });
  const configs = intensityQuery.data?.configs ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const inputs: Record<string, number> = {};
      for (const [k, v] of Object.entries(intensity)) if (v !== "") inputs[k] = Number(v);
      return api.createLog({
        activitySlug: slug,
        value: Number(value),
        intensityInputs: Object.keys(inputs).length ? inputs : undefined,
      });
    },
    onSuccess: async (res) => {
      setResult(res);
      setError(null);
      await refreshMe();
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not log activity."),
  });

  return (
    <Screen>
      <Text style={styles.h1}>Log activity</Text>

      <Card>
        <Text style={styles.label}>Activity</Text>
        <View style={styles.chips}>
          {activities.map((a) => (
            <Pressable
              key={a.slug}
              onPress={() => {
                setSlug(a.slug);
                setIntensity({});
                setResult(null);
              }}
              style={[styles.chip, slug === a.slug && styles.chipActive]}
            >
              <Text style={[styles.chipText, slug === a.slug && styles.chipTextActive]}>{a.name}</Text>
            </Pressable>
          ))}
        </View>

        {selected && (
          <>
            <Text style={styles.label}>Amount · {selected.unit}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={value}
              onChangeText={setValue}
              placeholder={`${selected.min_value}–${selected.max_value}`}
              placeholderTextColor={colors.muted}
            />
          </>
        )}

        {configs.length > 0 && (
          <>
            <Text style={styles.label}>Intensity (optional)</Text>
            {configs.map((cfg) => (
              <View key={cfg.input_key} style={{ gap: spacing.xs }}>
                <Text style={styles.muted}>{cfg.label}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={intensity[cfg.input_key] ?? ""}
                  onChangeText={(t) => setIntensity((p) => ({ ...p, [cfg.input_key]: t }))}
                />
              </View>
            ))}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (!slug || value === "" || mutation.isPending) && styles.buttonDisabled]}
          disabled={!slug || value === "" || mutation.isPending}
          onPress={() => {
            setResult(null);
            mutation.mutate();
          }}
        >
          <Text style={styles.buttonText}>{mutation.isPending ? "Logging…" : "Log it"}</Text>
        </Pressable>
      </Card>

      {result && (
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
  chipText: { color: colors.muted, fontFamily: fonts.body },
  chipTextActive: { color: colors.ink, fontFamily: fonts.bodyBold },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  muted: { fontFamily: fonts.body, color: colors.muted },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
  xpEarned: { fontFamily: fonts.hud, fontSize: 28, color: colors.xp },
  levelUp: { color: colors.arcane2, fontFamily: fonts.bodyBold, marginTop: spacing.sm },
});
