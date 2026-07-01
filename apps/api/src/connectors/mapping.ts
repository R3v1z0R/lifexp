import type { NormalizedActivity } from "./types";

export interface MappedActivity {
  activitySlug: string | null;
  value: number | null;
  intensityInputs: Record<string, number>;
}

type Measure = "distance_km" | "duration_min";

interface Rule {
  slug: string;
  measure: Measure;
}

/** provider type (lowercased) → LifeXP activity. Extend per provider/activity. */
const RULES: Record<string, Rule> = {
  run: { slug: "running", measure: "distance_km" },
  ride: { slug: "cycling", measure: "distance_km" },
  swim: { slug: "swimming", measure: "distance_km" },
  walk: { slug: "walking", measure: "duration_min" },
  workout: { slug: "workout", measure: "duration_min" },
  yoga: { slug: "meditation", measure: "duration_min" },
  meditation: { slug: "meditation", measure: "duration_min" },
};

/** Round to 2 decimals to keep fractional precision without float noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mapNormalized(n: NormalizedActivity): MappedActivity {
  const rule = RULES[n.providerType.toLowerCase()];
  if (!rule) {
    return { activitySlug: null, value: null, intensityInputs: {} };
  }

  let value: number | null = null;
  if (rule.measure === "distance_km" && n.distanceM != null) {
    value = round2(n.distanceM / 1000);
  } else if (rule.measure === "duration_min" && n.durationS != null) {
    value = round2(n.durationS / 60);
  }

  const intensityInputs: Record<string, number> = {};
  if (n.avgHr != null) intensityInputs.avg_hr = n.avgHr;
  if (n.avgSpeedMps != null) intensityInputs.avg_speed = n.avgSpeedMps;

  return { activitySlug: rule.slug, value, intensityInputs };
}
