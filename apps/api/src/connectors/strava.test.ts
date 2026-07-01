import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StravaConnector } from "./strava";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/strava-activities.json"), "utf8")
);

describe("StravaConnector.normalize", () => {
  const c = new StravaConnector();

  it("normalizes a run", () => {
    const n = c.normalize(fixtures[0]);
    expect(n.externalId).toBe("987654321");
    expect(n.providerType).toBe("Run");
    expect(n.distanceM).toBe(5200);
    expect(n.durationS).toBe(1620);
    expect(n.avgHr).toBe(150);
    expect(n.occurredAt.toISOString()).toBe("2026-03-10T08:00:00.000Z");
  });

  it("normalizes a ride with no heartrate", () => {
    const n = c.normalize(fixtures[1]);
    expect(n.externalId).toBe("987654322");
    expect(n.providerType).toBe("Ride");
    expect(n.avgHr).toBeUndefined();
  });

  it("builds an auth URL containing the state", () => {
    process.env.STRAVA_CLIENT_ID = "123";
    process.env.STRAVA_REDIRECT_URI = "http://localhost:3000/integrations/strava/callback";
    expect(c.getAuthUrl("xyz")).toContain("state=xyz");
  });
});
