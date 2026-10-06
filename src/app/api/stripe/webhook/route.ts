import { getStripeClient } from "@/lib/stripe";
import { processVerifiedStripeEvent } from "@/services/stripe-webhook";
import type Stripe from "stripe";

export const runtime = "nodejs";

function jsonResponse(body: object, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature) {
    return jsonResponse({ error: "Invalid Stripe webhook signature." }, 400);
  }
  if (!webhookSecret) {
    console.error("Stripe webhook secret is not configured.");
    return jsonResponse({ error: "Webhook configuration is unavailable." }, 500);
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    console.error("Stripe webhook API configuration is invalid.");
    return jsonResponse({ error: "Webhook configuration is unavailable." }, 500);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: "Invalid Stripe webhook body." }, 400);
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return jsonResponse({ error: "Invalid Stripe webhook signature." }, 400);
  }

  try {
    const result = await processVerifiedStripeEvent(event);
    if (result.outcome === "rejected") {
      return jsonResponse({ received: true, outcome: "rejected" }, 200);
    }
    return jsonResponse({ received: true, outcome: result.outcome }, 200);
  } catch {
    console.error("Stripe webhook processing failed.");
    return jsonResponse({ error: "Webhook processing is temporarily unavailable." }, 500);
  }
}
