import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import VerifyEmailPage from "@/app/verify-email/page";

describe("VerifyEmailPage", () => {
  it("sends users to the home page after successful verification", async () => {
    const page = await VerifyEmailPage({ searchParams: Promise.resolve({ status: "success" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('href="/"');
  });
});
