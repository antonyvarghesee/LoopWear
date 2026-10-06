import "server-only";

const RETURN_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Payment verification pending</title>
  </head>
  <body>
    <main>
      <h1>Payment verification pending</h1>
      <p>We have returned from PayU. Payment status has not been verified yet.</p>
      <p>Please wait while LoopWear completes payment verification.</p>
    </main>
  </body>
</html>`;

export function handlePayUReturn(): Response {
  return new Response(RETURN_PAGE, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
