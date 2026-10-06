import "server-only";
import { getCheckoutAppUrl, getStripeClient } from "@/lib/stripe";
import { validatePurchase } from "@/services/purchases";

const DEFAULT_CURRENCY = "usd";
const CHECKOUT_FAILURE = "Checkout is temporarily unavailable. Please try again.";

export type CheckoutResult =
  | { success: true; url: string }
  | { success: false; error: string };

function amountToMinorUnits(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
    throw new Error("The listing price cannot be used for checkout.");
  }
  return minorUnits;
}

export async function createCheckoutSession(listingId: unknown): Promise<CheckoutResult> {
  try {
    const initialValidation = await validatePurchase(listingId);
    if (!initialValidation.success) {
      return { success: false, error: initialValidation.error };
    }

    const stripe = getStripeClient();
    const appUrl = getCheckoutAppUrl();

    const currentValidation = await validatePurchase(initialValidation.data.listingId);
    if (!currentValidation.success) {
      return { success: false, error: currentValidation.error };
    }

    const { buyerId, listingId: validatedListingId, title, sellingPrice } = currentValidation.data;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: DEFAULT_CURRENCY,
            product_data: { name: title },
            unit_amount: amountToMinorUnits(sellingPrice),
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      metadata: {
        listing_id: validatedListingId,
        buyer_id: buyerId,
      },
    });

    if (!session.url) {
      console.error("Stripe Checkout returned a session without a URL.");
      return { success: false, error: CHECKOUT_FAILURE };
    }

    return { success: true, url: session.url };
  } catch {
    console.error("Stripe Checkout Session creation failed.");
    return { success: false, error: CHECKOUT_FAILURE };
  }
}
