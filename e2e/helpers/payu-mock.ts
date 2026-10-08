import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { validateE2EEnvironment } from "./e2e-env";

/**
 * Computes a valid PayU SHA-512 response hash matching the application's verification algorithm:
 * sha512(additionalCharges|merchantSalt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export function computePayUResponseHash(
  fields: {
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    status: string;
    udf1: string;
    udf2: string;
    udf3: string;
    udf4: string;
    udf5: string;
  },
  merchantSalt: string,
  additionalCharges = ""
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

/**
 * Sets up Playwright page route interception for the external PayU checkout endpoint.
 * When the browser submits the PayU checkout form to PayU, this interceptor generates
 * a cryptographically signed PayU success response and auto-submits it back to the app's
 * `/payment/return/success` endpoint.
 */
export async function setupPayUMockBoundary(page: Page): Promise<void> {
  const env = validateE2EEnvironment();

  await page.route("**/*payu*/**", async (route, request) => {
    // Intercept checkout form submission POST
    if (request.method() === "POST") {
      const postDataStr = request.postData() || "";
      const params = new URLSearchParams(postDataStr);

      const key = params.get("key") || env.payuMerchantKey;
      const txnid = params.get("txnid") || "";
      const amount = params.get("amount") || "";
      const productinfo = params.get("productinfo") || "";
      const firstname = params.get("firstname") || "LoopWear";
      const email = params.get("email") || "";
      const udf1 = params.get("udf1") || ""; // listingId
      const udf2 = params.get("udf2") || ""; // buyerId
      const udf3 = params.get("udf3") || ""; // sellerId
      const udf4 = params.get("udf4") || "";
      const udf5 = params.get("udf5") || "";
      const surl = params.get("surl") || `${env.appUrl}/payment/return/success`;

      const responseFields = {
        key,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        status: "success",
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
      };

      const hash = computePayUResponseHash(responseFields, env.payuMerchantSalt);

      // Return an auto-submitting HTML form that posts the verified PayU response to surl
      const autoSubmitHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PayU Mock Gateway</title>
</head>
<body>
  <p>Processing PayU sandbox transaction...</p>
  <form id="payu_callback_form" action="${surl}" method="POST">
    <input type="hidden" name="key" value="${key}" />
    <input type="hidden" name="txnid" value="${txnid}" />
    <input type="hidden" name="amount" value="${amount}" />
    <input type="hidden" name="productinfo" value="${productinfo}" />
    <input type="hidden" name="firstname" value="${firstname}" />
    <input type="hidden" name="email" value="${email}" />
    <input type="hidden" name="status" value="success" />
    <input type="hidden" name="udf1" value="${udf1}" />
    <input type="hidden" name="udf2" value="${udf2}" />
    <input type="hidden" name="udf3" value="${udf3}" />
    <input type="hidden" name="udf4" value="${udf4}" />
    <input type="hidden" name="udf5" value="${udf5}" />
    <input type="hidden" name="hash" value="${hash}" />
  </form>
  <script>
    document.getElementById('payu_callback_form').submit();
  </script>
</body>
</html>`;

      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: autoSubmitHtml,
      });
      return;
    }

    await route.continue();
  });
}
