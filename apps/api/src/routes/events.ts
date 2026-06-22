import { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { resolveEvent } from "@lifexp/xp-engine";
import { authenticate } from "../middleware/auth";
import { checkEntitlement, getUserPlan } from "../middleware/entitlement";
import { db } from "../db";
import * as schema from "../db/schema";

interface CreateEventBody {
  title: string;
  activitySlug: string;
  startAt: string;
  endAt: string;
  entryCredits?: number;
  visibility?: "public" | "friends" | "private";
  isPublic?: boolean;
}

export async function eventsRoutes(app: FastifyInstance) {
  // POST /events — public events are admin-only; private events require pro/team.
  app.post<{ Body: CreateEventBody }>(
    "/events",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: CreateEventBody }>, reply) => {
      const auth = request.user as any;
      const me = auth.userId as string;
      const { title, activitySlug, startAt, endAt, entryCredits, visibility, isPublic } =
        request.body;

      if (!title || !activitySlug || !startAt || !endAt) {
        return reply
          .status(400)
          .send({ error: "title, activitySlug, startAt, endAt are required" });
      }

      if (isPublic) {
        if (auth.role !== "admin") {
          return reply.status(403).send({ error: "Only admins can create public events" });
        }
      } else {
        // Private/group events are a paid feature.
        const plan = (await getUserPlan(me)) ?? "free";
        if (!checkEntitlement("PRIVATE_EVENTS", plan)) {
          return reply.status(403).send({
            error: "Private events require an upgrade",
            feature: "PRIVATE_EVENTS",
            upgrade_url: "/upgrade",
          });
        }
      }

      const activity = await db
        .select({ slug: schema.activity_definitions.slug })
        .from(schema.activity_definitions)
        .where(eq(schema.activity_definitions.slug, activitySlug))
        .limit(1);
      if (activity.length === 0) {
        return reply.status(400).send({ error: "Unknown activity" });
      }

      const start = new Date(startAt);
      const end = new Date(endAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return reply.status(400).send({ error: "Invalid start/end dates" });
      }

      const inserted = await db
        .insert(schema.events)
        .values({
          creator_id: me,
          title,
          activity_slug: activitySlug,
          start_at: start,
          end_at: end,
          entry_credits: entryCredits ?? 0,
          visibility: visibility ?? (isPublic ? "public" : "friends"),
          is_public: Boolean(isPublic),
          status: "upcoming",
        })
        .returning();

      return reply.status(201).send(inserted[0]);
    }
  );

  // POST /events/:id/join — pay entry credits and join
  app.post<{ Params: { id: string } }>(
    "/events/:id/join",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const me = (request.user as any).userId as string;
      const { id } = request.params;

      try {
        const result = await db.transaction(async (tx) => {
          const events = await tx
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, id))
            .limit(1);
          if (events.length === 0) throw new Error("NOT_FOUND");
          const event = events[0];
          if (event.status === "completed") throw new Error("EVENT_OVER");

          const existing = await tx
            .select({ id: schema.event_participants.id })
            .from(schema.event_participants)
            .where(
              and(
                eq(schema.event_participants.event_id, id),
                eq(schema.event_participants.user_id, me)
              )
            )
            .limit(1);
          if (existing.length > 0) throw new Error("ALREADY_JOINED");

          if (event.entry_credits > 0) {
            const users = await tx
              .select({ balance: schema.users.credit_balance })
              .from(schema.users)
              .where(eq(schema.users.id, me))
              .limit(1);
            const balance = users[0]?.balance ?? 0;
            if (balance < event.entry_credits) throw new Error("INSUFFICIENT_CREDITS");

            await tx
              .update(schema.users)
              .set({ credit_balance: balance - event.entry_credits })
              .where(eq(schema.users.id, me));

            await tx.insert(schema.credit_transactions).values({
              user_id: me,
              amount: -event.entry_credits,
              reason: "event_entry",
              ref_id: id,
            });
          }

          const participant = await tx
            .insert(schema.event_participants)
            .values({ event_id: id, user_id: me })
            .returning();
          return participant[0];
        });

        return reply.status(201).send(result);
      } catch (err) {
        const msg = (err as Error).message;
        const map: Record<string, [number, string]> = {
          NOT_FOUND: [404, "Event not found"],
          EVENT_OVER: [409, "Event has ended"],
          ALREADY_JOINED: [409, "Already joined"],
          INSUFFICIENT_CREDITS: [402, "Insufficient credits"],
        };
        const [code, message] = map[msg] ?? [500, "Failed to join event"];
        return reply.status(code).send({ error: message });
      }
    }
  );

  // POST /events/:id/finish — creator/admin resolves ranks and awards bonus XP
  app.post<{ Params: { id: string } }>(
    "/events/:id/finish",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const auth = request.user as any;
      const me = auth.userId as string;
      const { id } = request.params;

      const events = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, id))
        .limit(1);
      if (events.length === 0) return reply.status(404).send({ error: "Event not found" });
      const event = events[0];
      if (event.creator_id !== me && auth.role !== "admin") {
        return reply.status(403).send({ error: "Only the creator or an admin can finish" });
      }
      if (event.status === "completed") {
        return reply.status(409).send({ error: "Event already finished" });
      }

      const participants = await db
        .select()
        .from(schema.event_participants)
        .where(eq(schema.event_participants.event_id, id));

      const ranked = resolveEvent(
        participants.map((p) => ({ user_id: p.user_id, contribution_value: p.contribution_value }))
      );

      await db.transaction(async (tx) => {
        for (const r of ranked) {
          await tx
            .update(schema.event_participants)
            .set({ rank: r.rank, bonus_xp: r.bonus_xp })
            .where(
              and(
                eq(schema.event_participants.event_id, id),
                eq(schema.event_participants.user_id, r.user_id)
              )
            );

          if (r.bonus_xp > 0) {
            const users = await tx
              .select({ xp: schema.users.hero_xp })
              .from(schema.users)
              .where(eq(schema.users.id, r.user_id))
              .limit(1);
            if (users.length > 0) {
              await tx
                .update(schema.users)
                .set({ hero_xp: users[0].xp + r.bonus_xp })
                .where(eq(schema.users.id, r.user_id));
            }
          }

          await tx.insert(schema.notifications).values({
            user_id: r.user_id,
            type: "event_result",
            payload: { eventId: id, rank: r.rank, bonusXp: r.bonus_xp },
          });
        }

        await tx
          .update(schema.events)
          .set({ status: "completed" })
          .where(eq(schema.events.id, id));
      });

      return reply.send({ eventId: id, status: "completed", results: ranked });
    }
  );

  // GET /events — list public + own events
  app.get("/events", { preHandler: authenticate }, async (request, reply) => {
    const me = (request.user as any).userId as string;
    const events = await db.select().from(schema.events);
    // Public events are visible to all; non-public only to their creator.
    const visible = events.filter((e) => e.is_public || e.creator_id === me);
    return reply.send({ events: visible });
  });
}
