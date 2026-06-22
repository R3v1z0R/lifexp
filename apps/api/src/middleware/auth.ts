import { FastifyRequest, FastifyReply } from "fastify";
import type { AuthPayload } from "@lifexp/types";

declare global {
  namespace FastifyInstance {
    interface FastifyRequest {
      user?: AuthPayload;
    }
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    request.user = request.user as AuthPayload;
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function requireRole(role: "user" | "admin") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    const user = request.user as AuthPayload | undefined;
    if (!user || user.role !== role) {
      reply.status(403).send({ error: "Forbidden" });
    }
  };
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  const user = request.user as AuthPayload | undefined;
  if (!user || user.role !== "admin") {
    reply.status(403).send({ error: "Forbidden: admin role required" });
  }
}
