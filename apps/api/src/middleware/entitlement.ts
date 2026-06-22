import { FastifyRequest, FastifyReply } from "fastify";
import type { Feature } from "@lifexp/types";
import { FEATURE_GATES } from "@lifexp/types";

export function checkEntitlement(feature: Feature, userPlan: "free" | "pro" | "team"): boolean {
  const allowedPlans = FEATURE_GATES[feature];
  return allowedPlans.includes(userPlan);
}

export function requireEntitlement(feature: Feature) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const allowed = checkEntitlement(feature, user.plan as "free" | "pro" | "team");
    if (!allowed) {
      reply.status(403).send({
        error: "Feature requires upgrade",
        upgrade_url: "/upgrade",
      });
    }
  };
}
