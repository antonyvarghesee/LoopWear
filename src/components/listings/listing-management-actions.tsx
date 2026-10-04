"use client";

import Link from "next/link";
import { useActionState } from "react";
import { manageListingAction, type ListingActionState } from "@/app/actions/listings";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ListingStatus } from "@/types/listing-management";

export function ListingManagementActions({ listingId, status }: { listingId: string; status: ListingStatus }) {
  const [state, action, pending] = useActionState<ListingActionState, FormData>(manageListingAction, null);
  if (status === "SOLD" || status === "REMOVED") {
    return <p className="text-xs text-muted-foreground">This listing is read-only.</p>;
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Link href={`/sell/${listingId}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>Edit</Link>
      <form action={action}>
        <input type="hidden" name="id" value={listingId} />
        {status === "DRAFT" && <Button type="submit" name="intent" value="publish" size="sm" disabled={pending}>{pending ? "Working…" : "Publish"}</Button>}
        {(status === "DRAFT" || status === "ACTIVE") && <Button type="submit" name="intent" value="archive" size="sm" variant="secondary" disabled={pending}>{pending ? "Working…" : "Archive"}</Button>}
        <Button type="submit" name="intent" value="remove" size="sm" variant="ghost" disabled={pending}>{pending ? "Working…" : "Remove"}</Button>
      </form>
    </div>
    {state?.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
  </div>;
}
