"use client";

import { useState, useTransition } from "react";
import { confirmOrderDeliveryAction } from "@/app/actions/order-delivery";
import { Button } from "@/components/ui/button";

export function ConfirmDeliveryButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function confirmDelivery() {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmOrderDeliveryAction(orderId);
      if (result.success) {
        setMessage({ type: "success", text: "Delivery confirmed. You can now review this purchase." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={pending} onClick={confirmDelivery}>
        {pending ? "Confirming delivery..." : "I've received this item"}
      </Button>
      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className="text-sm text-muted-foreground">
          {message.text}
        </p>
      )}
    </div>
  );
}
