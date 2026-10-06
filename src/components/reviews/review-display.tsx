import { Star } from "lucide-react";
import type { PublicReview } from "@/services/reviews";

export function ReviewDisplay({
  reviews,
  emptyMessage = "No reviews yet.",
}: {
  reviews: PublicReview[];
  emptyMessage?: string;
}) {
  if (reviews.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review, index) => (
        <li key={`${review.listing_id}-${review.created_at}-${index}`} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1" role="img" aria-label={`${review.rating} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  aria-hidden="true"
                  className={`size-4 ${index < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                />
              ))}
            </div>
            <time className="text-xs text-muted-foreground" dateTime={review.created_at}>
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(review.created_at))}
            </time>
          </div>
          {review.comment && <p className="mt-3 whitespace-pre-line text-sm leading-6">{review.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
