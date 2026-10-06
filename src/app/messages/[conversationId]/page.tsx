import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Avatar } from "@/components/ui/avatar";
import { ChatThread } from "@/components/messaging/chat-thread";
import { requireAuth } from "@/services/auth";
import { getConversationPage } from "@/services/messaging";
import { getConversationBlockState } from "@/services/trust-safety";
import { ReportButton } from "@/components/trust-safety/report-button";
import { BlockUserButton } from "@/components/trust-safety/block-user-button";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  await connection();
  const { conversationId } = await params;
  await requireAuth(`/messages/${encodeURIComponent(conversationId)}`);
  let page;
  try {
    page = await getConversationPage(conversationId);
  } catch {
    return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6"><h1 className="font-semibold">This conversation is temporarily unavailable.</h1><p className="mt-1 text-sm text-muted-foreground">Please refresh the page in a moment.</p><Link href="/messages" className="mt-4 inline-block text-sm font-medium text-primary underline">Back to messages</Link></div></main>;
  }
  if (!page) notFound();

  const conversation = page.conversation;
  let blockState;
  try {
    blockState = await getConversationBlockState(conversation.conversation_id);
  } catch {
    return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6"><h1 className="font-semibold">Messaging is temporarily unavailable.</h1><p className="mt-1 text-sm text-muted-foreground">Please refresh the page in a moment.</p></div></main>;
  }
  const displayName = conversation.other_full_name || conversation.other_username || "LoopWear member";
  const listingTitle = conversation.listing_title || "Listing no longer available";
  const listingHref = conversation.listing_active && conversation.listing_slug ? `/listing/${encodeURIComponent(conversation.listing_slug)}` : null;

  return <main className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-4xl flex-col px-3 py-4 sm:px-6 sm:py-7">
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <Link href="/messages" aria-label="Back to messages" className="rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">←</Link>
      <Avatar src={conversation.other_avatar_url ?? undefined} alt={`${displayName} avatar`} fallback={(conversation.other_full_name || conversation.other_username || "LW").slice(0, 2).toUpperCase()} size="md" />
      <div className="min-w-0 flex-1"><h1 className="truncate font-semibold">{displayName}</h1><p className="truncate text-xs text-muted-foreground">@{conversation.other_username || "member"}</p></div>
      {conversation.listing_image_url && <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted"><Image src={conversation.listing_image_url} alt={listingTitle} fill unoptimized sizes="48px" className="object-cover" /></span>}
      <div className="hidden max-w-44 text-right sm:block"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Regarding</p>{listingHref ? <Link href={listingHref} className="line-clamp-2 text-xs font-medium hover:text-primary">{listingTitle}</Link> : <p className="line-clamp-2 text-xs font-medium">{listingTitle}</p>}</div>
      <div className="flex items-center gap-1">
        {blockState.otherUserId && <BlockUserButton userId={blockState.otherUserId} initiallyBlocked={blockState.currentUserBlockedOther} label="Block" />}
        <ReportButton targetType="conversation" targetId={conversation.conversation_id} label="Report chat" />
        {blockState.otherUserId && <ReportButton targetType="user" targetId={blockState.otherUserId} label="Report user" />}
      </div>
    </div>
    {listingHref && <p className="mb-3 truncate px-2 text-xs text-muted-foreground sm:hidden">Regarding: <Link href={listingHref} className="font-medium text-foreground underline underline-offset-2">{listingTitle}</Link></p>}
    <ChatThread conversationId={conversation.conversation_id} currentUserId={page.currentUserId} initialMessages={page.messages.messages} initialOffset={page.messages.nextOffset} initialHasMore={page.messages.hasMore} canSend={blockState.canSend} currentUserBlockedOther={blockState.currentUserBlockedOther} otherBlockedCurrentUser={blockState.otherBlockedCurrentUser} />
  </main>;
}
