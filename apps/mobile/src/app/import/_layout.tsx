import { Stack } from "expo-router";
import { colors } from "../../theme";

export default function ImportLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Integrations" }} />
      <Stack.Screen name="review" options={{ title: "Import review" }} />
    </Stack>
  );
}
