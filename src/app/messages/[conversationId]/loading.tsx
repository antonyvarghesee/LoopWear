import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationLoading() {
  return <main className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-7" aria-label="Loading conversation">
    <div className="mb-3 flex gap-3 rounded-2xl border border-border p-4"><Skeleton className="size-9 rounded-full"/><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3"/><Skeleton className="h-3 w-1/4"/></div></div>
    <Skeleton className="h-[65vh] rounded-2xl"/>
  </main>;
}
