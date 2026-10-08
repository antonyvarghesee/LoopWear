import { defineConfig, devices } from "@playwright/test";
import { validateE2EEnvironment } from "./e2e/helpers/e2e-env";

// Enforce E2E environment safety before test runner initialization
const e2eEnv = validateE2EEnvironment();

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: false, // Run sequentially for predictable DB lifecycle assertions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: e2eEnv.appUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: e2eEnv.appUrl,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: e2eEnv.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: e2eEnv.anonKey,
      PAYU_MERCHANT_KEY: e2eEnv.payuMerchantKey,
      PAYU_MERCHANT_SALT: e2eEnv.payuMerchantSalt,
      NEXT_PUBLIC_APP_URL: e2eEnv.appUrl,
    },
  },
});
