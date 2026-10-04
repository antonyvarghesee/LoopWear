import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CALLBACK_PATHS = new Set(["/verify-email", "/reset-password"]);
const AUTH_OTP_TYPES = new Set(["signup", "email", "recovery"] as const);

function safeNext(value: string | null) {
  return value && CALLBACK_PATHS.has(value) ? value : "/verify-email";
}

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, redirectBase));
  const failurePath = `${next}?status=error`;
  if ((!code && !tokenHash) || (tokenHash && (!otpType || !AUTH_OTP_TYPES.has(otpType as "signup" | "email" | "recovery")))) {
    return redirectTo(failurePath);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: otpType as "signup" | "email" | "recovery",
        });
    const { error } = result;
    if (error) {
      console.error("Supabase auth callback failed:", error);
      return redirectTo(failurePath);
    }
    return redirectTo(`${next}?status=success`);
  } catch (error) {
    console.error("Auth callback could not be completed:", error);
    return redirectTo(failurePath);
  }
}
