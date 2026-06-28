import { Text, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { xpToNextLevel } from "@lifexp/xp-engine";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { XpRing } from "../../components/XpRing";
import { XpBar } from "../../components/XpBar";
import { colors, fonts, spacing } from "../../theme";

export default function Home() {
  const { user } = useAuth();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const logsQuery = useQuery({ queryKey: ["logs"], queryFn: api.logs });

  const hero = meQuery.data?.user ?? user;
  const level = hero?.hero_level ?? 1;
  const xp = hero?.hero_xp ?? 0;
  const next = xpToNextLevel(level);

  return (
    <Screen>
      <Text style={styles.h1}>
        Life<Text style={{ color: colors.xp }}>XP</Text>
      </Text>

      <Card>
        <View style={styles.heroRow}>
          <XpRing level={level} pct={next > 0 ? (xp / next) * 100 : 0} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text style={styles.username}>{hero?.username ?? "Hero"}</Text>
            <Text style={styles.muted}>{xp} / {next} XP</Text>
            <XpBar value={xp} max={next} />
          </View>
        </View>
      </Card>

      <Text style={styles.h2}>Recent quests</Text>
      {(logsQuery.data ?? []).slice(0, 10).map((log) => (
        <Card key={log.id}>
          <Text style={styles.logTitle}>{log.activity_slug}</Text>
          <Text style={styles.muted}>
            {log.value} · +{log.final_xp} XP
          </Text>
        </Card>
      ))}
      {logsQuery.data && logsQuery.data.length === 0 && (
        <Text style={styles.muted}>No quests yet — log your first activity.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.sm },
  heroRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  username: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.body, color: colors.muted },
  logTitle: { fontFamily: fonts.bodyBold, color: colors.ink, textTransform: "capitalize" },
});
