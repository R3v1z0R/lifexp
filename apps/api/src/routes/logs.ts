import { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../middleware/auth";
import { logActivity } from "../services/logService";
import { dispatchPush } from "../services/pushService";
import type { LevelUpEvent } from "@lifexp/types";
import { db } from "../db";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";

interface LogActivityBody {
  activitySlug: string;
  value: number;
  intensityInputs?: Record<string, number>;
  goalId?: string;
  eventParticipantId?: string;
}

export async function logsRoutes(app: FastifyInstance) {
  // POST /logs
  app.post<{ Body: LogActivityBody }>(
    "/logs",
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply) => {
      const user = request.user as any;
      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as LogActivityBody;
      const { activitySlug, value, intensityInputs, goalId, eventParticipantId } = body;

      if (!activitySlug || value === undefined) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      try {
        const result = await logActivity({
          userId: user.userId,
          activitySlug,
          value,
          intensityInputs,
          goalId,
          eventParticipantId,
        });

        reply.send(result);

        // Fire-and-forget: notify devices of level-ups / perk choices. Never awaited,
        // never blocks the response, never throws into the request lifecycle.
        const levelUps = [result.heroLevelUp, result.sectionLevelUp, result.activityLevelUp].filter(
          (l): l is LevelUpEvent => l != null
        );
        void dispatchPush({
          userId: user.userId,
          levelUps,
          perkChoiceCount: result.pendingPerkChoices?.length ?? 0,
        });
      } catch (error) {
        console.error("Log error:", error);
        reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  // GET /logs (user's recent logs)
  app.get(
    "/logs",
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply) => {
      const user = request.user as any;
      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const logs = await db
        .select()
        .from(schema.activity_logs)
        .where(eq(schema.activity_logs.user_id, user.userId))
        .orderBy(desc(schema.activity_logs.logged_at))
        .limit(50);

      reply.send(logs);
    }
  );
}
