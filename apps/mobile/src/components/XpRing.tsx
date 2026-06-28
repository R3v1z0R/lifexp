import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts } from "../theme";

export function XpRing({ level, pct }: { level: number; pct: number }) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.xp}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.level}>{level}</Text>
        <Text style={styles.caption}>LEVEL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", alignItems: "center" },
  level: { fontFamily: fonts.hud, fontSize: 32, color: colors.xp },
  caption: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, letterSpacing: 2 },
});
