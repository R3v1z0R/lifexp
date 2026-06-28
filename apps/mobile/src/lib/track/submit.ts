import type { ActivityDefinition } from "@lifexp/types";
import { derivePaceSpeed, type SessionSummary } from "./geo";

export interface CreateLogBody {
  activitySlug: string;
  value: number;
  intensityInputs?: Record<string, number>;
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildLogBody(
  activity: ActivityDefinition,
  summary: SessionSummary,
): CreateLogBody {
  const derived = derivePaceSpeed(activity.slug, summary.distanceM, summary.movingMs);
  const value = round2(clampValue(derived.value, activity.min_value, activity.max_value));
  const body: CreateLogBody = { activitySlug: activity.slug, value };
  if (derived.intensityInputs) {
    const rounded: Record<string, number> = {};
    for (const [k, v] of Object.entries(derived.intensityInputs)) rounded[k] = round2(v);
    body.intensityInputs = rounded;
  }
  return body;
}
