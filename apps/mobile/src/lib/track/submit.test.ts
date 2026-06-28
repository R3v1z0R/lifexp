import type { ActivityDefinition } from "@lifexp/types";
import { buildLogBody, clampValue } from "./submit";

const activity = (over: Partial<ActivityDefinition>): ActivityDefinition => ({
  slug: "running",
  section_slug: "body",
  name: "Running",
  unit: "km",
  input_type: "numeric",
  effort_minutes_per_unit: 10,
  min_value: 0,
  max_value: 100,
  daily_xp_cap: 1000,
  required_plan: "free",
  is_active: true,
  display_order: 1,
  ...over,
});

describe("clampValue", () => {
  it("clamps below min and above max", () => {
    expect(clampValue(-1, 0, 100)).toBe(0);
    expect(clampValue(150, 0, 100)).toBe(100);
    expect(clampValue(42, 0, 100)).toBe(42);
  });
});

describe("buildLogBody", () => {
  it("running: rounds value, includes pace, clamps to max", () => {
    const body = buildLogBody(activity({ max_value: 5 }), { distanceM: 8000, movingMs: 2_400_000 });
    expect(body.activitySlug).toBe("running");
    expect(body.value).toBe(5); // 8km clamped to max 5
    expect(body.intensityInputs?.pace_min_per_km).toBeDefined();
  });
  it("walking: no intensity inputs key omitted", () => {
    const body = buildLogBody(activity({ slug: "walking", name: "Walking" }), {
      distanceM: 3000,
      movingMs: 1_800_000,
    });
    expect(body.value).toBeCloseTo(3, 2);
    expect(body.intensityInputs).toBeUndefined();
  });
  it("swimming: meters value + pace_per_100m_sec", () => {
    const body = buildLogBody(
      activity({ slug: "swimming", name: "Swimming", unit: "meters", min_value: 0, max_value: 5000 }),
      { distanceM: 400, movingMs: 480_000 },
    );
    expect(body.value).toBe(400);
    expect(body.intensityInputs?.pace_per_100m_sec).toBeCloseTo(120, 1);
  });
  it("rounds value to 2 decimals", () => {
    const body = buildLogBody(activity({}), { distanceM: 2345, movingMs: 600_000 });
    expect(body.value).toBe(2.35);
  });
});
