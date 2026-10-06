"use client";

import { useActionState } from "react";
import { submitPurchaseReviewAction } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ReviewForm({
  orderId,
  listingTitle,
}: {
  orderId: string;
  listingTitle: string;
}) {
  const [state, formAction, pending] = useActionState(submitPurchaseReviewAction, null);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <div>
        <h3 className="font-medium">{listingTitle}</h3>
        <p className="text-xs text-muted-foreground">Share your experience with this seller.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`review-rating-${orderId}`} className="text-sm font-medium">Rating</label>
        <Select id={`review-rating-${orderId}`} name="rating" required defaultValue="5">
          <option value="5">5 stars — Excellent</option>
          <option value="4">4 stars — Good</option>
          <option value="3">3 stars — Average</option>
          <option value="2">2 stars — Below average</option>
          <option value="1">1 star — Poor</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`review-comment-${orderId}`} className="text-sm font-medium">
          Comment <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`review-comment-${orderId}`}
          name="comment"
          maxLength={1000}
          rows={3}
          placeholder="How was your purchase?"
          aria-describedby={`review-comment-help-${orderId}`}
        />
        <p id={`review-comment-help-${orderId}`} className="text-xs text-muted-foreground">
          Up to 1000 characters.
        </p>
      </div>
      {state && (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error"
          ? "rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          : "rounded-lg border border-emerald-600/25 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"}>
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending || state?.status === "success"}>
        {pending ? "Submitting…" : state?.status === "success" ? "Review submitted" : "Submit review"}
      </Button>
    </form>
  );
}
