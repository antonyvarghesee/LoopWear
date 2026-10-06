"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { initiatePayUPaymentAction } from "@/app/actions/payu";
import type { PayUCheckoutFields } from "@/services/payu";
import { Button } from "@/components/ui/button";

type CheckoutForm = { endpoint: string; fields: PayUCheckoutFields };

export function BuyNowButton({ listingId }: { listingId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [checkout, setCheckout] = useState<CheckoutForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (checkout) formRef.current?.requestSubmit();
  }, [checkout]);

  function startCheckout() {
    setError(null);
    startTransition(async () => {
      const result = await initiatePayUPaymentAction(listingId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCheckout({ endpoint: result.endpoint, fields: result.fields });
    });
  }

  return <div className="mt-3">
    <Button type="button" onClick={startCheckout} disabled={pending} className="h-10 rounded-xl">
      {pending ? "Preparing checkout..." : "Buy now"}
    </Button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {checkout && <form ref={formRef} method="post" action={checkout.endpoint} aria-hidden="true" className="hidden">
      {Object.entries(checkout.fields).map(([name, value]) =>
        <input key={name} type="hidden" name={name} value={value} />,
      )}
    </form>}
  </div>;
}
