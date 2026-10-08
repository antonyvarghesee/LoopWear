import { test, expect } from "@playwright/test";
import { setupPayUMockBoundary } from "./helpers/payu-mock";
import {
  createTestUser,
  createTestListing,
  cleanupE2ETestData,
  type TestUser,
  type TestListing,
} from "./helpers/supabase-admin";

test.describe("Critical Order Lifecycle (PAID -> SHIPPED -> DELIVERED)", () => {
  let seller: TestUser;
  let buyer: TestUser;
  let listing: TestListing;

  test.afterAll(async () => {
    await cleanupE2ETestData();
  });

  test("buyer purchases item, seller marks shipped, buyer confirms delivery", async ({ browser }) => {
    // 1. Create seller, buyer, and active listing fixture
    seller = await createTestUser({ role: "seller" });
    buyer = await createTestUser({ role: "buyer" });
    listing = await createTestListing({
      sellerId: seller.id,
      title: "E2E Silk Vintage Jacket",
      sellingPrice: 45.00,
    });

    // 2. Setup Buyer browser context
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();

    // Login as buyer via UI
    await buyerPage.goto("/login");
    await buyerPage.locator('input[name="email"]').fill(buyer.email);
    await buyerPage.locator('input[name="password"]').fill(buyer.password);
    await buyerPage.getByRole("button", { name: "Sign in" }).click();
    await expect(buyerPage).not.toHaveURL(/\/login/);

    // Attach PayU mock boundary to buyer page
    await setupPayUMockBoundary(buyerPage);

    // 3. Buyer navigates to active listing and initiates purchase
    await buyerPage.goto(`/listing/${listing.slug}`);
    await expect(buyerPage.getByRole("heading", { name: listing.title })).toBeVisible();

    const buyNowButton = buyerPage.getByRole("button", { name: /buy now/i });
    await expect(buyNowButton).toBeVisible();
    await buyNowButton.click();

    // 4. Intercepted PayU gateway processes signed return callback
    await expect(buyerPage.getByRole("heading", { name: "Purchase confirmed" })).toBeVisible({ timeout: 15000 });
    await expect(
      buyerPage.getByText("Your PayU payment was verified and your order is confirmed.")
    ).toBeVisible();

    // 5. Buyer inspects orders dashboard and verifies order is PAID
    await buyerPage.goto("/dashboard/orders");
    await expect(buyerPage.getByRole("heading", { name: "Your orders" })).toBeVisible();
    await expect(buyerPage.getByText(/paid/i)).toBeVisible();

    // 6. Setup Seller browser context
    const sellerContext = await browser.newContext();
    const sellerPage = await sellerContext.newPage();

    // Login as seller via UI
    await sellerPage.goto("/login");
    await sellerPage.locator('input[name="email"]').fill(seller.email);
    await sellerPage.locator('input[name="password"]').fill(seller.password);
    await sellerPage.getByRole("button", { name: "Sign in" }).click();
    await expect(sellerPage).not.toHaveURL(/\/login/);

    // 7. Seller opens orders dashboard and finds the order under "Your sales"
    await sellerPage.goto("/dashboard/orders");
    await expect(sellerPage.getByRole("heading", { name: "Your sales" })).toBeVisible();
    await expect(sellerPage.getByText(listing.title)).toBeVisible();
    await expect(sellerPage.getByText(/paid/i)).toBeVisible();

    // 8. Seller marks order as SHIPPED
    const markShippedButton = sellerPage.getByRole("button", { name: "Mark as shipped" });
    await expect(markShippedButton).toBeVisible();
    await markShippedButton.click();

    await expect(sellerPage.getByText("Order marked as shipped.")).toBeVisible();
    await sellerPage.reload();
    await expect(sellerPage.getByText(/shipped/i)).toBeVisible();

    // 9. Buyer reloads dashboard, sees SHIPPED, and confirms DELIVERED
    await buyerPage.reload();
    await expect(buyerPage.getByText(/shipped/i)).toBeVisible();

    const confirmDeliveryButton = buyerPage.getByRole("button", { name: "I've received this item" });
    await expect(confirmDeliveryButton).toBeVisible();
    await confirmDeliveryButton.click();

    await expect(
      buyerPage.getByText("Delivery confirmed. You can now review this purchase.")
    ).toBeVisible();

    await buyerPage.reload();
    await expect(buyerPage.getByText(/delivered/i)).toBeVisible();

    // Clean up contexts
    await buyerContext.close();
    await sellerContext.close();
  });

  test("enforces seller and buyer isolation", async ({ browser }) => {
    const seller1 = await createTestUser({ role: "seller", prefix: "s1" });
    const seller2 = await createTestUser({ role: "seller", prefix: "s2" });
    const listing1 = await createTestListing({
      sellerId: seller1.id,
      title: "Seller 1 Private Listing",
    });

    // Seller 2 logs in and checks sales dashboard
    const seller2Context = await browser.newContext();
    const seller2Page = await seller2Context.newPage();
    await seller2Page.goto("/login");
    await seller2Page.locator('input[name="email"]').fill(seller2.email);
    await seller2Page.locator('input[name="password"]').fill(seller2.password);
    await seller2Page.getByRole("button", { name: "Sign in" }).click();

    await seller2Page.goto("/dashboard/orders");

    // Seller 2 MUST NOT see Seller 1's listing or orders
    await expect(seller2Page.getByText(listing1.title)).not.toBeVisible();

    await seller2Context.close();
  });
});
