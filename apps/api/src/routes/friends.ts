import { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, or, ne, desc, inArray, isNull } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import * as schema from "../db/schema";

interface RequestBody {
  addresseeId: string;
}

/** Return the accepted-friend user ids for a given user. */
async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({
      requester: schema.friendships.requester_id,
      addressee: schema.friendships.addressee_id,
    })
    .from(schema.friendships)
    .where(
      and(
        eq(schema.friendships.status, "accepted"),
        or(
          eq(schema.friendships.requester_id, userId),
          eq(schema.friendships.addressee_id, userId)
        )
      )
    );
  return rows.map((r) => (r.requester === userId ? r.addressee : r.requester));
}

export async function friendsRoutes(app: FastifyInstance) {
  // POST /friends/request — send a friend request
  app.post<{ Body: RequestBody }>(
    "/friends/request",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: RequestBody }>, reply) => {
      const me = (request.user as any).userId as string;
      const { addresseeId } = request.body;

      if (!addresseeId) {
        return reply.status(400).send({ error: "addresseeId is required" });
      }
      if (addresseeId === me) {
        return reply.status(400).send({ error: "Cannot friend yourself" });
      }

      const target = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, addresseeId))
        .limit(1);
      if (target.length === 0) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Reject duplicates in either direction.
      const existing = await db
        .select({ id: schema.friendships.id })
        .from(schema.friendships)
        .where(
          or(
            and(
              eq(schema.friendships.requester_id, me),
              eq(schema.friendships.addressee_id, addresseeId)
            ),
            and(
              eq(schema.friendships.requester_id, addresseeId),
              eq(schema.friendships.addressee_id, me)
            )
          )
        )
        .limit(1);
      if (existing.length > 0) {
        return reply.status(409).send({ error: "Friendship already exists" });
      }

      const inserted = await db
        .insert(schema.friendships)
        .values({ requester_id: me, addressee_id: addresseeId, status: "pending" })
        .returning({ id: schema.friendships.id });

      await db.insert(schema.notifications).values({
        user_id: addresseeId,
        type: "friend_request",
        payload: { friendshipId: inserted[0].id, from: me },
      });

      return reply.status(201).send({ id: inserted[0].id, status: "pending" });
    }
  );

  // POST /friends/accept/:id — accept a pending request addressed to me
  app.post<{ Params: { id: string } }>(
    "/friends/accept/:id",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const me = (request.user as any).userId as string;
      const { id } = request.params;

      const updated = await db
        .update(schema.friendships)
        .set({ status: "accepted" })
        .where(
          and(
            eq(schema.friendships.id, id),
            eq(schema.friendships.addressee_id, me),
            eq(schema.friendships.status, "pending")
          )
        )
        .returning({ id: schema.friendships.id, requester: schema.friendships.requester_id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: "No pending request found" });
      }

      await db.insert(schema.notifications).values({
        user_id: updated[0].requester,
        type: "friend_accepted",
        payload: { friendshipId: id, by: me },
      });

      return reply.send({ id, status: "accepted" });
    }
  );

  // GET /friends — list accepted friends
  app.get("/friends", { preHandler: authenticate }, async (request, reply) => {
    const me = (request.user as any).userId as string;
    const friendIds = await getFriendIds(me);
    if (friendIds.length === 0) return reply.send({ friends: [] });

    const friends = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        hero_level: schema.users.hero_level,
        avatar_url: schema.users.avatar_url,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, friendIds));
    return reply.send({ friends });
  });

  // GET /friends/feed — recent logs from friends, respecting their log visibility
  app.get("/friends/feed", { preHandler: authenticate }, async (request, reply) => {
    const me = (request.user as any).userId as string;
    const friendIds = await getFriendIds(me);
    if (friendIds.length === 0) return reply.send({ feed: [] });

    const feed = await db
      .select({
        id: schema.activity_logs.id,
        user_id: schema.activity_logs.user_id,
        username: schema.users.username,
        activity_slug: schema.activity_logs.activity_slug,
        value: schema.activity_logs.value,
        final_xp: schema.activity_logs.final_xp,
        logged_at: schema.activity_logs.logged_at,
      })
      .from(schema.activity_logs)
      .innerJoin(schema.users, eq(schema.users.id, schema.activity_logs.user_id))
      .leftJoin(schema.user_settings, eq(schema.user_settings.user_id, schema.activity_logs.user_id))
      .where(
        and(
          inArray(schema.activity_logs.user_id, friendIds),
          // Hide logs from friends who set their default log visibility to private.
          // No settings row (NULL) is treated as the default (visible to friends).
          or(
            isNull(schema.user_settings.default_log_visibility),
            ne(schema.user_settings.default_log_visibility, "private")
          )
        )
      )
      .orderBy(desc(schema.activity_logs.logged_at))
      .limit(50);

    return reply.send({ feed });
  });
}
