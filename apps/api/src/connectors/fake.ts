import type { ActivityConnector, NormalizedActivity, RawConnection, TokenSet } from "./types";

/** Deterministic in-memory connector for tests and local dev. */
export class FakeConnector implements ActivityConnector {
  provider = "strava";
  activities: NormalizedActivity[] = [];

  getAuthUrl(state: string): string {
    return `https://example.test/oauth?state=${state}`;
  }
  async exchangeCode(): Promise<TokenSet> {
    return this.token();
  }
  async refreshToken(): Promise<TokenSet> {
    return this.token();
  }
  async fetchActivities(_conn: RawConnection, since: Date): Promise<unknown[]> {
    return this.activities.filter((a) => a.occurredAt >= since).map((a) => a.raw ?? a);
  }
  normalize(raw: unknown): NormalizedActivity {
    return raw as NormalizedActivity;
  }
  private token(): TokenSet {
    return {
      accessToken: "fake-access",
      refreshToken: "fake-refresh",
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: "read,activity:read",
      athleteId: "fake-athlete",
    };
  }
}
