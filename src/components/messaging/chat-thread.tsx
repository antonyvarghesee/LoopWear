"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { appendUniqueMessage, conversationMessageFilter, realtimeMessageSchema } from "@/lib/messaging/realtime";
import { loadOlderMessagesAction, markConversationReadAction, sendMessageAction } from "@/app/actions/messaging";
import { MESSAGE_MAX_LENGTH } from "@/lib/validations/messaging";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationMessage } from "@/services/messaging";

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function ChatThread({ conversationId, currentUserId, initialMessages, initialOffset, initialHasMore }: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ConversationMessage[];
  initialOffset: number;
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialOffset);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [readPending, startReadTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenMessageIds = useRef(new Set(initialMessages.map((message) => message.id)));
  const canSend = body.trim().length > 0 && body.trim().length <= MESSAGE_MAX_LENGTH && !sending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    let active = true;
    const filter = conversationMessageFilter(conversationId);
    if (!filter) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`conversation:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (payload) => {
        const parsed = realtimeMessageSchema.safeParse(payload.new);
        if (!parsed.success || parsed.data.conversation_id !== conversationId) return;
        const incoming: ConversationMessage = {
          id: parsed.data.id,
          content: parsed.data.content,
          created_at: parsed.data.created_at,
          is_read: parsed.data.is_read,
          is_own: parsed.data.sender_id === currentUserId,
        };
        const viewport = listRef.current;
        const wasNearBottom = !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
        if (!seenMessageIds.current.has(incoming.id)) {
          seenMessageIds.current.add(incoming.id);
          setOffset((currentOffset) => currentOffset + 1);
        }
        setMessages((current) => appendUniqueMessage(current, incoming));
        if (active && wasNearBottom) bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
        if (!incoming.is_own) {
          void markConversationReadAction({ conversationId }).then((result) => {
            if (active && !result.success) setMessageError(result.error);
          });
        }
      })
      .subscribe((status) => {
        if (!active) return;
        setConnectionError(status === "SUBSCRIBED" ? null : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "Live updates are reconnecting. You can keep sending messages." : null);
      });
    startReadTransition(async () => {
      const result = await markConversationReadAction({ conversationId });
      if (active && !result.success) setMessageError(result.error);
    });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    setMessageError(null);
    const result = await sendMessageAction({ conversationId, body });
    if (result.success) {
      if (!seenMessageIds.current.has(result.message.id)) {
        seenMessageIds.current.add(result.message.id);
        setOffset((currentOffset) => currentOffset + 1);
      }
      setMessages((current) => appendUniqueMessage(current, result.message));
      setBody("");
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    } else setMessageError(result.error);
    setSending(false);
  }

  async function loadOlder() {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setMessageError(null);
    const previousHeight = listRef.current?.scrollHeight ?? 0;
    const result = await loadOlderMessagesAction({ conversationId, offset });
    if (result.success) {
      const olderMessages = result.messages.filter((message) => !seenMessageIds.current.has(message.id));
      olderMessages.forEach((message) => seenMessageIds.current.add(message.id));
      setMessages((current) => [...olderMessages, ...current]);
      setOffset((currentOffset) => Math.max(currentOffset, result.nextOffset));
      setHasMore(result.hasMore);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop += listRef.current.scrollHeight - previousHeight;
      });
    } else setMessageError(result.error);
    setLoadingOlder(false);
  }

  return <section className="flex h-[min(72dvh,52rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-label="Conversation messages">
    {connectionError && <p role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-foreground">{connectionError}</p>}
    <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions text">
      {hasMore && <div className="text-center"><Button type="button" variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading…" : "Load older messages"}</Button></div>}
      {messages.length === 0 && <p className="m-auto max-w-sm py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello to start the conversation.</p>}
      {messages.map((message) => <article key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-2.5 sm:max-w-[75%] ${message.is_own ? "ml-auto rounded-br-md bg-primary text-primary-foreground" : "mr-auto rounded-bl-md bg-muted"}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        <time dateTime={message.created_at} className={`mt-1 block text-right text-[10px] ${message.is_own ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{formatTimestamp(message.created_at)}</time>
      </article>)}
      <div ref={bottomRef} />
    </div>
    {messageError && <p role="alert" className="px-4 pb-2 text-sm text-destructive">{messageError}</p>}
    <form onSubmit={submitMessage} className="border-t border-border p-3 sm:p-4">
      <label htmlFor="message-body" className="sr-only">Write a message</label>
      <div className="flex items-end gap-2">
        <Textarea id="message-body" name="body" value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} maxLength={MESSAGE_MAX_LENGTH} rows={2} placeholder="Write a message…" className="min-h-11 resize-none" aria-describedby="message-hint" />
        <Button type="submit" disabled={!canSend || readPending} className="h-11 shrink-0 rounded-xl">{sending ? "Sending…" : "Send"}</Button>
      </div>
      <p id="message-hint" className="mt-1 px-1 text-[11px] text-muted-foreground">{body.length}/{MESSAGE_MAX_LENGTH} characters. Ctrl or ⌘ + Enter to send.</p>
    </form>
  </section>;
}
