import { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { requireEntitlement } from "../middleware/entitlement";
import { getConnector } from "../connectors/registry";
import { saveConnection, syncProvider } from "../services/integrationService";
import { db } from "../db";
import * as schema from "../db/schema";

const PROVIDERS = ["strava"] as const;
type Provider = (typeof PROVIDERS)[number];

function isProvider(p: string): p is Provider {
  return (PROVIDERS as readonly string[]).includes(p);
}

export async function integrationsRoutes(app: FastifyInstance) {
  const gate = requireEntitlement("CLOUD_IMPORT");

  // List connections (free, no secrets)
  app.get("/integrations", { preHandler: authenticate }, async (req, reply) => {
    const user = req.user as any;
    const rows = await db
      .select({
        provider: schema.provider_connections.provider,
        status: schema.provider_connections.status,
        connected_at: schema.provider_connections.connected_at,
        last_synced_at: schema.provider_connections.last_synced_at,
      })
      .from(schema.provider_connections)
      .where(eq(schema.provider_connections.user_id, user.userId));
    reply.send({ connections: rows });
  });

  // Begin OAuth (Pro)
  app.get<{ Params: { provider: string } }>(
    "/integrations/:provider/connect",
    { preHandler: [authenticate, gate] },
    async (req, reply) => {
      const user = req.user as any;
      const { provider } = req.params;
      if (!isProvider(provider)) return reply.status(404).send({ error: "Unknown provider" });
      const state = app.jwt.sign({ userId: user.userId, provider }, { expiresIn: "10m" });
      reply.send({ url: getConnector(provider).getAuthUrl(state) });
    }
  );

  // OAuth callback — browser navigation from the provider, NO bearer header.
  // Auth is the signed `state` (only issuable via the Pro-gated connect route).
  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>(
    "/integrations/:provider/callback",
    async (req, reply) => {
      const { provider } = req.params;
      const { code, state } = req.query;
      const webUrl = process.env.APP_WEB_URL ?? "http://localhost:5173";
      if (!isProvider(provider) || !code || !state) {
        return reply.redirect(`${webUrl}/integrations?connected=error`);
      }
      try {
        const decoded = app.jwt.verify(state) as { userId: string; provider: string };
        if (decoded.provider !== provider) {
          return reply.redirect(`${webUrl}/integrations?connected=error`);
        }
        const tokens = await getConnector(provider).exchangeCode(code);
        await saveConnection(decoded.userId, provider, tokens);
        reply.redirect(`${webUrl}/integrations?connected=${provider}`);
      } catch {
        reply.redirect(`${webUrl}/integrations?connected=error`);
      }
    }
  );

  // Manual sync (Pro)
  app.post<{ Params: { provider: string } }>(
    "/integrations/:provider/sync",
    { preHandler: [authenticate, gate] },
    async (req, reply) => {
      const user = req.user as any;
      const { provider } = req.params;
      if (!isProvider(provider)) return reply.status(404).send({ error: "Unknown provider" });
      try {
        const result = await syncProvider(user.userId, provider);
        reply.send(result);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "NEEDS_REAUTH") return reply.status(409).send({ error: "needs_reauth" });
        if (msg === "NOT_CONNECTED") return reply.status(400).send({ error: "not_connected" });
        reply.status(502).send({ error: "sync_failed" });
      }
    }
  );

  // Disconnect (free)
  app.delete<{ Params: { provider: string } }>(
    "/integrations/:provider",
    { preHandler: authenticate },
    async (req, reply) => {
      const user = req.user as any;
      const { provider } = req.params;
      if (!isProvider(provider)) return reply.status(404).send({ error: "Unknown provider" });
      await db
        .delete(schema.imported_activities)
        .where(
          and(
            eq(schema.imported_activities.user_id, user.userId),
            eq(schema.imported_activities.provider, provider),
            eq(schema.imported_activities.status, "pending")
          )
        );
      await db
        .delete(schema.provider_connections)
        .where(
          and(
            eq(schema.provider_connections.user_id, user.userId),
            eq(schema.provider_connections.provider, provider)
          )
        );
      reply.send({ disconnected: true });
    }
  );
}
