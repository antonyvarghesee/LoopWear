import "server-only";

export const PAYU_TEST_ENDPOINT = "https://test.payu.in/_payment";

export type PayUConfiguration = {
  merchantKey: string;
  merchantSalt: string;
};

export function getPayUConfiguration(): PayUConfiguration {
  const merchantKey = process.env.PAYU_MERCHANT_KEY?.trim();
  const merchantSalt = process.env.PAYU_MERCHANT_SALT?.trim();
  if (!merchantKey || !merchantSalt || merchantKey.includes("|") || merchantSalt.includes("|")) {
    throw new Error("PayU Test/UAT credentials are not configured.");
  }

  return { merchantKey, merchantSalt };
}

export function getPayUReturnUrl(result: "success" | "failure"): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Payment return URL is not configured.");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new Error("Payment return URL is not configured.");
  }

  if (
    (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:")
    || parsedUrl.username
    || parsedUrl.password
  ) {
    throw new Error("Payment return URL is not configured.");
  }

  return new URL(`/payment/return/${result}`, parsedUrl.origin).toString();
}
