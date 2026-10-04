"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";
import { updateProfileService } from "@/services/profile";

export type FormActionState = {
  status: "error" | "success";
  message: string;
  fieldErrors?: Record<string, string>;
} | null;

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function validationErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return Object.fromEntries(
    error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  );
}

function callbackUrl(path: "verify-email" | "reset-password") {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const callback = new URL("/auth/callback", appUrl);
  callback.searchParams.set("next", `/${path}`);
  return callback.toString();
}

function logRegistrationFailure(context: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    cause?: { name?: unknown; message?: unknown } | null;
  } | null;
  const redact = (rawMessage: string) => rawMessage
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(bearer\s+)[\w.-]+/gi, "$1[redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted-token]")
    .replace(/(password\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(key\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
  const message = redact(typeof candidate?.message === "string" ? candidate.message : String(error));
  const causeMessage = typeof candidate?.cause?.message === "string"
    ? redact(candidate.cause.message)
    : undefined;

  console.error("Registration diagnostic (development only):", {
    context,
    name: typeof candidate?.name === "string" ? candidate.name : "UnknownError",
    code: typeof candidate?.code === "string" ? candidate.code : undefined,
    status: typeof candidate?.status === "number" ? candidate.status : undefined,
    message,
    causeName: typeof candidate?.cause?.name === "string" ? candidate.cause.name : undefined,
    causeMessage,
  });
}

export async function loginAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = loginSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: validationErrors(parsed.error) };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      console.error("Supabase sign-in failed:", error);
      return { status: "error", message: "We couldn't sign you in with those details. Check your email and password and try again." };
    }
  } catch (error) {
    console.error("Sign-in is currently unavailable:", error);
    return { status: "error", message: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  redirect("/settings/profile");
}

export async function registerAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = registerSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword"),
    username: getString(formData, "username"),
    fullName: getString(formData, "fullName"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: validationErrors(parsed.error) };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: existingProfile, error: usernameLookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", parsed.data.username)
      .maybeSingle();
    if (usernameLookupError) {
      // The database trigger creates the profile and handles concurrent
      // username collisions, so this convenience lookup must not block Auth.
      logRegistrationFailure("username preflight lookup", usernameLookupError);
    }
    if (!usernameLookupError && existingProfile) {
      return { status: "error", message: "That username is already in use. Please choose another.", fieldErrors: { username: "That username is already in use." } };
    }
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: callbackUrl("verify-email"),
        data: { username: parsed.data.username, full_name: parsed.data.fullName },
      },
    });
    if (error) {
      logRegistrationFailure("Supabase signUp returned an error", error);
      if (error.code === "23505" || /profiles_username/i.test(error.message)) {
        return { status: "error", message: "That username is already in use. Please choose another.", fieldErrors: { username: "That username is already in use." } };
      }
      return { status: "error", message: "We couldn't create your account. Please check your details and try again." };
    }
  } catch (error) {
    logRegistrationFailure("registration action threw", error);
    return { status: "error", message: "Registration is temporarily unavailable. Please try again shortly." };
  }
  return { status: "success", message: "Your account is ready. Check your email for a verification link before signing in." };
}

export async function forgotPasswordAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: getString(formData, "email") });
  if (!parsed.success) return { status: "error", message: "Please enter a valid email address.", fieldErrors: validationErrors(parsed.error) };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: callbackUrl("reset-password") });
    if (error) {
      console.error("Password reset request failed:", error);
      return { status: "error", message: "We couldn't process that request right now. Please try again shortly." };
    }
    return { status: "success", message: "If an account exists for that email, a password reset link is on its way." };
  } catch (error) {
    console.error("Password reset is currently unavailable:", error);
    return { status: "error", message: "Password reset is temporarily unavailable. Please try again shortly." };
  }
}

export async function resetPasswordAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: validationErrors(parsed.error) };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError?.name === "AuthSessionMissingError" || (!sessionError && !user)) {
      return { status: "error", message: "This reset link is invalid or expired. Request a new one to continue." };
    }
    if (sessionError) {
      console.error("Unable to verify password reset session:", sessionError);
      return { status: "error", message: "Password reset is temporarily unavailable. Please try again shortly." };
    }
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      console.error("Password update failed:", error);
      return { status: "error", message: "We couldn't update your password. Please request a new reset link and try again." };
    }
    return { status: "success", message: "Your password has been updated. You can now sign in with it." };
  } catch (error) {
    console.error("Password update is currently unavailable:", error);
    return { status: "error", message: "Password reset is temporarily unavailable. Please try again shortly." };
  }
}

export async function logoutAction(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("Sign-out failed:", error);
    throw new Error("Unable to sign out. Please try again.");
  }
  redirect("/");
}

export async function updateProfileAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  try {
    const result = await updateProfileService({
      username: getString(formData, "username"),
      fullName: getString(formData, "fullName"),
      bio: getString(formData, "bio"),
      location: getString(formData, "location"),
    });
    if (!result.success) {
      return { status: "error", message: result.error, ...(result.field ? { fieldErrors: { [result.field]: result.error } } : {}) };
    }
    return { status: "success", message: "Your profile has been saved." };
  } catch (error) {
    console.error("Profile update is currently unavailable:", error);
    return { status: "error", message: "We couldn't save your profile right now. Please try again." };
  }
}
