import type { Metadata } from "next";
import { connection } from "next/server";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireAuth } from "@/services/auth";
import { listNotifications } from "@/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await connection();
  const user = await requireAuth("/notifications");
  let notifications;
  try {
    notifications = await listNotifications({ limit: 100, offset: 0 });
  } catch {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <h1 className="font-semibold">Notifications are temporarily unavailable.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Please refresh the page in a moment.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-7">
        <p className="text-sm font-medium text-primary">Your account</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-2 text-sm text-muted-foreground">Messages and important updates about your LoopWear activity.</p>
      </header>
      <NotificationList key={user.id} userId={user.id} initialNotifications={notifications} hasMoreInitially={notifications.length === 100} />
    </main>
  );
}
