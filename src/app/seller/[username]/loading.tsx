import { Skeleton } from "@/components/ui/skeleton";

export default function SellerProfileLoading() {
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-9 flex flex-col gap-5 rounded-2xl border border-border p-5 sm:flex-row sm:items-center sm:p-8"><Skeleton className="size-20 rounded-full sm:size-24"/><div className="flex-1 space-y-3"><Skeleton className="h-4 w-36"/><Skeleton className="h-8 w-64 max-w-full"/><Skeleton className="h-4 w-48"/><Skeleton className="h-4 w-full max-w-xl"/></div><Skeleton className="h-12 w-36 rounded-xl"/></div>
    <Skeleton className="mb-5 h-7 w-48"/><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="space-y-2"><Skeleton className="aspect-[4/5] rounded-xl"/><Skeleton className="h-4 w-3/4"/><Skeleton className="h-4 w-1/2"/></div>)}</div>
  </main>;
}
