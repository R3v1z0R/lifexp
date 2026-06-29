import { useEffect, useState } from "react";
import { Text, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getSession, getPoints, type TrackSession, type StoredPoint } from "../../lib/track/db";
import { summarize, formatDistance, type GeoPoint } from "../../lib/track/geo";
import { TrackMap } from "../../components/TrackMap";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing } from "../../theme";

export default function TrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<TrackSession | null>(null);
  const [points, setPoints] = useState<StoredPoint[]>([]);

  useEffect(() => {
    if (!id) return;
    getSession(id).then(setSession);
    getPoints(id).then(setPoints);
  }, [id]);

  const geo: GeoPoint[] = points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
  const summary = summarize(geo, session?.paused_ms ?? 0);

  return (
    <Screen>
      <TrackMap points={points.map((p) => ({ lat: p.lat, lng: p.lng }))} />
      <Card>
        <Text style={styles.activity}>{session?.activity_slug ?? "…"}</Text>
        <View style={styles.row}>
          <Text style={styles.stat}>
            {session ? formatDistance(session.activity_slug, summary.distanceM) : "…"}
          </Text>
          <Text style={styles.stat}>+{session?.final_xp ?? 0} XP</Text>
        </View>
        {session && (
          <Text style={styles.muted}>{new Date(session.started_at).toLocaleString()}</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activity: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 20, textTransform: "capitalize" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  stat: { fontFamily: fonts.hud, fontSize: 24, color: colors.xp },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.sm },
});
