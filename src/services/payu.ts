import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getPayUConfiguration, getPayUReturnUrl, PAYU_TEST_ENDPOINT } from "@/lib/payu";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth";
import { validatePurchase } from "@/services/purchases";

const listingIdSchema = z.string().uuid();
const PAYMENT_UNAVAILABLE = "PayU checkout is temporarily unavailable. Please try again.";

export type PayUCheckoutFields = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  api_version: "7";
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  surl: string;
  furl: string;
  hash: string;
};

export type PayUInitiation =
  | { success: true; endpoint: string; fields: PayUCheckoutFields; currency: "INR" }
  | { success: false; error: string };

function formatAmount(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function createPayURequestHash(
  fields: Omit<PayUCheckoutFields, "hash">,
  merchantSalt: string,
): string {
  const hashInput = [
    fields.key,
    fields.txnid,
    fields.amount,
    fields.productinfo,
    fields.firstname,
    fields.email,
    fields.udf1,
    fields.udf2,
    fields.udf3,
    fields.udf4,
    fields.udf5,
    "",
    "",
    "",
    "",
    "",
    merchantSalt,
  ].join("|");
  return createHash("sha512").update(hashInput, "utf8").digest("hex");
}

export async function initiatePayUPayment(listingId: unknown): Promise<PayUInitiation> {
  const parsedListingId = listingIdSchema.safeParse(listingId);
  if (!parsedListingId.success) {
    return { success: false, error: "This listing could not be found." };
  }

  try {
    const purchase = await validatePurchase(parsedListingId.data);
    if (!purchase.success) return purchase;

    const buyer = await getCurrentUser();
    if (!buyer || buyer.id !== purchase.data.buyerId || !buyer.email) {
      return { success: false, error: "Sign in with a valid email to purchase this listing." };
    }

    const email = z.string().email().max(50).safeParse(buyer.email);
    if (!email.success || buyer.email.includes("|")) {
      return { success: false, error: "A valid email is required to start checkout." };
    }

    const phone = buyer.phone?.replace(/\D/g, "");
    if (!phone || !buyer.phone_confirmed_at || !/^\d{10,15}$/.test(phone)) {
      return { success: false, error: "Verify a valid phone number before starting checkout." };
    }

    const { merchantKey, merchantSalt } = getPayUConfiguration();
    const successUrl = getPayUReturnUrl("success");
    const failureUrl = getPayUReturnUrl("failure");
    const txnid = randomBytes(12).toString("hex");
    const amount = formatAmount(purchase.data.sellingPrice);
    const productinfo = purchase.data.title.replaceAll("|", " ").slice(0, 100);
    const firstname = "LoopWear";
    const udf1 = purchase.data.listingId;
    const udf2 = purchase.data.buyerId;
    const udf3 = purchase.data.sellerId;

    const fieldsWithoutHash: Omit<PayUCheckoutFields, "hash"> = {
      key: merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email: buyer.email,
      phone,
      api_version: "7",
      udf1,
      udf2,
      udf3,
      udf4: "",
      udf5: "",
      surl: successUrl,
      furl: failureUrl,
    };
    const fields: PayUCheckoutFields = {
      ...fieldsWithoutHash,
      hash: createPayURequestHash(fieldsWithoutHash, merchantSalt),
    };

    const { error: attemptError } = await createSupabaseAdminClient().rpc(
      "register_provider_checkout_attempt",
      {
        p_payment_provider: "payu",
        p_provider_transaction_id: txnid,
        p_listing_id: purchase.data.listingId,
        p_buyer_id: purchase.data.buyerId,
        p_seller_id: purchase.data.sellerId,
        p_amount: amount,
        p_currency: "inr",
        p_productinfo: productinfo,
        p_firstname: firstname,
        p_email: buyer.email,
      },
    );
    if (attemptError) throw attemptError;

    return {
      success: true,
      endpoint: PAYU_TEST_ENDPOINT,
      fields,
      currency: "INR",
    };
  } catch {
    console.error("PayU payment initiation failed.");
    return { success: false, error: PAYMENT_UNAVAILABLE };
  }
}
