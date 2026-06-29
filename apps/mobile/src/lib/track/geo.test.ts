import {
  haversineMeters,
  accumulateDistance,
  summarize,
  derivePaceSpeed,
  formatDistance,
  formatValueWithUnit,
  type GeoPoint,
} from "./geo";

const pt = (lat: number, lng: number, t: number, accuracy = 5): GeoPoint => ({ lat, lng, accuracy, t });

describe("haversineMeters", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMeters({ lat: 50, lng: 14 }, { lat: 50, lng: 14 })).toBeCloseTo(0, 5);
  });
  it("matches a known short distance (~111m per 0.001 lat deg)", () => {
    const d = haversineMeters({ lat: 50.0, lng: 14.0 }, { lat: 50.001, lng: 14.0 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe("accumulateDistance", () => {
  it("sums consecutive segments", () => {
    const pts = [pt(50.0, 14.0, 0), pt(50.001, 14.0, 1000), pt(50.002, 14.0, 2000)];
    const total = accumulateDistance(pts);
    expect(total).toBeGreaterThan(210);
    expect(total).toBeLessThan(236);
  });
  it("drops fixes worse than minAccuracyM", () => {
    const pts = [pt(50.0, 14.0, 0, 5), pt(50.5, 14.0, 1000, 200), pt(50.001, 14.0, 2000, 5)];
    const total = accumulateDistance(pts, { minAccuracyM: 30 });
    expect(total).toBeLessThan(120); // the 50.5 jump is excluded
  });
  it("ignores sub-threshold jitter while stationary", () => {
    const pts = [pt(50.0, 14.0, 0), pt(50.000005, 14.0, 1000), pt(50.0, 14.0, 2000)];
    expect(accumulateDistance(pts, { minMoveM: 5 })).toBeCloseTo(0, 1);
  });
  it("returns 0 for fewer than two points", () => {
    expect(accumulateDistance([pt(50, 14, 0)])).toBe(0);
    expect(accumulateDistance([])).toBe(0);
  });
});

describe("summarize", () => {
  it("computes distance and moving time minus paused", () => {
    const pts = [pt(50.0, 14.0, 10_000), pt(50.001, 14.0, 70_000)];
    const s = summarize(pts, 20_000);
    expect(s.movingMs).toBe(40_000); // (70000-10000) - 20000
    expect(s.distanceM).toBeGreaterThan(100);
  });
  it("is zero for empty input", () => {
    expect(summarize([], 0)).toEqual({ distanceM: 0, movingMs: 0 });
  });
});

describe("derivePaceSpeed", () => {
  it("running -> km value + pace_min_per_km", () => {
    const r = derivePaceSpeed("running", 2000, 600_000); // 2km in 10min
    expect(r.value).toBeCloseTo(2, 3);
    expect(r.intensityInputs?.pace_min_per_km).toBeCloseTo(5, 3); // 10min / 2km
  });
  it("cycling -> km value + avg_speed_kmh", () => {
    const r = derivePaceSpeed("cycling", 10_000, 1_800_000); // 10km in 30min
    expect(r.value).toBeCloseTo(10, 3);
    expect(r.intensityInputs?.avg_speed_kmh).toBeCloseTo(20, 3);
  });
  it("walking -> km value, no intensity", () => {
    const r = derivePaceSpeed("walking", 3000, 1_800_000);
    expect(r.value).toBeCloseTo(3, 3);
    expect(r.intensityInputs).toBeUndefined();
  });
  it("swimming -> meters value + pace_per_100m_sec", () => {
    const r = derivePaceSpeed("swimming", 400, 480_000); // 400m in 8min
    expect(r.value).toBeCloseTo(400, 3);
    expect(r.intensityInputs?.pace_per_100m_sec).toBeCloseTo(120, 3); // 480s / 4 * 100m
  });
  it("guards against zero distance / zero time", () => {
    expect(derivePaceSpeed("running", 0, 600_000)).toEqual({ value: 0 });
    expect(derivePaceSpeed("running", 2000, 0)).toEqual({ value: 2 });
  });
});

describe("formatDistance", () => {
  it("renders km to 2dp for running/cycling/walking", () => {
    expect(formatDistance("running", 5230)).toBe("5.23 km");
    expect(formatDistance("walking", 0)).toBe("0.00 km");
  });
  it("renders whole meters for swimming", () => {
    expect(formatDistance("swimming", 412.6)).toBe("413 m");
    expect(formatDistance("swimming", 0)).toBe("0 m");
  });
});

describe("formatValueWithUnit", () => {
  it("appends km for non-swimming and m for swimming", () => {
    expect(formatValueWithUnit("cycling", 12.5)).toBe("12.5 km");
    expect(formatValueWithUnit("swimming", 400)).toBe("400 m");
  });
});
