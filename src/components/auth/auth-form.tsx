"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  type FormActionState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthFormKind = "login" | "register" | "forgot-password" | "reset-password";

const copy: Record<AuthFormKind, { title: string; description: string; submit: string }> = {
  login: { title: "Welcome back", description: "Sign in to continue your LoopWear journey.", submit: "Sign in" },
  register: { title: "Join LoopWear", description: "Create an account to keep great clothes in circulation.", submit: "Create account" },
  "forgot-password": { title: "Reset your password", description: "We’ll email you a secure link to choose a new password.", submit: "Send reset link" },
  "reset-password": { title: "Choose a new password", description: "Use at least 6 characters for your new password.", submit: "Update password" },
};

function Field({ label, name, type = "text", autoComplete, error, required = true }: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input id={name} name={name} type={type} autoComplete={autoComplete} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} />
      {error && <p id={`${name}-error`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AuthForm({ kind, statusMessage }: { kind: AuthFormKind; statusMessage?: string }) {
  const action = kind === "login" ? loginAction
    : kind === "register" ? registerAction
      : kind === "forgot-password" ? forgotPasswordAction
        : resetPasswordAction;
  const [state, formAction, pending] = useActionState<FormActionState, FormData>(action, null);
  const content = copy[kind];
  const fieldError = (name: string) => state?.fieldErrors?.[name];

  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-7 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">LoopWear account</p>
        <h1 className="text-2xl font-semibold tracking-tight">{content.title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
      </div>
      {statusMessage && <p role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">{statusMessage}</p>}
      <form action={formAction} className="space-y-4" noValidate>
        {kind === "register" && <>
          <Field name="username" label="Username" autoComplete="username" error={fieldError("username")} />
          <Field name="fullName" label="Display name" autoComplete="name" error={fieldError("fullName")} />
        </>}
        {kind === "register" || kind === "login" || kind === "forgot-password" ?
          <Field name="email" label="Email" type="email" autoComplete="email" error={fieldError("email")} /> : null}
        {(kind === "login" || kind === "register" || kind === "reset-password") &&
          <Field name="password" label={kind === "reset-password" ? "New password" : "Password"} type="password" autoComplete={kind === "login" ? "current-password" : "new-password"} error={fieldError("password")} />}
        {(kind === "register" || kind === "reset-password") &&
          <Field name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" error={fieldError("confirmPassword")} />}
        {state?.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" : "rounded-lg border border-emerald-600/25 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"}>
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl">
          {pending ? "Please wait…" : content.submit}
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
        {kind === "login" && <><Link href="/forgot-password" className="hover:text-foreground">Forgot password?</Link><Link href="/register" className="hover:text-foreground">Create an account</Link></>}
        {kind === "register" && <Link href="/login" className="hover:text-foreground">Already have an account? Sign in</Link>}
        {kind === "forgot-password" && <Link href="/login" className="hover:text-foreground">Back to sign in</Link>}
        {kind === "reset-password" && state?.status === "success" && <Link href="/login" className="hover:text-foreground">Go to sign in</Link>}
      </div>
    </section>
  );
}
