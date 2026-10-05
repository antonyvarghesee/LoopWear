import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10" aria-label="Loading conversations">
    <Skeleton className="mb-2 h-8 w-40" /><Skeleton className="mb-7 h-4 w-64" />
    <div className="space-y-1 rounded-2xl border border-border p-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex gap-3 p-3"><Skeleton className="size-12 rounded-full"/><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3"/><Skeleton className="h-3 w-2/3"/><Skeleton className="h-3 w-1/2"/></div></div>)}</div>
  </main>;
}
