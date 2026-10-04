"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { favoriteListingAction, unfavoriteListingAction } from "@/app/actions/favorites";

export function FavoriteButton({ listingId, isFavorite, authenticated, loginHref = "/favorites" }: {
  listingId: string;
  isFavorite: boolean;
  authenticated: boolean;
  loginHref?: string;
}) {
  const [saved, setSaved] = useState(isFavorite);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  if (!authenticated) {
    return <Link href={`/login?next=${encodeURIComponent(loginHref)}`} aria-label="Sign in to add to favorites" title="Sign in to add to favorites"
      className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Heart className="size-5" aria-hidden="true" />
    </Link>;
  }
  const label = saved ? "Remove from favorites" : "Add to favorites";
  return <div className="relative">
    <button type="button" disabled={pending} aria-label={pending ? "Updating favorite" : label} aria-pressed={saved} title={label}
      onClick={() => {
        setError("");
        startTransition(async () => {
          const result = saved
            ? await unfavoriteListingAction({ listingId })
            : await favoriteListingAction({ listingId });
          if (result.success) setSaved(!saved);
          else setError(result.error ?? "The favorite could not be updated.");
        });
      }}
      className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60">
      <Heart className={`size-5 ${saved ? "fill-rose-600 text-rose-600" : ""}`} aria-hidden="true" />
      {pending && <span className="sr-only">Updating favorite…</span>}
    </button>
    {error && <span role="alert" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md bg-background p-2 text-xs text-destructive shadow">{error}</span>}
  </div>;
}
