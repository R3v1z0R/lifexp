import { useState } from "react";
import { Text, StyleSheet, Pressable, View, TextInput } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api, ApiError, type Visibility } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const VISIBILITIES: Visibility[] = ["friends", "public", "private"];

export default function Goals() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const goalsQuery = useQuery({ queryKey: ["goals"], queryFn: api.goals });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });

  const [activitySlug, setActivitySlug] = useState("");
  const [target, setTarget] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  const activities = activitiesQuery.data?.activities ?? [];
  const goals = goalsQuery.data?.goals ?? [];

  const create = useMutation({
    mutationFn: () => api.createGoal({ activitySlug, targetValue: Number(target), visibility }),
    onSuccess: () => {
      setActivitySlug("");
      setTarget("");
      setError(null);
      setUpgrade(false);
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403) {
        setUpgrade(true);
        setError(e.message);
      } else {
        setUpgrade(false);
        setError(e instanceof ApiError ? e.message : "Could not create goal");
      }
    },
  });
  const join = useMutation({
    mutationFn: (id: string) => api.joinGoal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  return (
    <Screen>
      <Text style={styles.h2}>New shared goal</Text>
      <Card>
        <Text style={styles.label}>Activity</Text>
        <View style={styles.chips}>
          {activities.map((a) => (
            <Pressable
              key={a.slug}
              style={[styles.chip, activitySlug === a.slug && styles.chipActive]}
              onPress={() => setActivitySlug(a.slug)}
            >
              <Text style={[styles.chipText, activitySlug === a.slug && styles.chipTextActive]}>
                {a.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Target</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={target}
          onChangeText={setTarget}
          placeholder="100"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Visibility</Text>
        <View style={styles.chips}>
          {VISIBILITIES.map((v) => (
            <Pressable
              key={v}
              style={[styles.chip, visibility === v && styles.chipActive]}
              onPress={() => setVisibility(v)}
            >
              <Text style={[styles.chipText, visibility === v && styles.chipTextActive]}>{v}</Text>
            </Pressable>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {upgrade && (
          <Pressable onPress={() => router.push("/more/upgrade")}>
            <Text style={styles.upgradeLink}>Free heroes get one active goal — Upgrade to Pro.</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.primary, (!activitySlug || target === "" || create.isPending) && styles.disabled]}
          disabled={!activitySlug || target === "" || create.isPending}
          onPress={() => create.mutate()}
        >
          <Text style={styles.primaryText}>{create.isPending ? "…" : "Create"}</Text>
        </Pressable>
      </Card>

      <Text style={styles.h2}>Active goals</Text>
      {goals.length === 0 ? (
        <Text style={styles.muted}>No shared goals yet. Create one above.</Text>
      ) : (
        goals.map((g) => {
          const mine = g.creator_id === user?.id;
          return (
            <Card key={g.id}>
              <View style={styles.cardHead}>
                <Text style={styles.cap}>{g.activity_slug.replace(/_/g, " ")}</Text>
                <Text style={styles.badge}>{g.status}</Text>
              </View>
              <Text style={styles.target}>Target {g.target_value}</Text>
              <View style={styles.cardFoot}>
                <Text style={styles.muted}>{g.visibility}{mine ? " · Creator" : ""}</Text>
                {!mine && (
                  <Pressable style={styles.ghost} disabled={join.isPending} onPress={() => join.mutate(g.id)}>
                    <Text style={styles.ghostText}>Join</Text>
                  </Pressable>
                )}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.sm },
  label: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.md,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
  chipText: { color: colors.muted, fontFamily: fonts.body, textTransform: "capitalize" },
  chipTextActive: { color: colors.ink, fontFamily: fonts.bodyBold },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    color: colors.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    marginTop: spacing.sm,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  cap: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, textTransform: "capitalize" },
  target: { fontFamily: fonts.hud, color: colors.xp, marginTop: spacing.xs },
  badge: { fontFamily: fonts.hud, color: colors.arcane2, fontSize: 12 },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  error: { fontFamily: fonts.body, color: colors.danger, marginTop: spacing.sm },
  upgradeLink: { fontFamily: fonts.bodyBold, color: colors.xp, marginTop: spacing.sm },
  primary: {
    backgroundColor: colors.xp,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryText: { fontFamily: fonts.bodyBold, color: colors.bg },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ghostText: { fontFamily: fonts.bodyBold, color: colors.muted },
  disabled: { opacity: 0.5 },
});
