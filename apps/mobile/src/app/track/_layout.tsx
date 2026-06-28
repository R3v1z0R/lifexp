import { Stack } from "expo-router";
import { colors } from "../../theme";

export default function TrackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="active" options={{ title: "Tracking", headerBackVisible: false }} />
      <Stack.Screen name="review" options={{ title: "Review" }} />
      <Stack.Screen name="[id]" options={{ title: "Activity" }} />
    </Stack>
  );
}
