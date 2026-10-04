import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        That page does not exist yet. Return home to continue.
      </p>
      <Link
        href="/"
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        Back to LoopWear
      </Link>
    </main>
  );
}
