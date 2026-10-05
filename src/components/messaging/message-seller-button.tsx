"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { startConversationAction } from "@/app/actions/messaging";
import { Button } from "@/components/ui/button";

export function MessageSellerButton({ listingId, slug, authenticated, isSeller }: {
  listingId: string;
  slug: string;
  authenticated: boolean;
  isSeller: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listingHref = `/listing/${encodeURIComponent(slug)}`;

  if (isSeller) return <p className="mt-3 text-sm text-muted-foreground">This is your listing.</p>;
  if (!authenticated) return <Link href={`/login?next=${encodeURIComponent(listingHref)}`} className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><MessageCircle className="size-4" />Sign in to message seller</Link>;

  function openConversation() {
    setError(null);
    startTransition(async () => {
      const result = await startConversationAction({ listingId });
      if (result.success) router.push(`/messages/${result.conversationId}`);
      else setError(result.error);
    });
  }

  return <div className="mt-3">
    <Button type="button" onClick={openConversation} disabled={pending} className="h-10 rounded-xl">
      <MessageCircle className="mr-2 size-4" />{pending ? "Opening conversation…" : "Message seller"}
    </Button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>;
}
