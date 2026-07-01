import { useEffect, useState } from "react";
import { Text, StyleSheet, Pressable, Switch, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { registerForPush, getStoredPushToken } from "../../lib/push";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Profile() {
  const { user, logout } = useAuth();
  const billingQuery = useQuery({ queryKey: ["billing"], queryFn: api.billingMe });
  const pendingQuery = useQuery({
    queryKey: ["imports", "pending"],
    queryFn: () => api.imports("pending"),
  });
  const pendingCount = pendingQuery.data?.imports.length ?? 0;
  const [pushOn, setPushOn] = useState(false);

  // Try to register for push on first mount (no-op if already denied or no dev build).
  useEffect(() => {
    (async () => {
      const token = await registerForPush();
      setPushOn(Boolean(token));
    })();
  }, []);

  async function togglePush(next: boolean) {
    if (next) {
      const token = await registerForPush();
      setPushOn(Boolean(token));
    } else {
      const token = getStoredPushToken();
      if (token) {
        try {
          await api.unregisterDevice(token);
        } catch {
          /* best-effort */
        }
      }
      setPushOn(false);
    }
  }

  async function onSignOut() {
    const token = getStoredPushToken();
    if (token) {
      try {
        await api.unregisterDevice(token);
      } catch {
        /* best-effort */
      }
    }
    await logout();
  }

  return (
    <Screen>
      <Text style={styles.h1}>Profile</Text>
      <Card>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.muted}>{user?.email}</Text>
        <Text style={styles.plan}>Plan: {billingQuery.data?.plan ?? "free"}</Text>
      </Card>

      <Card>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Push notifications</Text>
          <Switch value={pushOn} onValueChange={togglePush} trackColor={{ true: colors.arcane }} />
        </View>
        <Text style={styles.muted}>Level-up and perk-choice alerts on this device.</Text>
      </Card>

      <Card>
        <Link href="/import" style={styles.navRow}>
          <Text style={styles.rowLabel}>Integrations</Text>
        </Link>
        <View style={styles.divider} />
        <Link href="/import/review" style={styles.navRow}>
          <Text style={styles.rowLabel}>
            Import review
            {pendingCount > 0 ? <Text style={styles.badge}>  {pendingCount}</Text> : null}
          </Text>
        </Link>
      </Card>

      <Pressable style={styles.signOut} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  username: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.body, color: colors.muted },
  plan: { fontFamily: fonts.body, color: colors.xp, marginTop: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontFamily: fonts.bodyBold, color: colors.ink },
  navRow: { paddingVertical: spacing.sm },
  divider: { height: 1, backgroundColor: colors.line },
  badge: { fontFamily: fonts.hud, color: colors.xp },
  signOut: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  signOutText: { fontFamily: fonts.bodyBold, color: colors.danger },
});
