import { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthPayload } from "@lifexp/types";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import { device_tokens } from "../db/schema";
import { and, eq } from "drizzle-orm";

interface RegisterBody {
  expoPushToken: string;
  platform: "ios" | "android";
}
interface UnregisterBody {
  expoPushToken: string;
}

export async function deviceRoutes(app: FastifyInstance) {
  // POST /devices — register or re-bind a push token to the current user.
  app.post<{ Body: RegisterBody }>(
    "/devices",
    { preHandler: authenticate },
    async (request: FastifyRequest, reply) => {
      const user = request.user as AuthPayload | undefined;
      if (!user) return reply.status(401).send({ error: "Unauthorized" });

      const { expoPushToken, platform } = request.body as RegisterBody;
      if (!expoPushToken || (platform !== "ios" && platform !== "android")) {
        return reply.status(400).send({ error: "Missing or invalid expoPushToken/platform" });
      }

      await db
        .insert(device_tokens)
        .values({ user_id: user.userId, expo_push_token: expoPushToken, platform })
        .onConflictDoUpdate({
          target: device_tokens.expo_push_token,
          set: { user_id: user.userId, platform, last_seen_at: new Date() },
        });

      return reply.send({ ok: true });
    }
  );

  // DELETE /devices — drop a token (logout / disable).
  app.delete<{ Body: UnregisterBody }>(
    "/devices",
    { preHandler: authenticate },
    async (request: FastifyRequest, reply) => {
      const user = request.user as AuthPayload | undefined;
      if (!user) return reply.status(401).send({ error: "Unauthorized" });

      const { expoPushToken } = (request.body ?? {}) as UnregisterBody;
      if (!expoPushToken) return reply.status(400).send({ error: "Missing expoPushToken" });

      // Scope deletion to the caller's own token: a user must not be able to
      // remove another user's device registration by guessing its token.
      await db
        .delete(device_tokens)
        .where(
          and(
            eq(device_tokens.expo_push_token, expoPushToken),
            eq(device_tokens.user_id, user.userId)
          )
        );
      return reply.send({ ok: true });
    }
  );
}
