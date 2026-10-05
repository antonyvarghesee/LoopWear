"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { refreshInboxForIncomingMessage } from "@/lib/messaging/realtime";

export function InboxRealtimeRefresh({ currentUserId }: {
  currentUserId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("inbox")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, (payload) => {
        const message = payload.new as { conversation_id?: unknown; sender_id?: unknown };
        refreshInboxForIncomingMessage(
          { conversation_id: message.conversation_id, sender_id: message.sender_id },
          currentUserId,
          () => router.refresh(),
        );
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, router]);

  return null;
}
