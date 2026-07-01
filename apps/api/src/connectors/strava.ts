import type { ActivityConnector, NormalizedActivity, RawConnection, TokenSet } from "./types";

const AUTH = "https://www.strava.com/oauth/authorize";
const TOKEN = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

interface StravaActivity {
  id: number;
  type: string;
  start_date: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  average_speed?: number;
}

export class StravaConnector implements ActivityConnector {
  provider = "strava";

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? "",
      redirect_uri: process.env.STRAVA_REDIRECT_URI ?? "",
      response_type: "code",
      scope: "read,activity:read",
      approval_prompt: "auto",
      state,
    });
    return `${AUTH}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: "authorization_code", code });
  }

  async refreshToken(refresh: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  }

  private async tokenRequest(extra: Record<string, string>): Promise<TokenSet> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        ...extra,
      }),
    });
    if (!res.ok) throw new Error(`Strava token request failed (${res.status})`);
    const j = (await res.json()) as any;
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(j.expires_at * 1000),
      scopes: extra.scope ?? "read,activity:read",
      athleteId: String(j.athlete?.id ?? ""),
    };
  }

  async fetchActivities(conn: RawConnection, since: Date): Promise<unknown[]> {
    const after = Math.floor(since.getTime() / 1000);
    const url = `${API}/athlete/activities?after=${after}&per_page=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${conn.accessToken}` },
    });
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (!res.ok) throw new Error(`Strava fetch failed (${res.status})`);
    return (await res.json()) as unknown[];
  }

  normalize(raw: unknown): NormalizedActivity {
    const a = raw as StravaActivity;
    return {
      externalId: String(a.id),
      occurredAt: new Date(a.start_date),
      providerType: a.type,
      distanceM: a.distance,
      durationS: a.moving_time,
      avgHr: a.average_heartrate,
      avgSpeedMps: a.average_speed,
      raw,
    };
  }
}
