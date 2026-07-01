import { Text, StyleSheet, Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

export default function ImportReview() {
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  const q = useQuery({ queryKey: ["imports", "pending"], queryFn: () => api.imports("pending") });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = activitiesQuery.data?.activities ?? [];
  const items = q.data?.imports ?? [];

  const invalidate = async () => {
    await refreshMe();
    qc.invalidateQueries({ queryKey: ["imports"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["logs"] });
  };

  const accept = useMutation({
    mutationFn: ({ id, slug }: { id: string; slug?: string }) => api.acceptImport(id, slug),
    onSuccess: invalidate,
  });
  const acceptAll = useMutation({ mutationFn: () => api.acceptAllImports(), onSuccess: invalidate });
  const dismiss = useMutation({ mutationFn: (id: string) => api.dismissImport(id), onSuccess: invalidate });

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Import review</Text>
        {items.some((i) => i.mapped_activity_slug) && (
          <Pressable
            style={[styles.primary, acceptAll.isPending && styles.disabled]}
            disabled={acceptAll.isPending}
            onPress={() => acceptAll.mutate()}
          >
            <Text style={styles.primaryText}>Accept all mapped</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 && (
        <Text style={styles.muted}>No pending imports. Sync a provider on Integrations.</Text>
      )}

      {items.map((i) => (
        <Card key={i.id}>
          <Text style={styles.title}>
            <Text style={styles.type}>{i.provider_type}</Text> ·{" "}
            {new Date(i.occurred_at).toLocaleDateString()}
          </Text>

          {i.mapped_activity_slug ? (
            <Text style={styles.muted}>
              → {i.mapped_activity_slug} ({i.value})
            </Text>
          ) : (
            <>
              <Text style={styles.muted}>Pick an activity:</Text>
              <View style={styles.chips}>
                {activities.map((a) => (
                  <Pressable
                    key={a.slug}
                    style={styles.chip}
                    onPress={() => accept.mutate({ id: i.id, slug: a.slug })}
                  >
                    <Text style={styles.chipText}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.actions}>
            {i.mapped_activity_slug && (
              <Pressable
                style={styles.primary}
                onPress={() => accept.mutate({ id: i.id })}
              >
                <Text style={styles.primaryText}>Accept</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondary} onPress={() => dismiss.mutate(i.id)}>
              <Text style={styles.secondaryText}>Dismiss</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  title: { fontFamily: fonts.body, color: colors.ink },
  type: { fontFamily: fonts.hud, color: colors.xp },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { fontFamily: fonts.body, color: colors.ink },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  primary: {
    backgroundColor: colors.xp,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryText: { fontFamily: fonts.bodyBold, color: colors.bg },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryText: { fontFamily: fonts.bodyBold, color: colors.muted },
  disabled: { opacity: 0.6 },
});
