import { FastifyInstance } from "fastify";
import { db } from "../db";
import * as schema from "../db/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import type { AuthResponse, User } from "@lifexp/types";

/** Strip secrets (password hash) from a user row before returning it to clients. */
function sanitizeUser(row: Record<string, unknown>): User {
  const { password_hash, ...safe } = row;
  void password_hash;
  return safe as unknown as User;
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post<{ Body: { username: string; email: string; password: string } }>(
    "/auth/register",
    async (request, reply) => {
      const { username, email, password } = request.body;

      if (!username || !email || !password) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const existingUsers = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      if (existingUsers.length > 0) {
        return reply.status(409).send({ error: "Email already registered" });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const [newUser] = await db
        .insert(schema.users)
        .values({
          username,
          email,
          password_hash,
          role: "user",
          plan: "free",
        })
        .returning();

      // Create user settings
      await db.insert(schema.user_settings).values({
        user_id: newUser.id,
        profile_visibility: "friends",
        default_log_visibility: "friends",
        notifications_enabled: true,
        timezone: "UTC",
      });

      const accessToken = app.jwt.sign(
        {
          userId: newUser.id,
          email: newUser.email,
          role: newUser.role,
        },
        { expiresIn: "15m" }
      );

      const refreshTokenId = crypto.randomUUID();
      const refreshTokenHash = await bcrypt.hash(refreshTokenId, 10);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(schema.refresh_tokens).values({
        user_id: newUser.id,
        token_hash: refreshTokenHash,
        expires_at: expiresAt,
      });

      const refreshToken = app.jwt.sign(
        {
          userId: newUser.id,
          tokenId: refreshTokenId,
        },
        { expiresIn: "7d" }
      );

      const response: AuthResponse = {
        accessToken,
        refreshToken,
        user: sanitizeUser(newUser),
      };

      reply.status(201).send(response);
    }
  );

  // POST /auth/login — identifier may be an email or a username
  app.post<{ Body: { identifier?: string; email?: string; password: string } }>(
    "/auth/login",
    async (request, reply) => {
      const { identifier, email, password } = request.body;
      const login = identifier ?? email; // `email` kept for backward compatibility

      if (!login || !password) {
        return reply.status(400).send({ error: "Missing credentials" });
      }

      const users = await db
        .select()
        .from(schema.users)
        .where(or(eq(schema.users.email, login), eq(schema.users.username, login)))
        .limit(1);

      const user = users[0];

      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const accessToken = app.jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        { expiresIn: "15m" }
      );

      const refreshTokenId = crypto.randomUUID();
      const refreshTokenHash = await bcrypt.hash(refreshTokenId, 10);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(schema.refresh_tokens).values({
        user_id: user.id,
        token_hash: refreshTokenHash,
        expires_at: expiresAt,
      });

      const refreshToken = app.jwt.sign(
        {
          userId: user.id,
          tokenId: refreshTokenId,
        },
        { expiresIn: "7d" }
      );

      const response: AuthResponse = {
        accessToken,
        refreshToken,
        user: sanitizeUser(user),
      };

      reply.send(response);
    }
  );

  // POST /auth/refresh
  app.post<{ Body: { refreshToken: string } }>(
    "/auth/refresh",
    async (request, reply) => {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        return reply.status(400).send({ error: "Missing refresh token" });
      }

      try {
        const payload = app.jwt.verify(refreshToken) as {
          userId: string;
          tokenId: string;
        };

        const usersFound = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, payload.userId))
          .limit(1);
        const user = usersFound[0];

        if (!user) {
          return reply.status(401).send({ error: "User not found" });
        }

        const newAccessToken = app.jwt.sign(
          {
            userId: user.id,
            email: user.email,
            role: user.role,
          },
          { expiresIn: "15m" }
        );

        reply.send({ accessToken: newAccessToken });
      } catch (err) {
        reply.status(401).send({ error: "Invalid refresh token" });
      }
    }
  );

  // POST /auth/logout
  app.post<{ Params: { tokenId: string } }>(
    "/auth/logout/:tokenId",
    async (request, reply) => {
      const { tokenId } = request.params;

      await db
        .delete(schema.refresh_tokens)
        .where(eq(schema.refresh_tokens.id, tokenId));

      reply.send({ ok: true });
    }
  );
}
