import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <main aria-label="Loading moderation console" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
