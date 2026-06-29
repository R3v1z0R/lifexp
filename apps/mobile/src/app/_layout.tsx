import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { View, ActivityIndicator } from "react-native";
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { AuthProvider, useAuth } from "../lib/auth";
// Side-effect import: registers the background location TaskManager task in global
// scope on every app start, including headless background relaunches. Without this,
// expo-router would only lazy-load the task when the Track route mounts, so a
// background-relaunched process delivering a location batch would find no task and
// silently drop GPS points.
import "../lib/track/locationTask";
import { initDb } from "../lib/track/db";
import { queryClient } from "../lib/queryClient";
import { colors } from "../theme";

function Gate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "(auth)";
    if (status === "anon" && !inAuth) router.replace("/(auth)/login");
    if (status === "authed" && inAuth) router.replace("/(tabs)");
  }, [status, segments, router]);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={colors.xp} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useSpaceGrotesk({
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    initDb().catch(() => {
      // DB init failure: the Track tab will surface errors on use; app still runs.
    });
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
