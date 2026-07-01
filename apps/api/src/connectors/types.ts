export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  athleteId: string;
}

export interface NormalizedActivity {
  externalId: string;
  occurredAt: Date;
  providerType: string; // raw provider type, e.g. "Run"
  distanceM?: number;
  durationS?: number;
  avgHr?: number;
  avgSpeedMps?: number;
  raw: unknown; // full provider payload, preserved
}

export interface RawConnection {
  accessToken: string;
  refreshToken: string;
}

export interface ActivityConnector {
  provider: string;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(refresh: string): Promise<TokenSet>;
  fetchActivities(conn: RawConnection, since: Date): Promise<unknown[]>;
  normalize(raw: unknown): NormalizedActivity;
}
