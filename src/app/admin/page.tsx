import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminModerationConsole } from "@/components/admin/admin-moderation-console";
import {
  getAdminListingModeration,
  getAdminModerationEvents,
  getAdminUserModeration,
} from "@/services/admin-console";
import { requireAdmin } from "@/services/admin-auth";
import { getAdminReports } from "@/services/admin-reports";

export const metadata: Metadata = { title: "Admin moderation" };

type AdminSearchParams = {
  status?: string | string[];
  targetType?: string | string[];
  offset?: string | string[];
  listingId?: string | string[];
  userId?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOffset(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 0;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset)) return 0;
  return Math.min(Math.floor(offset / 50) * 50, 10000);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await connection();
  const admin = await requireAdmin();
  const params = await searchParams;
  const rawStatus = first(params.status);
  const rawTargetType = first(params.targetType);
  const status = rawStatus && ["pending", "reviewed", "resolved", "dismissed"].some((value) => value === rawStatus) ? rawStatus : "";
  const targetType = rawTargetType && ["user", "listing", "conversation", "message"].some((value) => value === rawTargetType) ? rawTargetType : "";
  const offset = parseOffset(first(params.offset));
  const listingId = first(params.listingId);
  const userId = first(params.userId);

  const [reportsResult, eventsResult, listingLookup, userLookup] = await Promise.all([
    getAdminReports({
      ...(status ? { status } : {}),
      ...(targetType ? { targetType } : {}),
      limit: 50,
      offset,
    }).then((reports) => ({ reports, error: null as string | null }))
      .catch(() => ({ reports: [], error: "Reports are temporarily unavailable." })),
    getAdminModerationEvents()
      .then((events) => ({ events, error: null as string | null }))
      .catch(() => ({ events: [], error: "Moderation history is temporarily unavailable." })),
    listingId ? getAdminListingModeration(listingId) : Promise.resolve(null),
    userId ? getAdminUserModeration(userId) : Promise.resolve(null),
  ]);

  return (
    <AdminModerationConsole
      key={admin.id}
      reports={reportsResult.reports}
      reportsError={reportsResult.error}
      events={eventsResult.events}
      historyError={eventsResult.error}
      status={status}
      targetType={targetType}
      offset={offset}
      hasMoreReports={reportsResult.reports.length === 50}
      listingLookup={listingLookup}
      userLookup={userLookup}
    />
  );
}
