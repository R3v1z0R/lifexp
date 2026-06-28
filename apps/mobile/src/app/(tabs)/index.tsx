// Placeholder — Task 8 replaces this
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../../theme";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LifeXP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
});
