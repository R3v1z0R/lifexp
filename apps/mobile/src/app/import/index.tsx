import { useState } from "react";
import { Text, StyleSheet, Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Link } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const PROVIDERS = [{ id: "strava", name: "Strava" }];

export default function Integrations() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const connQuery = useQuery({ queryKey: ["integrations"], queryFn: api.integrations });
  const connections = connQuery.data?.connections ?? [];

  const connect = useMutation({
    mutationFn: (provider: string) => api.connectUrl(provider),
    onSuccess: async ({ url }) => {
      // Opens the provider's OAuth page in the system browser. The server callback
      // completes the connection; the user returns and taps "Sync now".
      await WebBrowser.openBrowserAsync(url);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) =>
      setMsg(
        e instanceof ApiError && e.status === 403
          ? "Cloud import is a Pro feature."
          : "Could not start connect.",
      ),
  });

  const sync = useMutation({
    mutationFn: (provider: string) => api.syncProvider(provider),
    onSuccess: (r) => {
      setMsg(`Synced — ${r.imported} fetched, ${r.pending} pending review.`);
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) =>
      setMsg(
        e instanceof ApiError && e.status === 409
          ? "Please reconnect — authorization expired."
          : "Sync failed.",
      ),
  });

  const disconnect = useMutation({
    mutationFn: (provider: string) => api.disconnect(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
  });

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Integrations</Text>
        <Link href="/import/review" style={styles.link}>
          Review imports →
        </Link>
      </View>

      {msg && (
        <Card>
          <Text style={styles.muted}>{msg}</Text>
        </Card>
      )}

      {PROVIDERS.map((p) => {
        const conn = connections.find((c) => c.provider === p.id);
        return (
          <Card key={p.id}>
            <Text style={styles.provider}>{p.name}</Text>
            {conn ? (
              <Text style={styles.muted}>
                {conn.status === "needs_reauth"
                  ? "Reconnect needed"
                  : `Last synced: ${
                      conn.last_synced_at
                        ? new Date(conn.last_synced_at).toLocaleString()
                        : "never"
                    }`}
              </Text>
            ) : (
              <Text style={styles.muted}>Not connected</Text>
            )}

            <View style={styles.actions}>
              {conn ? (
                <>
                  <Pressable
                    style={[styles.primary, sync.isPending && styles.disabled]}
                    disabled={sync.isPending}
                    onPress={() => sync.mutate(p.id)}
                  >
                    <Text style={styles.primaryText}>
                      {sync.isPending ? "Syncing…" : "Sync now"}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.secondary} onPress={() => disconnect.mutate(p.id)}>
                    <Text style={styles.secondaryText}>Disconnect</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[styles.primary, connect.isPending && styles.disabled]}
                  disabled={connect.isPending}
                  onPress={() => connect.mutate(p.id)}
                >
                  <Text style={styles.primaryText}>Connect</Text>
                </Pressable>
              )}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  link: { fontFamily: fonts.body, color: colors.muted },
  provider: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
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
