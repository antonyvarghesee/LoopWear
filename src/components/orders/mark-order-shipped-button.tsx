"use client";

import { useState, useTransition } from "react";
import { markOrderShippedAction } from "@/app/actions/order-fulfillment";
import { Button } from "@/components/ui/button";

export function MarkOrderShippedButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function markAsShipped() {
    setMessage(null);
    startTransition(async () => {
      const result = await markOrderShippedAction(orderId);
      if (result.success) {
        setMessage({ type: "success", text: "Order marked as shipped." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={pending} onClick={markAsShipped}>
        {pending ? "Updating order..." : "Mark as shipped"}
      </Button>
      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className="text-sm text-muted-foreground">
          {message.text}
        </p>
      )}
    </div>
  );
}
