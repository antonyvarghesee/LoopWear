"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moderateListingAction, moderateReportAction, moderateUserAction } from "@/app/actions/admin-moderation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminReport } from "@/services/admin-reports";
import type {
  AdminConsoleLookup,
  AdminListingModerationRecord,
  AdminModerationEvent,
  AdminUserModerationRecord,
} from "@/services/admin-console";

type ReportAction = "reviewed" | "resolved" | "dismissed";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function ReportActions({ report }: { report: AdminReport }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const inFlight = useRef(false);
  const actions: ReportAction[] = report.status === "pending"
    ? ["reviewed", "resolved", "dismissed"]
    : report.status === "reviewed"
      ? ["resolved", "dismissed"]
      : [];

  function submit(action: ReportAction) {
    if (inFlight.current || ((action === "resolved" || action === "dismissed") && note.length > 2000)) return;
    inFlight.current = true;
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await moderateReportAction({
          reportId: report.id,
          action,
          ...(action === "reviewed" ? {} : { resolutionNote: note }),
        });
        if (!result.success) {
          setFeedback({ error: result.error });
          return;
        }
        setFeedback({ success: `Report marked ${action}.` });
        router.refresh();
      } catch {
        setFeedback({ error: "The report could not be updated. Please try again." });
      } finally {
        inFlight.current = false;
      }
    });
  }

  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">This report is closed. No further status changes are available.</p>;
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <label className="block text-sm font-medium" htmlFor={`report-note-${report.id}`}>
        Resolution note <span className="font-normal text-muted-foreground">(optional, up to 2000 characters)</span>
      </label>
      <Textarea
        id={`report-note-${report.id}`}
        value={note}
        maxLength={2000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add a concise moderation note for resolving or dismissing."
      />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            variant={action === "dismissed" ? "outline" : action === "resolved" ? "default" : "secondary"}
            disabled={pending || ((action === "resolved" || action === "dismissed") && note.length > 2000)}
            onClick={() => submit(action)}
          >
            {pending ? "Saving..." : action === "reviewed" ? "Mark reviewed" : action === "resolved" ? "Resolve" : "Dismiss"}
          </Button>
        ))}
      </div>
      {feedback.error && <p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
      {feedback.success && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{feedback.success}</p>}
    </div>
  );
}

function ListingModerationAction({ listing }: { listing: AdminListingModerationRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const inFlight = useRef(false);
  const nextState = listing.moderationState === "hidden" ? "clear" : "hidden";

  function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await moderateListingAction({
          listingId: listing.id,
          state: nextState,
          note,
        });
        if (!result.success) {
          setFeedback({ error: result.error });
          return;
        }
        setFeedback({ success: nextState === "hidden" ? "Listing hidden from marketplace visibility." : "Listing moderation cleared." });
        router.refresh();
      } catch {
        setFeedback({ error: "The listing moderation state could not be updated. Please try again." });
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <label className="block text-sm font-medium" htmlFor={`listing-note-${listing.id}`}>
        Moderation note <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Textarea id={`listing-note-${listing.id}`} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
      <Button type="button" variant={nextState === "hidden" ? "destructive" : "outline"} disabled={pending} onClick={submit}>
        {pending ? "Saving..." : nextState === "hidden" ? "Hide listing" : "Clear moderation hide"}
      </Button>
      {feedback.error && <p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
      {feedback.success && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{feedback.success}</p>}
    </div>
  );
}

function UserModerationAction({ user }: { user: AdminUserModerationRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const inFlight = useRef(false);
  const nextState = user.moderationState === "suspended" ? "normal" : "suspended";

  function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await moderateUserAction({ userId: user.id, state: nextState, note });
        if (!result.success) {
          setFeedback({ error: result.error });
          return;
        }
        setFeedback({ success: nextState === "suspended" ? "Account moderation state set to suspended." : "Account moderation state restored to normal." });
        router.refresh();
      } catch {
        setFeedback({ error: "The account moderation state could not be updated. Please try again." });
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <label className="block text-sm font-medium" htmlFor={`user-note-${user.id}`}>
        Moderation note <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Textarea id={`user-note-${user.id}`} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
      <Button type="button" variant={nextState === "suspended" ? "destructive" : "outline"} disabled={pending} onClick={submit}>
        {pending ? "Saving..." : nextState === "suspended" ? "Suspend user" : "Restore user"}
      </Button>
      {feedback.error && <p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
      {feedback.success && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{feedback.success}</p>}
    </div>
  );
}

function LookupStatus<T>({ result, children }: {
  result: AdminConsoleLookup<T>;
  children: (record: T) => React.ReactNode;
}) {
  if (result.status === "not-found") return <p role="status" className="text-sm text-muted-foreground">No matching record was found.</p>;
  if (result.status === "unavailable") return <p role="alert" className="text-sm text-destructive">This moderation record is temporarily unavailable.</p>;
  return <>{children(result.record)}</>;
}

function ReportQueue({ reports, status, targetType, offset, hasMore, error }: {
  reports: AdminReport[];
  status: string;
  targetType: string;
  offset: number;
  hasMore: boolean;
  error: string | null;
}) {
  const previousHref = `/admin?${new URLSearchParams({
    ...(status ? { status } : {}),
    ...(targetType ? { targetType } : {}),
    offset: String(Math.max(0, offset - 50)),
  })}#reports`;
  const nextHref = `/admin?${new URLSearchParams({
    ...(status ? { status } : {}),
    ...(targetType ? { targetType } : {}),
    offset: String(Math.min(10000, offset + 50)),
  })}#reports`;
  return (
    <section id="reports" className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review submitted reports without opening private conversations or message history.</p>
      </div>
      <form action="/admin#reports" method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-1 text-sm font-medium">
          Status
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {["pending", "reviewed", "resolved", "dismissed"].map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Target type
          <Select name="targetType" defaultValue={targetType}>
            <option value="">All target types</option>
            {["user", "listing", "conversation", "message"].map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="outline">Apply filters</Button>
      </form>
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</p>
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No reports match these filters.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <details key={report.id} className="group rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <span className="font-medium">{report.reason}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{report.status}</Badge>
                  <Badge variant="secondary">{report.target_type}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(report.created_at)}</span>
                </div>
              </summary>
              <div className="space-y-4 border-t border-border p-4 sm:p-5">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Report reference</dt><dd className="break-all font-mono text-xs">{report.id}</dd></div>
                  <div><dt className="text-muted-foreground">Reporter reference</dt><dd className="break-all font-mono text-xs">{report.reporter_id}</dd></div>
                  <div><dt className="text-muted-foreground">Target reference</dt><dd className="break-all font-mono text-xs">{report.target_id}</dd></div>
                  <div><dt className="text-muted-foreground">Updated</dt><dd>{formatDate(report.updated_at)}</dd></div>
                </dl>
                {report.description && <div><h3 className="text-sm font-medium">Submitted report content</h3><p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{report.description}</p></div>}
                {report.resolution_note && <div><h3 className="text-sm font-medium">Resolution note</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{report.resolution_note}</p></div>}
                {(report.target_type === "listing" || report.target_type === "user") && (
                  <div className="flex flex-wrap gap-2">
                    {report.target_type === "listing" && <a className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin?listingId=${encodeURIComponent(report.target_id)}#listing-moderation`}>Open listing moderation</a>}
                    {report.target_type === "user" && <a className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin?userId=${encodeURIComponent(report.target_id)}#user-moderation`}>Open user moderation</a>}
                  </div>
                )}
                <ReportActions report={report} />
              </div>
            </details>
          ))}
        </div>
      )}
      {!error && (offset > 0 || (hasMore && offset < 10000)) && (
        <nav aria-label="Report pages" className="flex justify-between">
          {offset > 0 ? <a className={buttonVariants({ variant: "outline" })} href={previousHref}>Previous reports</a> : <span />}
          {hasMore && offset < 10000 && <a className={buttonVariants({ variant: "outline" })} href={nextHref}>Next reports</a>}
        </nav>
      )}
    </section>
  );
}

function ListingModeration({ result }: { result: AdminConsoleLookup<AdminListingModerationRecord> | null }) {
  return (
    <section id="listing-moderation" className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Listing moderation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Moderation visibility is separate from seller lifecycle status.</p>
      </div>
      <form action="/admin#listing-moderation" method="get" className="flex flex-col gap-3 sm:flex-row">
        <Input name="listingId" defaultValue={result?.status === "found" ? result.record.id : ""} placeholder="Listing UUID" aria-label="Listing UUID" />
        <Button type="submit" variant="outline">Look up listing</Button>
      </form>
      {result && <LookupStatus result={result}>{(listing) => (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2"><CardTitle>{listing.title}</CardTitle><Badge variant={listing.moderationState === "hidden" ? "destructive" : "secondary"}>{listing.moderationState === "hidden" ? "HIDDEN" : "CLEAR"}</Badge></div>
            <CardDescription>Moderation state; does not change listing lifecycle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Listing reference</dt><dd className="break-all font-mono text-xs">{listing.id}</dd></div>
              <div><dt className="text-muted-foreground">Seller reference</dt><dd className="break-all font-mono text-xs">{listing.sellerUsername ? `@${listing.sellerUsername}` : listing.sellerId}</dd></div>
              <div><dt className="text-muted-foreground">Lifecycle status</dt><dd><Badge variant="outline">{listing.status}</Badge></dd></div>
            </dl>
            {listing.slug && listing.status === "ACTIVE" && <a className="text-sm text-primary underline-offset-4 hover:underline" href={`/listing/${encodeURIComponent(listing.slug)}`}>View public listing</a>}
            <ListingModerationAction listing={listing} />
          </CardContent>
        </Card>
      )}</LookupStatus>}
    </section>
  );
}

function UserModeration({ result }: { result: AdminConsoleLookup<AdminUserModerationRecord> | null }) {
  return (
    <section id="user-moderation" className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">User moderation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Account restrictions are separate from profile identity and authentication.</p>
      </div>
      <form action="/admin#user-moderation" method="get" className="flex flex-col gap-3 sm:flex-row">
        <Input name="userId" defaultValue={result?.status === "found" ? result.record.id : ""} placeholder="User UUID" aria-label="User UUID" />
        <Button type="submit" variant="outline">Look up user</Button>
      </form>
      {result && <LookupStatus result={result}>{(user) => (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2"><CardTitle>{user.fullName || (user.username ? `@${user.username}` : "User account")}</CardTitle><Badge variant={user.moderationState === "suspended" ? "destructive" : "secondary"}>{user.moderationState.toUpperCase()}</Badge></div>
            <CardDescription>Moderation status only; no authentication or profile data is changed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">User reference</dt><dd className="break-all font-mono text-xs">{user.id}</dd></div>
              {user.username && <div><dt className="text-muted-foreground">Public username</dt><dd><a className="text-primary underline-offset-4 hover:underline" href={`/seller/${encodeURIComponent(user.username)}`}>@{user.username}</a></dd></div>}
              <div><dt className="text-muted-foreground">Moderation state updated</dt><dd>{formatDate(user.updatedAt)}</dd></div>
            </dl>
            <UserModerationAction user={user} />
          </CardContent>
        </Card>
      )}</LookupStatus>}
    </section>
  );
}

function ModerationHistory({ events, error }: { events: AdminModerationEvent[]; error: string | null }) {
  return (
    <section id="moderation-history" className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Moderation history</h2>
        <p className="mt-1 text-sm text-muted-foreground">Read-only record of the latest administrative moderation events.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</p>
      ) : events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No moderation events have been recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Subject</th><th className="p-3">Action</th><th className="p-3">Note / report</th></tr></thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="p-3">{formatDate(event.created_at)}</td>
                  <td className="p-3 break-all font-mono text-xs">Admin · {event.actor_id}</td>
                  <td className="p-3"><span className="capitalize">{event.subject_type}</span><span className="block break-all font-mono text-xs text-muted-foreground">{event.subject_id}</span></td>
                  <td className="p-3">{event.action.replaceAll("_", " ")}</td>
                  <td className="max-w-xs p-3"><span className="whitespace-pre-wrap">{event.note || "—"}</span>{event.report_id && <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">Report {event.report_id}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminModerationConsole({
  reports,
  reportsError,
  events,
  historyError,
  status,
  targetType,
  offset,
  hasMoreReports,
  listingLookup,
  userLookup,
}: {
  reports: AdminReport[];
  reportsError: string | null;
  events: AdminModerationEvent[];
  historyError: string | null;
  status: string;
  targetType: string;
  offset: number;
  hasMoreReports: boolean;
  listingLookup: AdminConsoleLookup<AdminListingModerationRecord> | null;
  userLookup: AdminConsoleLookup<AdminUserModerationRecord> | null;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-sm font-medium text-primary">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Admin moderation</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Review reports, apply narrowly scoped account or listing moderation, and inspect the append-only moderation history.</p>
      </header>
      <nav aria-label="Admin moderation sections" className="flex flex-wrap gap-2 border-b border-border pb-4">
        {[["Reports", "#reports"], ["Listings", "#listing-moderation"], ["Users", "#user-moderation"], ["Moderation history", "#moderation-history"]].map(([label, href]) => (
          <a key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted">{label}</a>
        ))}
      </nav>
      <ReportQueue reports={reports} status={status} targetType={targetType} offset={offset} hasMore={hasMoreReports} error={reportsError} />
      <ListingModeration result={listingLookup} />
      <UserModeration result={userLookup} />
      <ModerationHistory events={events} error={historyError} />
    </main>
  );
}
