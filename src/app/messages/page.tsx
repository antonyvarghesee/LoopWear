import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { Avatar } from "@/components/ui/avatar";
import { InboxRealtimeRefresh } from "@/components/messaging/inbox-realtime-refresh";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/services/auth";
import { getConversations } from "@/services/messaging";

export const metadata = { title: "Messages | LoopWear", description: "Your conversations with LoopWear buyers and sellers." };

function timestamp(value: string | null) {
  if (!value) return "No messages yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function MessagesPage() {
  await connection();
  const user = await requireAuth("/messages");
  let conversations;
  try {
    conversations = await getConversations();
  } catch {
    return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6"><h1 className="font-semibold">Messages are temporarily unavailable.</h1><p className="mt-1 text-sm text-muted-foreground">Please refresh the page in a moment.</p></div></main>;
  }

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
    <InboxRealtimeRefresh currentUserId={user.id} />
    <header className="mb-7"><p className="text-sm font-medium text-primary">Your inbox</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Messages</h1><p className="mt-2 text-sm text-muted-foreground">Conversations about LoopWear listings.</p></header>
    {conversations.length === 0 ? <div><EmptyState title="No conversations yet" description="When you message a seller or a buyer asks about your listing, your conversation will appear here."/><p className="mt-4 text-center"><Link href="/browse" className="text-sm font-medium text-primary underline underline-offset-4">Browse listings</Link></p></div> :
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {conversations.map((conversation) => {
          const displayName = conversation.other_full_name || conversation.other_username || "LoopWear member";
          const listingTitle = conversation.listing_title || "Listing no longer available";
          const fallback = (conversation.other_full_name || conversation.other_username || "LW").trim().slice(0, 2).toUpperCase();
          return <li key={conversation.conversation_id}>
            <Link href={`/messages/${conversation.conversation_id}`} className="flex gap-3 p-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:p-4">
              <Avatar src={conversation.other_avatar_url ?? undefined} alt={`${displayName} avatar`} fallback={fallback} size="lg" className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{displayName}</p><p className="truncate text-xs text-muted-foreground">@{conversation.other_username || "member"}</p></div><time className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{timestamp(conversation.last_message_at)}</time></div>
                <p className="mt-2 truncate text-sm text-foreground/80">{conversation.last_message_content || "Start the conversation"}</p>
                <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="truncate">About: {listingTitle}</span>{!conversation.listing_active && conversation.listing_id && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5">Unavailable</span>}</div>
              </div>
              {conversation.listing_image_url && <span className="relative hidden size-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:block"><Image src={conversation.listing_image_url} alt={listingTitle} fill unoptimized sizes="56px" className="object-cover" /></span>}
              {conversation.unread_count > 0 && <span aria-label={`${conversation.unread_count} unread messages`} className="mt-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground">{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</span>}
            </Link>
          </li>;
        })}
      </ul>}
  </main>;
}
