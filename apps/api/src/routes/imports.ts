import { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { logActivity } from "../services/logService";
import { db } from "../db";
import * as schema from "../db/schema";

async function acceptRow(
  userId: string,
  row: typeof schema.imported_activities.$inferSelect,
  activitySlugOverride?: string
) {
  const slug = row.mapped_activity_slug ?? activitySlugOverride;
  if (!slug) throw new Error("UNMAPPED_NEEDS_SLUG");
  if (row.value == null) throw new Error("NO_VALUE");

  const result = await logActivity({
    userId,
    activitySlug: slug,
    value: row.value,
    intensityInputs: (row.intensity_inputs as Record<string, number>) ?? undefined,
    occurredAt: row.occurred_at,
  });

  await db
    .update(schema.imported_activities)
    .set({ status: "accepted", updated_at: new Date() })
    .where(eq(schema.imported_activities.id, row.id));

  return result;
}

export async function importsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string } }>(
    "/imports",
    { preHandler: authenticate },
    async (req, reply) => {
      const user = req.user as any;
      const status = (req.query.status ?? "pending") as "pending" | "accepted" | "dismissed";
      const rows = await db
        .select()
        .from(schema.imported_activities)
        .where(
          and(
            eq(schema.imported_activities.user_id, user.userId),
            eq(schema.imported_activities.status, status)
          )
        );
      reply.send({ imports: rows });
    }
  );

  app.post<{ Params: { id: string }; Body: { activitySlug?: string } }>(
    "/imports/:id/accept",
    { preHandler: authenticate },
    async (req, reply) => {
      const user = req.user as any;
      const row = await db.query.imported_activities.findFirst({
        where: and(
          eq(schema.imported_activities.id, req.params.id),
          eq(schema.imported_activities.user_id, user.userId)
        ),
      });
      if (!row) return reply.status(404).send({ error: "not_found" });
      if (row.status === "accepted") return reply.send({ alreadyAccepted: true });
      try {
        const result = await acceptRow(user.userId, row, req.body?.activitySlug);
        reply.send({ accepted: true, xpBreakdown: result.xpBreakdown });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "UNMAPPED_NEEDS_SLUG")
          return reply.status(400).send({ error: "activitySlug required for unmapped import" });
        reply.status(400).send({ error: msg });
      }
    }
  );

  app.post("/imports/accept", { preHandler: authenticate }, async (req, reply) => {
    const user = req.user as any;
    const rows = await db
      .select()
      .from(schema.imported_activities)
      .where(
        and(
          eq(schema.imported_activities.user_id, user.userId),
          eq(schema.imported_activities.status, "pending")
        )
      );
    let accepted = 0;
    for (const row of rows) {
      if (!row.mapped_activity_slug || row.value == null) continue;
      await acceptRow(user.userId, row);
      accepted++;
    }
    reply.send({ accepted });
  });

  app.post<{ Params: { id: string } }>(
    "/imports/:id/dismiss",
    { preHandler: authenticate },
    async (req, reply) => {
      const user = req.user as any;
      const res = await db
        .update(schema.imported_activities)
        .set({ status: "dismissed", updated_at: new Date() })
        .where(
          and(
            eq(schema.imported_activities.id, req.params.id),
            eq(schema.imported_activities.user_id, user.userId),
            eq(schema.imported_activities.status, "pending")
          )
        )
        .returning({ id: schema.imported_activities.id });
      if (res.length === 0) return reply.status(404).send({ error: "not_found" });
      reply.send({ dismissed: true });
    }
  );
}
