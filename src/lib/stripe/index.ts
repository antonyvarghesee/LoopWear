import "server-only";
import Stripe from "stripe";

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("Stripe Checkout is not configured for test mode.");
  }
  return new Stripe(secretKey);
}

export function getCheckoutAppUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) {
    throw new Error("Checkout return URLs are not configured.");
  }

  let appUrl: URL;
  try {
    appUrl = new URL(configuredUrl);
  } catch {
    throw new Error("Checkout return URLs are not configured.");
  }

  if (
    (appUrl.protocol !== "https:" && appUrl.protocol !== "http:")
    || appUrl.username
    || appUrl.password
  ) {
    throw new Error("Checkout return URLs are not configured.");
  }

  return appUrl.origin;
}
