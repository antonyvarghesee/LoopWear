"use client";

import { useState, useTransition } from "react";
import { setUserBlockAction } from "@/app/actions/trust-safety";
import { Button } from "@/components/ui/button";

export function BlockUserButton({
  userId,
  initiallyBlocked,
  label = "Block user",
}: {
  userId: string;
  initiallyBlocked: boolean;
  label?: string;
}) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateBlock(nextBlocked: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setUserBlockAction({ userId, blocked: nextBlocked });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setBlocked(nextBlocked);
      setConfirming(false);
      setMessage(nextBlocked ? "User blocked. You can no longer message each other." : "User unblocked.");
    });
  }

  return (
    <>
      {blocked
        ? <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => updateBlock(false)}>{pending ? "Updating..." : "Unblock"}</Button>
        : <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>{label}</Button>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby={`block-title-${userId}`} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div>
              <h2 id={`block-title-${userId}`} className="font-semibold">Block this user?</h2>
              <p className="mt-1 text-sm text-muted-foreground">You will no longer be able to send messages to each other.</p>
            </div>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={() => updateBlock(true)}>{pending ? "Blocking..." : "Block user"}</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
