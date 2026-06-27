import { FastifyInstance, FastifyRequest } from "fastify";
import { eq, asc, and, ne, ilike } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import * as schema from "../db/schema";

/**
 * Read-only catalog + profile endpoints the clients need to render:
 * the activity picker, section grouping, and the signed-in user's progression.
 */
export async function catalogRoutes(app: FastifyInstance) {
  // GET /sections — active section definitions
  app.get("/sections", async () => {
    const sections = await db
      .select()
      .from(schema.section_definitions)
      .where(eq(schema.section_definitions.is_active, true))
      .orderBy(asc(schema.section_definitions.display_order));
    return { sections };
  });

  // GET /activities — active activity definitions (for the log picker)
  app.get("/activities", async () => {
    const activities = await db
      .select()
      .from(schema.activity_definitions)
      .where(eq(schema.activity_definitions.is_active, true))
      .orderBy(asc(schema.activity_definitions.display_order));
    return { activities };
  });

  // GET /activities/:slug/intensity — intensity inputs for one activity
  app.get<{ Params: { slug: string } }>(
    "/activities/:slug/intensity",
    async (request: FastifyRequest<{ Params: { slug: string } }>) => {
      const configs = await db
        .select()
        .from(schema.activity_intensity_configs)
        .where(eq(schema.activity_intensity_configs.activity_slug, request.params.slug));
      return { configs };
    }
  );

  // GET /users/search?q= — find users by username (for friend requests)
  app.get<{ Querystring: { q?: string } }>(
    "/users/search",
    { preHandler: authenticate },
    async (request, reply) => {
      const me = (request.user as any).userId as string;
      const q = (request.query.q ?? "").trim();
      if (q.length < 2) return reply.send({ users: [] });

      const users = await db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          hero_level: schema.users.hero_level,
        })
        .from(schema.users)
        .where(and(ilike(schema.users.username, `%${q}%`), ne(schema.users.id, me)))
        .limit(10);
      return reply.send({ users });
    }
  );

  // GET /me — the signed-in user's profile + progression
  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as any;
    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        email: schema.users.email,
        avatar_url: schema.users.avatar_url,
        hero_level: schema.users.hero_level,
        hero_xp: schema.users.hero_xp,
        role: schema.users.role,
        plan: schema.users.plan,
        credit_balance: schema.users.credit_balance,
      })
      .from(schema.users)
      .where(eq(schema.users.id, auth.userId))
      .limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: "User not found" });

    const sections = await db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.user_id, auth.userId));

    return reply.send({ user: rows[0], sections });
  });
}
