"use client";

import { useState, useTransition } from "react";
import { createCheckoutSessionAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";

export function BuyNowButton({ listingId }: { listingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startCheckout() {
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutSessionAction(listingId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  }

  return <div className="mt-3">
    <Button type="button" onClick={startCheckout} disabled={pending} className="h-10 rounded-xl">
      {pending ? "Starting checkout..." : "Buy now"}
    </Button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>;
}
