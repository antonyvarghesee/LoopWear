import { Skeleton } from "@/components/ui/skeleton";

export default function FavoritesLoading() {
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><Skeleton className="mb-3 h-9 w-64"/><Skeleton className="mb-8 h-5 w-80 max-w-full"/><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="space-y-2"><Skeleton className="aspect-[4/5] rounded-xl"/><Skeleton className="h-4 w-3/4"/><Skeleton className="h-4 w-1/2"/></div>)}</div></main>;
}
