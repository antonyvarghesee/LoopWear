/**
 * E2E Environment Safety Guard & Configuration Boundary
 *
 * Ensures Playwright E2E tests NEVER run against the development/production Supabase project.
 * Fails closed immediately with actionable diagnostics if dedicated E2E credentials are missing.
 */

export interface E2EEnvironment {
  testMode: true;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  payuMerchantKey: string;
  payuMerchantSalt: string;
  appUrl: string;
}

export function validateE2EEnvironment(): E2EEnvironment {
  const isTestMode = process.env.E2E_TEST_MODE === "true";
  const url = process.env.E2E_SUPABASE_URL?.trim();
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const payuMerchantKey = process.env.E2E_PAYU_MERCHANT_KEY?.trim();
  const payuMerchantSalt = process.env.E2E_PAYU_MERCHANT_SALT?.trim();

  if (!isTestMode) {
    throw new Error(
      "\n====================================================================\n" +
      "[E2E SAFETY ERROR] E2E_TEST_MODE=true environment variable is missing.\n" +
      "E2E tests are BLOCKED from executing against non-test environments.\n" +
      "Set E2E_TEST_MODE=true and provide dedicated E2E credentials.\n" +
      "Refer to .env.e2e.example for required configuration.\n" +
      "====================================================================\n"
    );
  }

  if (!url || !anonKey || !serviceRoleKey || !payuMerchantKey || !payuMerchantSalt) {
    const missing: string[] = [];
    if (!url) missing.push("E2E_SUPABASE_URL");
    if (!anonKey) missing.push("E2E_SUPABASE_ANON_KEY");
    if (!serviceRoleKey) missing.push("E2E_SUPABASE_SERVICE_ROLE_KEY");
    if (!payuMerchantKey) missing.push("E2E_PAYU_MERCHANT_KEY");
    if (!payuMerchantSalt) missing.push("E2E_PAYU_MERCHANT_SALT");

    throw new Error(
      "\n====================================================================\n" +
      `[E2E SAFETY ERROR] Missing dedicated E2E environment variables:\n` +
      missing.map((v) => `  - ${v}`).join("\n") + "\n\n" +
      "Playwright E2E tests MUST NOT fall back to development or hardcoded credentials.\n" +
      "Please populate these variables in your environment or .env.e2e.\n" +
      "====================================================================\n"
    );
  }

  // Safety check: Prevent pointing E2E_SUPABASE_URL to live dev DB if NEXT_PUBLIC_SUPABASE_URL is present in process.env
  const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (devUrl && devUrl === url && !process.env.ALLOW_E2E_SAME_DB) {
    throw new Error(
      "\n====================================================================\n" +
      "[E2E SAFETY ERROR] E2E_SUPABASE_URL matches NEXT_PUBLIC_SUPABASE_URL in .env.local!\n" +
      "Running E2E tests against your active development project is disabled to prevent data corruption.\n" +
      "Use a dedicated Supabase project/container for E2E tests.\n" +
      "====================================================================\n"
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

  return {
    testMode: true,
    url,
    anonKey,
    serviceRoleKey,
    payuMerchantKey,
    payuMerchantSalt,
    appUrl,
  };
}
