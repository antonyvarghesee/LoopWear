"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { getUnreadNotificationCountAction } from "@/app/actions/notifications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  NOTIFICATION_READ_STATE_CHANGED_EVENT,
  notificationRecipientFilter,
} from "@/lib/notifications/realtime";

export function NotificationUnreadBadge({
  userId,
  initialCount,
}: {
  userId: string;
  initialCount: number;
}) {
  const [authoritativeCount, setAuthoritativeCount] = useState<number | null>(null);
  const count = authoritativeCount ?? initialCount;
  const seenNotificationIds = useRef(new Set<string>());
  const requestGeneration = useRef(0);
  const previousInitialCount = useRef(initialCount);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const reconcileCount = useCallback(async () => {
    const generation = ++requestGeneration.current;
    try {
      const result = await getUnreadNotificationCountAction();
      if (generation === requestGeneration.current && result.success) {
        setAuthoritativeCount(result.count);
      }
    } catch {
      console.error("Unable to reconcile the unread notification count.");
    }
  }, []);

  useLayoutEffect(() => {
    if (previousInitialCount.current === initialCount) return;
    previousInitialCount.current = initialCount;
    void reconcileCount();
  }, [initialCount, reconcileCount]);

  useEffect(() => {
    seenNotificationIds.current.clear();
  }, [userId]);

  useEffect(() => {
    function reconcileReadState(event: Event) {
      const detail = (event as CustomEvent<{ userId?: unknown }>).detail;
      if (detail?.userId !== userId) return;
      void reconcileCount();
      router.refresh();
    }

    window.addEventListener(NOTIFICATION_READ_STATE_CHANGED_EVENT, reconcileReadState);
    return () => window.removeEventListener(NOTIFICATION_READ_STATE_CHANGED_EVENT, reconcileReadState);
  }, [reconcileCount, router, userId]);

  useEffect(() => {
    const filter = notificationRecipientFilter(userId);
    if (!filter) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`notifications-badge:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter,
      }, (payload) => {
        const notification = payload.new as { id?: unknown; user_id?: unknown; is_read?: unknown };
        if (notification.user_id !== userId || typeof notification.id !== "string") return;
        if (seenNotificationIds.current.has(notification.id)) return;
        seenNotificationIds.current.add(notification.id);
        if (notification.is_read === false) void reconcileCount();
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter,
      }, (payload) => {
        const notification = payload.new as { user_id?: unknown };
        if (notification.user_id !== userId) return;
        void reconcileCount();
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 150);
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [reconcileCount, router, userId]);

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Bell className="size-4" aria-hidden="true" />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
