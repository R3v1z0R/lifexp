import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let lastToken: string | null = null;
export function getStoredPushToken() {
  return lastToken;
}

// Returns the Expo push token if permission is granted and registration succeeds, else null.
export async function registerForPush(): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return null;

  const projectId =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  if (!projectId) return null; // dev build with EAS projectId required

  const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResp.data;
  lastToken = token;
  await api.registerDevice({
    expoPushToken: token,
    platform: Platform.OS === "ios" ? "ios" : "android",
  });
  return token;
}
