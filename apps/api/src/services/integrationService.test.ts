import { describe, it, expect } from "vitest";
import { buildImportRow } from "./integrationService";
import type { NormalizedActivity } from "../connectors/types";

const run: NormalizedActivity = {
  externalId: "555",
  occurredAt: new Date("2026-03-10T08:00:00Z"),
  providerType: "Run",
  distanceM: 5200,
  avgHr: 150,
  raw: { id: 555 },
};

describe("buildImportRow", () => {
  it("builds a mapped pending row with fractional value", () => {
    const row = buildImportRow("user-1", "strava", run);
    expect(row.user_id).toBe("user-1");
    expect(row.provider).toBe("strava");
    expect(row.external_id).toBe("555");
    expect(row.mapped_activity_slug).toBe("running");
    expect(row.value).toBe(5.2);
    expect(row.status).toBe("pending");
    expect(row.intensity_inputs).toEqual({ avg_hr: 150 });
  });

  it("builds an unmapped row with null slug", () => {
    const row = buildImportRow("user-1", "strava", { ...run, providerType: "Kayaking" });
    expect(row.mapped_activity_slug).toBeNull();
    expect(row.value).toBeNull();
  });
});
