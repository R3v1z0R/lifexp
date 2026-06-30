import { describe, it, expect } from "vitest";
import { mapNormalized } from "./mapping";
import type { NormalizedActivity } from "./types";

function base(overrides: Partial<NormalizedActivity>): NormalizedActivity {
  return {
    externalId: "1",
    occurredAt: new Date("2026-03-10T08:00:00Z"),
    providerType: "Run",
    raw: {},
    ...overrides,
  };
}

describe("mapNormalized", () => {
  it("maps a Run to running with fractional km from metres", () => {
    const m = mapNormalized(base({ providerType: "Run", distanceM: 5200, avgHr: 150 }));
    expect(m.activitySlug).toBe("running");
    expect(m.value).toBe(5.2); // fractional km preserved
    expect(m.intensityInputs.avg_hr).toBe(150);
  });

  it("maps a Ride to cycling", () => {
    const m = mapNormalized(base({ providerType: "Ride", distanceM: 21000 }));
    expect(m.activitySlug).toBe("cycling");
    expect(m.value).toBe(21);
  });

  it("maps a duration-based type to fractional minutes", () => {
    const m = mapNormalized(base({ providerType: "Yoga", durationS: 1650 }));
    expect(m.activitySlug).toBe("meditation");
    expect(m.value).toBe(27.5); // 1650s = 27.5 min
  });

  it("returns null slug for an unmapped provider type", () => {
    const m = mapNormalized(base({ providerType: "Kayaking", distanceM: 3000 }));
    expect(m.activitySlug).toBeNull();
    expect(m.value).toBeNull();
  });
});
