import "server-only";
import { verifyPayUResponse } from "@/services/payu-verification";

function returnPage(title: string, message: string): Response {
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <p>LoopWear has not confirmed your order or marked the listing sold.</p>
    </main>
  </body>
</html>`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function getTextFields(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [
      key,
      typeof value === "string" ? value : "",
    ]),
  );
}

export async function handlePayUReturn(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return returnPage("Payment verification pending", "Payment status has not been verified yet.");
  }

  try {
    const formData = await request.formData();
    const result = await verifyPayUResponse(getTextFields(formData));
    if (result.status === "success") {
      return returnPage("Payment received — verification pending", "PayU returned a verified payment response.");
    }
    if (result.status === "failure") {
      return returnPage("Payment not completed", "PayU returned a verified unsuccessful payment response.");
    }
    if (result.status === "cancelled") {
      return returnPage("Payment cancelled", "PayU returned a verified cancelled payment response.");
    }
    if (result.status === "duplicate") {
      return returnPage("Payment response already received", "This PayU response has already been processed.");
    }
  } catch {
    console.error("Unable to read PayU return request.");
  }

  return returnPage("Payment verification error", "We could not verify this payment response.");
}
