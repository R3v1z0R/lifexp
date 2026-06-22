import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

/**
 * Admin config CRUD. All changes take effect on the next log because the log
 * pipeline loads these definitions per-transaction — no redeploy needed.
 */

async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const user = request.user as any;
  if (!user || user.role !== "admin") {
    return reply.status(403).send({ error: "Forbidden: admin role required" });
  }
}

interface CrudOptions {
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pkColumn: any;
}

/** Register list / get / create / update / delete for one config table. */
function registerCrud(app: FastifyInstance, { path, table, pkColumn }: CrudOptions) {
  // LIST
  app.get(`/admin/${path}`, { preHandler: adminGuard }, async () => {
    const rows = await db.select().from(table);
    return { items: rows };
  });

  // GET one
  app.get<{ Params: { id: string } }>(
    `/admin/${path}/:id`,
    { preHandler: adminGuard },
    async (request, reply) => {
      const rows = await db.select().from(table).where(eq(pkColumn, request.params.id)).limit(1);
      if (rows.length === 0) return reply.status(404).send({ error: "Not found" });
      return rows[0];
    }
  );

  // CREATE
  app.post<{ Body: Record<string, unknown> }>(
    `/admin/${path}`,
    { preHandler: adminGuard },
    async (request, reply) => {
      try {
        const inserted = await db.insert(table).values(request.body).returning();
        return reply.status(201).send(inserted[0]);
      } catch (err) {
        request.log.error(err);
        return reply.status(400).send({ error: (err as Error).message });
      }
    }
  );

  // UPDATE (partial)
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    `/admin/${path}/:id`,
    { preHandler: adminGuard },
    async (request, reply) => {
      try {
        const updated = await db
          .update(table)
          .set(request.body)
          .where(eq(pkColumn, request.params.id))
          .returning();
        if (updated.length === 0) return reply.status(404).send({ error: "Not found" });
        return updated[0];
      } catch (err) {
        request.log.error(err);
        return reply.status(400).send({ error: (err as Error).message });
      }
    }
  );

  // DELETE
  app.delete<{ Params: { id: string } }>(
    `/admin/${path}/:id`,
    { preHandler: adminGuard },
    async (request, reply) => {
      const deleted = await db
        .delete(table)
        .where(eq(pkColumn, request.params.id))
        .returning();
      if (deleted.length === 0) return reply.status(404).send({ error: "Not found" });
      return { deleted: true };
    }
  );
}

export async function adminRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: "sections",
    table: schema.section_definitions,
    pkColumn: schema.section_definitions.slug,
  });
  registerCrud(app, {
    path: "activities",
    table: schema.activity_definitions,
    pkColumn: schema.activity_definitions.slug,
  });
  registerCrud(app, {
    path: "intensity-configs",
    table: schema.activity_intensity_configs,
    pkColumn: schema.activity_intensity_configs.id,
  });
  registerCrud(app, {
    path: "streak-tiers",
    table: schema.streak_bonus_tiers,
    pkColumn: schema.streak_bonus_tiers.id,
  });
  registerCrud(app, {
    path: "xp-caps",
    table: schema.xp_multiplier_caps,
    pkColumn: schema.xp_multiplier_caps.cap_key,
  });
  registerCrud(app, {
    path: "perks",
    table: schema.perks,
    pkColumn: schema.perks.slug,
  });
}
