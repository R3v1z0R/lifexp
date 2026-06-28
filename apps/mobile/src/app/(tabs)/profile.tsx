// Placeholder — Task 10 replaces this
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../../theme";

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  text: { fontFamily: fonts.display, fontSize: 24, color: colors.muted },
});
