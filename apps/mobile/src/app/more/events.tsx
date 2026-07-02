import { useState } from "react";
import { Text, StyleSheet, Pressable, View, TextInput, Switch } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api, ApiError, type Visibility } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const VISIBILITIES: Visibility[] = ["friends", "private", "public"];

// Parse a "YYYY-MM-DD HH:MM" (local) string; returns null if unparseable.
function toIso(v: string): string | null {
  const d = new Date(v.trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function Events() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const router = useRouter();
  const qc = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: api.events });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });

  const [title, setTitle] = useState("");
  const [activitySlug, setActivitySlug] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [entryCredits, setEntryCredits] = useState("0");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activities = activitiesQuery.data?.activities ?? [];
  const events = eventsQuery.data?.events ?? [];

  const create = useMutation({
    mutationFn: () => {
      const start = toIso(startAt);
      const end = toIso(endAt);
      if (!start || !end) throw new ApiError(400, "Use dates like 2026-07-05 18:00");
      return api.createEvent({
        title,
        activitySlug,
        startAt: start,
        endAt: end,
        entryCredits: Number(entryCredits) || 0,
        visibility,
        isPublic,
      });
    },
    onSuccess: () => {
      setTitle("");
      setActivitySlug("");
      setStartAt("");
      setEndAt("");
      setEntryCredits("0");
      setError(null);
      setUpgrade(false);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => {
      const is403 = e instanceof ApiError && e.status === 403;
      setUpgrade(is403 && !isPublic);
      setError(e instanceof ApiError ? e.message : "Could not create event");
    },
  });
  const join = useMutation({
    mutationFn: (id: string) => api.joinEvent(id),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : "Could not join"),
  });
  const finish = useMutation({
    mutationFn: (id: string) => api.finishEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
    onError: (e) => setActionError(e instanceof ApiError ? e.message : "Could not finish"),
  });

  const canSubmit = Boolean(title && activitySlug && startAt && endAt) && !create.isPending;

  return (
    <Screen>
      <Text style={styles.h2}>Host an event</Text>
      <Card>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Weekend Sprint"
          placeholderTextColor={colors.muted}
        />

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

        <Text style={styles.label}>Starts (YYYY-MM-DD HH:MM)</Text>
        <TextInput
          style={styles.input}
          value={startAt}
          onChangeText={setStartAt}
          placeholder="2026-07-05 18:00"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Ends (YYYY-MM-DD HH:MM)</Text>
        <TextInput
          style={styles.input}
          value={endAt}
          onChangeText={setEndAt}
          placeholder="2026-07-05 20:00"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Entry credits</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={entryCredits}
          onChangeText={setEntryCredits}
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

        {isAdmin ? (
          <View style={styles.switchRow}>
            <Text style={styles.muted}>Public event (admin)</Text>
            <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: colors.arcane }} />
          </View>
        ) : (
          <Text style={styles.muted}>Private/group events require Pro.</Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {upgrade && (
          <Pressable onPress={() => router.push("/more/upgrade")}>
            <Text style={styles.upgradeLink}>Upgrade to Pro to host private events.</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.primary, !canSubmit && styles.disabled]}
          disabled={!canSubmit}
          onPress={() => create.mutate()}
        >
          <Text style={styles.primaryText}>{create.isPending ? "…" : "Create event"}</Text>
        </Pressable>
      </Card>

      <Text style={styles.h2}>Events</Text>
      {actionError && <Text style={styles.error}>{actionError}</Text>}
      {events.length === 0 ? (
        <Text style={styles.muted}>No events yet. Host one above.</Text>
      ) : (
        events.map((ev) => {
          const mine = ev.creator_id === user?.id;
          const finished = ev.status === "completed";
          return (
            <Card key={ev.id}>
              <View style={styles.cardHead}>
                <Text style={styles.title}>{ev.title}</Text>
                <Text style={styles.badge}>{ev.status}</Text>
              </View>
              <Text style={styles.cap}>{ev.activity_slug.replace(/_/g, " ")}</Text>
              <Text style={styles.muted}>
                {new Date(ev.start_at).toLocaleDateString()} → {new Date(ev.end_at).toLocaleDateString()}
              </Text>
              <Text style={styles.muted}>
                {ev.is_public ? "Public · " : ""}
                {ev.entry_credits > 0 ? `${ev.entry_credits} credits` : "Free entry"}
              </Text>
              <View style={styles.actions}>
                {!finished && (
                  <Pressable style={styles.ghost} disabled={join.isPending} onPress={() => join.mutate(ev.id)}>
                    <Text style={styles.ghostText}>Join</Text>
                  </Pressable>
                )}
                {mine && !finished && (
                  <Pressable style={styles.primarySm} disabled={finish.isPending} onPress={() => finish.mutate(ev.id)}>
                    <Text style={styles.primaryText}>Finish</Text>
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, flex: 1 },
  cap: { fontFamily: fonts.body, color: colors.muted, textTransform: "capitalize", marginTop: spacing.xs },
  badge: { fontFamily: fonts.hud, color: colors.arcane2, fontSize: 12 },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  error: { fontFamily: fonts.body, color: colors.danger, marginTop: spacing.sm },
  upgradeLink: { fontFamily: fonts.bodyBold, color: colors.xp, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  primary: {
    backgroundColor: colors.xp,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primarySm: {
    backgroundColor: colors.xp,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
