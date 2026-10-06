"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, CheckCheck } from "lucide-react";
import type { Notification } from "@/services/notifications";
import {
  NOTIFICATION_READ_STATE_CHANGED_EVENT,
  notificationRealtimeSchema,
  notificationRecipientFilter,
} from "@/lib/notifications/realtime";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { listNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const PAGE_SIZE = 100;

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeHref(value: string | null): string | null {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : null;
}

export function NotificationList({
  userId,
  initialNotifications,
  hasMoreInitially,
}: {
  userId: string;
  initialNotifications: Notification[];
  hasMoreInitially: boolean;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [hasMore, setHasMore] = useState(hasMoreInitially);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  useEffect(() => {
    const filter = notificationRecipientFilter(userId);
    if (!filter) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`notifications-page:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter,
      }, (payload) => {
        const parsed = notificationRealtimeSchema.safeParse(payload.new);
        if (!parsed.success || parsed.data.user_id !== userId) return;
        setNotifications((current) => current.some((item) => item.id === parsed.data.id)
          ? current
          : [parsed.data, ...current].slice(0, PAGE_SIZE));
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter,
      }, (payload) => {
        const parsed = notificationRealtimeSchema.safeParse(payload.new);
        if (!parsed.success || parsed.data.user_id !== userId) return;
        setNotifications((current) => current.map((item) => item.id === parsed.data.id ? parsed.data : item));
      })
      .subscribe((status) => {
        setRealtimeStatus(status === "SUBSCRIBED" ? null : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "Live notification updates are reconnecting." : null);
      });

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  function markRead(notificationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await markNotificationReadAction(notificationId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_STATE_CHANGED_EVENT, { detail: { userId } }));
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.id === notificationId
        ? { ...item, is_read: true, read_at: item.read_at ?? readAt }
        : item));
    });
  }

  function markAllRead() {
    setError(null);
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_STATE_CHANGED_EVENT, { detail: { userId } }));
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.is_read
        ? item
        : { ...item, is_read: true, read_at: readAt }));
    });
  }

  function loadMore() {
    setError(null);
    startTransition(async () => {
      const result = await listNotificationsAction({ limit: PAGE_SIZE, offset: notifications.length });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotifications((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.notifications.filter((item) => !seen.has(item.id))];
      });
      setHasMore(result.notifications.length === PAGE_SIZE);
    });
  }

  if (notifications.length === 0) {
    return <EmptyState title="You're all caught up" description="New messages and important updates will appear here." />;
  }

  return (
    <section aria-label="Notifications">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        {unreadCount > 0 && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={markAllRead}><CheckCheck className="size-4" />Mark all as read</Button>}
      </div>
      {realtimeStatus && <p role="status" className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{realtimeStatus}</p>}
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {notifications.map((notification) => {
          const href = safeHref(notification.link_url);
          return (
            <li key={notification.id} className={`flex items-start gap-3 p-4 sm:p-5 ${notification.is_read ? "" : "bg-primary/[0.035]"}`}>
              <span aria-label={notification.is_read ? "Read" : "Unread"} className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.is_read ? "bg-muted-foreground/30" : "bg-primary"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  {href ? <Link href={href} className="font-semibold hover:text-primary">{notification.title}</Link> : <h2 className="font-semibold">{notification.title}</h2>}
                  <time dateTime={notification.created_at} className="text-xs text-muted-foreground">{formatCreatedAt(notification.created_at)}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{notification.message}</p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{notification.type.replaceAll("_", " ")}</p>
              </div>
              {!notification.is_read && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Mark "${notification.title}" as read`} disabled={pending} onClick={() => markRead(notification.id)}><Check className="size-4" /></Button>}
            </li>
          );
        })}
      </ul>
      {hasMore && <div className="mt-5 text-center"><Button type="button" variant="outline" disabled={pending} onClick={loadMore}>{pending ? "Loading..." : "Load older notifications"}</Button></div>}
    </section>
  );
}
