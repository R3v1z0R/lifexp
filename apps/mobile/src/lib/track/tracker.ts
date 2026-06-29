import * as Location from "expo-location";
import { LIFEXP_TRACK_TASK } from "./locationTask";
import { createSession, setPausedMs, setPausedAt, getSession, endSession } from "./db";

export type StartResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "foreground-denied" | "background-denied" };

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
  await startUpdates();
  return { ok: true, sessionId };
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LIFEXP_TRACK_TASK);
}

// Fold any pending paused interval into paused_ms and clear paused_at. Reads the
// pause start from the DB, so it stays correct even after a process restart.
async function flushPause(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (session?.paused_at != null) {
    const added = Math.max(0, Date.now() - session.paused_at);
    await setPausedMs(sessionId, (session.paused_ms ?? 0) + added);
    await setPausedAt(sessionId, null);
  }
}

export async function pauseTracking(sessionId: string): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIFEXP_TRACK_TASK);
  await setPausedAt(sessionId, Date.now());
}

export async function resumeTracking(sessionId: string): Promise<void> {
  await flushPause(sessionId);
  if (!(await isTracking())) await startUpdates();
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIFEXP_TRACK_TASK);
}

// Account any pause still open at stop time, then stamp ended_at + status='ended'.
export async function finalizeSession(sessionId: string): Promise<void> {
  await flushPause(sessionId);
  await endSession(sessionId);
}
