import { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, or, inArray } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { checkEntitlement, getUserPlan } from "../middleware/entitlement";
import { db } from "../db";
import * as schema from "../db/schema";

interface CreateGoalBody {
  activitySlug: string;
  targetValue: number;
  entryCredits?: number;
  visibility?: "public" | "friends" | "private";
}

export async function goalsRoutes(app: FastifyInstance) {
  // POST /goals — create a shared goal. A 2nd+ active goal requires pro/team.
  app.post<{ Body: CreateGoalBody }>(
    "/goals",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: CreateGoalBody }>, reply) => {
      const me = (request.user as any).userId as string;
      const { activitySlug, targetValue, entryCredits, visibility } = request.body;

      if (!activitySlug || targetValue === undefined) {
        return reply.status(400).send({ error: "activitySlug and targetValue are required" });
      }

      const activity = await db
        .select({ slug: schema.activity_definitions.slug })
        .from(schema.activity_definitions)
        .where(eq(schema.activity_definitions.slug, activitySlug))
        .limit(1);
      if (activity.length === 0) {
        return reply.status(400).send({ error: "Unknown activity" });
      }

      // Free tier may have at most one active goal.
      const activeGoals = await db
        .select({ id: schema.shared_goals.id })
        .from(schema.shared_goals)
        .where(
          and(eq(schema.shared_goals.creator_id, me), eq(schema.shared_goals.status, "active"))
        );
      if (activeGoals.length >= 1) {
        const plan = (await getUserPlan(me)) ?? "free";
        if (!checkEntitlement("MULTIPLE_SHARED_GOALS", plan)) {
          return reply.status(403).send({
            error: "Multiple active shared goals require an upgrade",
            feature: "MULTIPLE_SHARED_GOALS",
            upgrade_url: "/upgrade",
          });
        }
      }

      const goal = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.shared_goals)
          .values({
            creator_id: me,
            activity_slug: activitySlug,
            target_value: targetValue,
            entry_credits: entryCredits ?? 0,
            visibility: visibility ?? "friends",
            status: "active",
          })
          .returning();
        // Creator joins their own goal.
        await tx
          .insert(schema.shared_goal_members)
          .values({ goal_id: inserted[0].id, user_id: me });
        return inserted[0];
      });

      return reply.status(201).send(goal);
    }
  );

  // POST /goals/:id/invite — creator invites a user (sends a notification)
  app.post<{ Params: { id: string }; Body: { userId: string } }>(
    "/goals/:id/invite",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { userId: string } }>, reply) => {
      const me = (request.user as any).userId as string;
      const { id } = request.params;
      const { userId } = request.body;
      if (!userId) return reply.status(400).send({ error: "userId is required" });

      const goal = await db
        .select()
        .from(schema.shared_goals)
        .where(eq(schema.shared_goals.id, id))
        .limit(1);
      if (goal.length === 0) return reply.status(404).send({ error: "Goal not found" });
      if (goal[0].creator_id !== me) {
        return reply.status(403).send({ error: "Only the creator can invite" });
      }

      await db.insert(schema.notifications).values({
        user_id: userId,
        type: "goal_invite",
        payload: { goalId: id, from: me },
      });
      return reply.send({ invited: userId, goalId: id });
    }
  );

  // POST /goals/:id/join — join an active goal
  app.post<{ Params: { id: string } }>(
    "/goals/:id/join",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const me = (request.user as any).userId as string;
      const { id } = request.params;

      const goal = await db
        .select()
        .from(schema.shared_goals)
        .where(eq(schema.shared_goals.id, id))
        .limit(1);
      if (goal.length === 0) return reply.status(404).send({ error: "Goal not found" });
      if (goal[0].status !== "active") {
        return reply.status(409).send({ error: "Goal is not active" });
      }

      const already = await db
        .select({ goal_id: schema.shared_goal_members.goal_id })
        .from(schema.shared_goal_members)
        .where(
          and(
            eq(schema.shared_goal_members.goal_id, id),
            eq(schema.shared_goal_members.user_id, me)
          )
        )
        .limit(1);
      if (already.length > 0) {
        return reply.status(409).send({ error: "Already a member" });
      }

      await db.insert(schema.shared_goal_members).values({ goal_id: id, user_id: me });
      return reply.status(201).send({ goalId: id, joined: true });
    }
  );

  // GET /goals — goals the user created or joined
  app.get("/goals", { preHandler: authenticate }, async (request, reply) => {
    const me = (request.user as any).userId as string;

    const memberships = await db
      .select({ goal_id: schema.shared_goal_members.goal_id })
      .from(schema.shared_goal_members)
      .where(eq(schema.shared_goal_members.user_id, me));
    const memberGoalIds = memberships.map((m) => m.goal_id);

    const goals = await db
      .select()
      .from(schema.shared_goals)
      .where(
        memberGoalIds.length > 0
          ? or(
              eq(schema.shared_goals.creator_id, me),
              inArray(schema.shared_goals.id, memberGoalIds)
            )
          : eq(schema.shared_goals.creator_id, me)
      );

    return reply.send({ goals });
  });
}
