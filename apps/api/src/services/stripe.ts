import Stripe from "stripe";

/**
 * Stripe integration. Configured entirely via environment variables so the
 * server boots fine in local/dev without billing keys. Call `isStripeConfigured()`
 * before using `stripe` in a route, and return a 503 when it is not set up.
 */

/** Treat empty values and the .env.example placeholders as "not set". */
function realValue(v: string | undefined): string | undefined {
  if (!v || v.includes("your_key_here") || v.includes("price_xxx")) return undefined;
  return v;
}

const secretKey = realValue(process.env.STRIPE_SECRET_KEY);
const webhookSecret = realValue(process.env.STRIPE_WEBHOOK_SECRET);

export const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" })
  : null;

export function isStripeConfigured(): boolean {
  return stripe !== null;
}

/**
 * Map our plan slugs to the Stripe recurring Price IDs (set in the dashboard,
 * test mode). `free` has no price — it is the default with no subscription.
 */
export const PLAN_PRICE_IDS: Record<"pro" | "team", string | undefined> = {
  pro: realValue(process.env.STRIPE_PRICE_PRO),
  team: realValue(process.env.STRIPE_PRICE_TEAM),
};

/**
 * Credit packs: one-time payments. Key is the pack slug used in the checkout
 * request; `credits` is granted on payment_intent.succeeded.
 */
export interface CreditPack {
  slug: string;
  priceId: string | undefined;
  credits: number;
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  small: { slug: "small", priceId: realValue(process.env.STRIPE_PRICE_CREDITS_SMALL), credits: 100 },
  medium: { slug: "medium", priceId: realValue(process.env.STRIPE_PRICE_CREDITS_MEDIUM), credits: 500 },
  large: { slug: "large", priceId: realValue(process.env.STRIPE_PRICE_CREDITS_LARGE), credits: 1200 },
};

export const CHECKOUT_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL || "http://localhost:5173/billing/success";
export const CHECKOUT_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL || "http://localhost:5173/billing/cancel";

/**
 * Verify and parse a webhook payload. `rawBody` MUST be the unparsed request
 * body (a Buffer/string) — Stripe's signature is computed over the raw bytes.
 */
export function constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  if (!stripe || !webhookSecret) {
    throw new Error("Stripe webhook not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
