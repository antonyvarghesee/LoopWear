function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function ListingLoading({ kind }: { kind: "form" | "dashboard" | "detail" }) {
  return <main aria-busy="true" aria-label="Loading listings" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <span className="sr-only">Loading…</span>
    <Skeleton className="h-9 w-64" />
    <Skeleton className="mt-3 h-5 w-96 max-w-full" />
    {kind === "form" && <div className="mt-8 space-y-5">{[0, 1].map((section) => <div key={section} className="rounded-2xl border border-border p-6"><Skeleton className="mb-6 h-6 w-40" /><div className="grid gap-5 sm:grid-cols-2">{Array.from({ length: section ? 3 : 6 }, (_, index) => <Skeleton key={index} className="h-11" />)}</div></div>)}</div>}
    {kind === "dashboard" && <div className="mt-8 space-y-4">{[0, 1, 2].map((card) => <div key={card} className="flex min-h-44 overflow-hidden rounded-2xl border border-border"><Skeleton className="hidden w-44 rounded-none sm:block" /><div className="flex-1 space-y-4 p-6"><Skeleton className="h-5 w-32" /><Skeleton className="h-6 w-72 max-w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-8 w-48" /></div></div>)}</div>}
    {kind === "detail" && <div className="mt-8 grid gap-8 lg:grid-cols-2"><Skeleton className="aspect-square w-full" /><div className="space-y-5"><Skeleton className="h-8 w-40" /><Skeleton className="h-10 w-72 max-w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div></div>}
  </main>;
}
