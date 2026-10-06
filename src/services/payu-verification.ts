import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getPayUConfiguration } from "@/lib/payu";
import {
  confirmPayUPaymentAttempt,
  consumePayUPaymentAttempt,
  getPayUPaymentAttempt,
} from "@/services/payu-attempts";

export type PayUVerificationResult =
  | { status: "success" }
  | { status: "failure" }
  | { status: "cancelled" }
  | { status: "duplicate" }
  | { status: "invalid" };

type PayUResponseFields = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  status: string;
  hash: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  udf6?: string;
  udf7?: string;
  udf8?: string;
  udf9?: string;
  udf10?: string;
  additional_charges?: string;
};

function responseField(fields: Record<string, unknown>, name: string): string | null {
  const value = fields[name];
  if (typeof value !== "string" || value.length > 500) return null;
  return value;
}

function normalizeAmount(value: string | number): string | null {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function createPayUResponseHash(
  fields: Omit<PayUResponseFields, "hash" | "additional_charges">,
  merchantSalt: string,
  additionalCharges = "",
): string {
  const hashValues = [
    ...(additionalCharges ? [additionalCharges] : []),
    merchantSalt,
    fields.status,
    "",
    "",
    "",
    "",
    "",
    fields.udf5,
    fields.udf4,
    fields.udf3,
    fields.udf2,
    fields.udf1,
    fields.email,
    fields.firstname,
    fields.productinfo,
    fields.amount,
    fields.txnid,
    fields.key,
  ];
  return createHash("sha512").update(hashValues.join("|"), "utf8").digest("hex");
}

function hasValidHash(receivedHash: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{128}$/i.test(receivedHash)) return false;
  return timingSafeEqual(
    Buffer.from(receivedHash, "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

export async function verifyPayUResponse(
  untrustedFields: Record<string, unknown>,
): Promise<PayUVerificationResult> {
  try {
    const fieldNames = [
      "key", "txnid", "amount", "productinfo", "firstname", "email",
      "status", "hash", "udf1", "udf2", "udf3", "udf4", "udf5",
    ] as const;
    const parsed = Object.fromEntries(
      fieldNames.map((name) => [name, responseField(untrustedFields, name)]),
    ) as Record<(typeof fieldNames)[number], string | null>;
    if (Object.values(parsed).some((value) => value === null)) return { status: "invalid" };

    const fields = parsed as PayUResponseFields;
    const configuration = getPayUConfiguration();
    if (fields.key !== configuration.merchantKey) return { status: "invalid" };
    if (["udf6", "udf7", "udf8", "udf9", "udf10"].some((name) => {
      const value = untrustedFields[name];
      return value !== undefined && value !== "";
    })) {
      return { status: "invalid" };
    }

    const attempt = await getPayUPaymentAttempt(fields.txnid);
    if (
      !attempt
      || attempt.payment_provider.toLowerCase() !== "payu"
      || attempt.provider_transaction_id !== fields.txnid
    ) {
      return { status: "invalid" };
    }

    const expectedAmount = normalizeAmount(attempt.amount);
    const currentListingAmount = attempt.current_selling_price === null
      ? null
      : normalizeAmount(attempt.current_selling_price);
    if (
      !expectedAmount
      || !currentListingAmount
      || fields.amount !== expectedAmount
      || currentListingAmount !== expectedAmount
      || fields.productinfo !== attempt.productinfo
      || fields.firstname !== attempt.firstname
      || fields.email !== attempt.email
      || fields.udf1 !== attempt.listing_id
      || fields.udf2 !== attempt.buyer_id
      || fields.udf3 !== attempt.seller_id
      || fields.udf4 !== ""
      || fields.udf5 !== ""
      || attempt.currency.toLowerCase() !== "inr"
    ) {
      return { status: "invalid" };
    }
    if (!["pending", "verified_success", "confirmed"].includes(attempt.response_state)) {
      return { status: "invalid" };
    }

    const rawAdditionalCharges = untrustedFields.additional_charges;
    if (rawAdditionalCharges !== undefined && typeof rawAdditionalCharges !== "string") {
      return { status: "invalid" };
    }
    if (typeof rawAdditionalCharges === "string" && rawAdditionalCharges.length > 500) {
      return { status: "invalid" };
    }
    const additionalCharges = typeof rawAdditionalCharges === "string" ? rawAdditionalCharges : "";
    const expectedHash = createPayUResponseHash(fields, configuration.merchantSalt, additionalCharges);
    if (!hasValidHash(fields.hash, expectedHash)) return { status: "invalid" };

    const normalizedStatus = fields.status.toLowerCase();
    const verifiedState = normalizedStatus === "success"
      ? "verified_success"
      : normalizedStatus === "failure"
        ? "verified_failure"
        : normalizedStatus === "cancelled" || normalizedStatus === "canceled"
          ? "verified_cancelled"
          : null;
    if (!verifiedState) return { status: "invalid" };

    if (verifiedState === "verified_success") {
      const confirmation = await confirmPayUPaymentAttempt(attempt);
      return confirmation === "processed" || confirmation === "duplicate_confirmed"
        ? { status: "success" }
        : { status: "invalid" };
    }

    const consumed = await consumePayUPaymentAttempt(fields.txnid, verifiedState);
    if (consumed === "duplicate") return { status: "duplicate" };
    if (consumed !== "consumed") return { status: "invalid" };

    if (verifiedState === "verified_cancelled") return { status: "cancelled" };
    return { status: "failure" };
  } catch {
    console.error("PayU response verification failed.");
    return { status: "invalid" };
  }
}
