import { Tabs } from "expo-router";
import { View } from "react-native";
import { colors } from "../../theme";
import { TimerBanner } from "../../components/TimerBanner";

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line },
          tabBarActiveTintColor: colors.xp,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="log" options={{ title: "Log" }} />
        <Tabs.Screen name="track" options={{ title: "Track" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
      <TimerBanner />
    </View>
  );
}
