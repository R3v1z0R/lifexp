import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import { getActiveSession, appendPoints, type StoredPoint } from "./db";

export const LIFEXP_TRACK_TASK = "lifexp-track-task";

interface LocationTaskData {
  locations: LocationObject[];
}

// Registered at module load (Expo requires task definitions at the top level).
TaskManager.defineTask(LIFEXP_TRACK_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as LocationTaskData;
  if (!locations?.length) return;
  const session = await getActiveSession();
  if (!session) return; // nothing active -> drop (task may outlive a stop)
  const points: StoredPoint[] = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? 9999,
    t: l.timestamp,
  }));
  await appendPoints(session.id, points);
});
