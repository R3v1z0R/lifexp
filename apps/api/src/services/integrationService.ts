import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { getConnector } from "../connectors/registry";
import { mapNormalized } from "../connectors/mapping";
import type { NormalizedActivity, TokenSet } from "../connectors/types";
import { encryptSecret, decryptSecret } from "../lib/crypto";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type ConnectionRow = typeof schema.provider_connections.$inferSelect;

export async function saveConnection(
  userId: string,
  provider: "strava",
  tokens: TokenSet
): Promise<void> {
  const values = {
    user_id: userId,
    provider,
    access_token: encryptSecret(tokens.accessToken),
    refresh_token: encryptSecret(tokens.refreshToken),
    token_expires_at: tokens.expiresAt,
    scopes: tokens.scopes,
    external_athlete_id: tokens.athleteId,
    status: "active" as const,
  };
  await db
    .insert(schema.provider_connections)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.provider_connections.user_id, schema.provider_connections.provider],
      set: {
        access_token: values.access_token,
        refresh_token: values.refresh_token,
        token_expires_at: values.token_expires_at,
        scopes: values.scopes,
        external_athlete_id: values.external_athlete_id,
        status: "active",
      },
    });
}

export async function validAccessToken(conn: ConnectionRow): Promise<string> {
  if (conn.token_expires_at.getTime() > Date.now() + 60_000) {
    return decryptSecret(conn.access_token);
  }
  const connector = getConnector(conn.provider);
  try {
    const fresh = await connector.refreshToken(decryptSecret(conn.refresh_token));
    await db
      .update(schema.provider_connections)
      .set({
        access_token: encryptSecret(fresh.accessToken),
        refresh_token: encryptSecret(fresh.refreshToken),
        token_expires_at: fresh.expiresAt,
        status: "active",
      })
      .where(eq(schema.provider_connections.id, conn.id));
    return fresh.accessToken;
  } catch {
    await db
      .update(schema.provider_connections)
      .set({ status: "needs_reauth" })
      .where(eq(schema.provider_connections.id, conn.id));
    throw new Error("NEEDS_REAUTH");
  }
}

/** Pure: the insert values for one imported_activities row. */
export function buildImportRow(userId: string, provider: "strava", n: NormalizedActivity) {
  const mapped = mapNormalized(n);
  return {
    user_id: userId,
    provider,
    external_id: n.externalId,
    raw_payload: n.raw,
    occurred_at: n.occurredAt,
    provider_type: n.providerType,
    mapped_activity_slug: mapped.activitySlug,
    value: mapped.value,
    intensity_inputs:
      Object.keys(mapped.intensityInputs).length ? mapped.intensityInputs : null,
    status: "pending" as const,
  };
}

export async function syncProvider(
  userId: string,
  provider: "strava"
): Promise<{ imported: number; pending: number }> {
  const conn = await db.query.provider_connections.findFirst({
    where: and(
      eq(schema.provider_connections.user_id, userId),
      eq(schema.provider_connections.provider, provider)
    ),
  });
  if (!conn) throw new Error("NOT_CONNECTED");

  const connector = getConnector(provider);
  const accessToken = await validAccessToken(conn);
  const since = conn.last_synced_at ?? new Date(Date.now() - THIRTY_DAYS_MS);

  let imported = 0;
  try {
    const raws = await connector.fetchActivities(
      { accessToken, refreshToken: decryptSecret(conn.refresh_token) },
      since
    );
    for (const raw of raws) {
      const row = buildImportRow(userId, provider, connector.normalize(raw));
      await db
        .insert(schema.imported_activities)
        .values(row)
        .onConflictDoNothing({
          target: [
            schema.imported_activities.provider,
            schema.imported_activities.external_id,
          ],
        });
      imported++;
    }
  } catch (err) {
    if ((err as Error).message !== "RATE_LIMITED") throw err;
    // partial — fall through and report what we got
  }

  await db
    .update(schema.provider_connections)
    .set({ last_synced_at: new Date() })
    .where(eq(schema.provider_connections.id, conn.id));

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.imported_activities)
    .where(
      and(
        eq(schema.imported_activities.user_id, userId),
        eq(schema.imported_activities.status, "pending")
      )
    );

  return { imported, pending: count };
}
