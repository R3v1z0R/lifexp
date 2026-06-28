import * as Location from "expo-location";
import { LIFEXP_TRACK_TASK } from "./locationTask";
import { createSession, setPausedMs, getSession, endSession } from "./db";

export type StartResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "foreground-denied" | "background-denied" };

// In-memory pause bookkeeping (valid while the live screen is mounted).
let pauseStartedAt: number | null = null;

async function startUpdates(): Promise<void> {
  await Location.startLocationUpdatesAsync(LIFEXP_TRACK_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 5,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "LifeXP is tracking your activity",
      notificationBody: "Recording your route in the background.",
      notificationColor: "#6C5CE7",
    },
  });
}

export async function startTracking(activitySlug: string): Promise<StartResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return { ok: false, reason: "foreground-denied" };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return { ok: false, reason: "background-denied" };

  const sessionId = await createSession(activitySlug);
  pauseStartedAt = null;
  await startUpdates();
  return { ok: true, sessionId };
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LIFEXP_TRACK_TASK);
}

export async function pauseTracking(sessionId: string): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIFEXP_TRACK_TASK);
  pauseStartedAt = Date.now();
}

export async function resumeTracking(sessionId: string): Promise<void> {
  if (pauseStartedAt != null) {
    const session = await getSession(sessionId);
    const added = Date.now() - pauseStartedAt;
    await setPausedMs(sessionId, (session?.paused_ms ?? 0) + added);
    pauseStartedAt = null;
  }
  await startUpdates();
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIFEXP_TRACK_TASK);
  pauseStartedAt = null;
}

// Finalize a session's ended_at after stopping updates.
export async function finalizeSession(sessionId: string): Promise<void> {
  await endSession(sessionId);
}
