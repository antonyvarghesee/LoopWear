import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          LoopWear
        </Link>
        <p className="text-sm text-muted-foreground">Coming soon</p>
      </div>
    </header>
  );
}
