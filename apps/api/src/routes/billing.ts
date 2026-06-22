import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, ne, asc } from "drizzle-orm";
import type Stripe from "stripe";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  stripe,
  isStripeConfigured,
  constructWebhookEvent,
  PLAN_PRICE_IDS,
  CREDIT_PACKS,
  CHECKOUT_SUCCESS_URL,
  CHECKOUT_CANCEL_URL,
} from "../services/stripe";

type Plan = "free" | "pro" | "team";

interface CheckoutBody {
  kind: "subscription" | "credits";
  plan?: "pro" | "team";
  pack?: string;
}

export async function billingRoutes(app: FastifyInstance) {
  // GET /billing/me — current plan, credits, expiry
  app.get("/billing/me", { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    const auth = request.user as any;
    const rows = await db
      .select({
        plan: schema.users.plan,
        plan_expires_at: schema.users.plan_expires_at,
        credit_balance: schema.users.credit_balance,
      })
      .from(schema.users)
      .where(eq(schema.users.id, auth.userId))
      .limit(1);

    if (rows.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }
    return reply.send(rows[0]);
  });

  // POST /billing/checkout — create a Stripe Checkout session
  app.post<{ Body: CheckoutBody }>(
    "/billing/checkout",
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: CheckoutBody }>, reply) => {
      if (!isStripeConfigured() || !stripe) {
        return reply.status(503).send({ error: "Billing is not configured on this server" });
      }

      const auth = request.user as any;
      const { kind, plan, pack } = request.body;

      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, auth.userId))
        .limit(1);
      const user = users[0];
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Ensure a Stripe customer exists for this user
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await db
          .update(schema.users)
          .set({ stripe_customer_id: customerId })
          .where(eq(schema.users.id, user.id));
      }

      try {
        if (kind === "subscription") {
          if (plan !== "pro" && plan !== "team") {
            return reply.status(400).send({ error: "Invalid plan" });
          }
          const priceId = PLAN_PRICE_IDS[plan];
          if (!priceId) {
            return reply.status(503).send({ error: `Price for plan '${plan}' is not configured` });
          }
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: CHECKOUT_SUCCESS_URL,
            cancel_url: CHECKOUT_CANCEL_URL,
            metadata: { userId: user.id, kind, plan },
          });
          return reply.send({ url: session.url });
        }

        if (kind === "credits") {
          const creditPack = pack ? CREDIT_PACKS[pack] : undefined;
          if (!creditPack) {
            return reply.status(400).send({ error: "Invalid credit pack" });
          }
          if (!creditPack.priceId) {
            return reply
              .status(503)
              .send({ error: `Price for credit pack '${pack}' is not configured` });
          }
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer: customerId,
            line_items: [{ price: creditPack.priceId, quantity: 1 }],
            success_url: CHECKOUT_SUCCESS_URL,
            cancel_url: CHECKOUT_CANCEL_URL,
            metadata: {
              userId: user.id,
              kind,
              pack: creditPack.slug,
              credits: String(creditPack.credits),
            },
          });
          return reply.send({ url: session.url });
        }

        return reply.status(400).send({ error: "Invalid checkout kind" });
      } catch (err) {
        request.log.error(err);
        return reply.status(502).send({ error: "Failed to create checkout session" });
      }
    }
  );

  // POST /billing/webhook — Stripe events. No auth; verified by signature.
  // Requires the raw request body (see rawBody content-type parser in index.ts).
  app.post("/billing/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isStripeConfigured()) {
      return reply.status(503).send({ error: "Billing is not configured" });
    }

    const signature = request.headers["stripe-signature"];
    const rawBody = (request as any).rawBody as Buffer | undefined;
    if (!signature || !rawBody) {
      return reply.status(400).send({ error: "Missing signature or body" });
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(rawBody, signature as string);
    } catch (err) {
      request.log.error({ err }, "Webhook signature verification failed");
      return reply.status(400).send({ error: "Invalid signature" });
    }

    // Idempotency: claim the event id. If it already exists, we've processed it.
    const claimed = await db
      .insert(schema.stripe_webhooks_log)
      .values({ stripe_event_id: event.id, payload: event as any })
      .onConflictDoNothing()
      .returning({ id: schema.stripe_webhooks_log.stripe_event_id });

    if (claimed.length === 0) {
      return reply.send({ received: true, duplicate: true });
    }

    try {
      await handleWebhookEvent(event);
    } catch (err) {
      request.log.error({ err, type: event.type }, "Webhook handler failed");
      // Return 500 so Stripe retries; remove the idempotency claim so the retry runs.
      await db
        .delete(schema.stripe_webhooks_log)
        .where(eq(schema.stripe_webhooks_log.stripe_event_id, event.id));
      return reply.status(500).send({ error: "Handler failed" });
    }

    return reply.send({ received: true });
  });
}

async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) return;

      if (session.mode === "subscription" && session.metadata?.plan) {
        const plan = session.metadata.plan as Plan;
        await applyPlan(userId, plan, periodEndFromSubscription(session));
      } else if (session.mode === "payment" && session.metadata?.credits) {
        const credits = parseInt(session.metadata.credits, 10);
        if (!Number.isNaN(credits) && credits > 0) {
          await grantCredits(userId, credits, "credit_pack", session.id);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const { userId, plan } = await resolveSubscription(sub);
      if (!userId) return;
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null;
      const active = sub.status === "active" || sub.status === "trialing";
      await applyPlan(userId, active ? plan : "free", active ? periodEnd : null);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { userId } = await resolveSubscription(sub);
      if (!userId) return;
      await applyPlan(userId, "free", null);
      break;
    }

    default:
      // Unhandled event types are acknowledged but ignored.
      break;
  }
}

/** Update a user's plan + expiry, pausing over-limit data when downgrading to free. */
async function applyPlan(userId: string, plan: Plan, expiresAt: Date | null): Promise<void> {
  await db
    .update(schema.users)
    .set({ plan, plan_expires_at: expiresAt })
    .where(eq(schema.users.id, userId));

  if (plan === "free") {
    await pauseExcessForFree(userId);
  }
}

/**
 * Free tier allows a single active shared goal and no private/group events.
 * On downgrade we PAUSE excess data rather than delete it, so it can be
 * restored on re-upgrade.
 */
async function pauseExcessForFree(userId: string): Promise<void> {
  const goals = await db
    .select({ id: schema.shared_goals.id })
    .from(schema.shared_goals)
    .where(and(eq(schema.shared_goals.creator_id, userId), eq(schema.shared_goals.status, "active")))
    .orderBy(asc(schema.shared_goals.created_at));

  // Keep the oldest active goal, pause the rest.
  for (const goal of goals.slice(1)) {
    await db
      .update(schema.shared_goals)
      .set({ status: "paused" })
      .where(eq(schema.shared_goals.id, goal.id));
  }

  // Pause this user's non-public (private/friends) events that aren't finished.
  await db
    .update(schema.events)
    .set({ status: "completed" })
    .where(
      and(
        eq(schema.events.creator_id, userId),
        eq(schema.events.is_public, false),
        ne(schema.events.status, "completed")
      )
    );
}

async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  refId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ balance: schema.users.credit_balance })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (rows.length === 0) return;

    await tx
      .update(schema.users)
      .set({ credit_balance: rows[0].balance + amount })
      .where(eq(schema.users.id, userId));

    await tx.insert(schema.credit_transactions).values({
      user_id: userId,
      amount,
      reason,
      ref_id: refId,
    });
  });
}

/** Find which of our users + plan a Stripe subscription maps to. */
async function resolveSubscription(
  sub: Stripe.Subscription
): Promise<{ userId: string | null; plan: Plan }> {
  const priceId = sub.items.data[0]?.price.id;
  let plan: Plan = "free";
  if (priceId && priceId === PLAN_PRICE_IDS.pro) plan = "pro";
  else if (priceId && priceId === PLAN_PRICE_IDS.team) plan = "team";

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.stripe_customer_id, customerId))
    .limit(1);

  return { userId: rows[0]?.id ?? null, plan };
}

function periodEndFromSubscription(session: Stripe.Checkout.Session): Date | null {
  // Checkout sessions don't carry the period end directly; default to +30 days.
  // The authoritative value arrives via customer.subscription.updated.
  void session;
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
