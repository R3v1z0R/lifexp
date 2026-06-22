import { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../middleware/auth";
import { logActivity } from "../services/logService";
import { db } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

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

      const logs = await db.query.activity_logs.findMany({
        where: eq(schema.activity_logs.user_id, user.userId),
        orderBy: (logs, { desc }) => desc(logs.logged_at),
        limit: 50,
      });

      reply.send(logs);
    }
  );
}
