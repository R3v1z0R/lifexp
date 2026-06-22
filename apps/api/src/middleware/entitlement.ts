import { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import type { Feature } from "@lifexp/types";
import { FEATURE_GATES } from "@lifexp/types";
import { db } from "../db";
import * as schema from "../db/schema";

type Plan = "free" | "pro" | "team";

export function checkEntitlement(feature: Feature, userPlan: Plan): boolean {
  const allowedPlans = FEATURE_GATES[feature];
  return allowedPlans.includes(userPlan);
}

/** Load a user's current plan from the DB (the JWT does not carry plan). */
export async function getUserPlan(userId: string): Promise<Plan | null> {
  const rows = await db
    .select({ plan: schema.users.plan })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0]?.plan ?? null;
}

/**
 * preHandler that enforces a feature gate. Must run after `authenticate`.
 * Returns 403 with an upgrade_url when the user's plan lacks the feature.
 */
export function requireEntitlement(feature: Feature) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const plan = await getUserPlan(user.userId);
    if (!plan) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    if (!checkEntitlement(feature, plan)) {
      return reply.status(403).send({
        error: "Feature requires upgrade",
        feature,
        upgrade_url: "/upgrade",
      });
    }
  };
}
