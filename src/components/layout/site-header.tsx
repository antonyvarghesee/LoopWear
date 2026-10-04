import Link from "next/link";
import { connection } from "next/server";
import { PlusCircle, Search, ShoppingBag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeaderMobileNav } from "@/components/layout/header-mobile-nav";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentProfile, getCurrentUser } from "@/services/auth";
import { logoutAction } from "@/app/actions/auth";

const navLinks = [
  ["/browse", "Browse Listings"],
  ["#categories", "Categories"],
  ["#how-it-works", "How It Works"],
  ["#why-loopwear", "Sustainability"],
] as const;

export async function SiteHeader() {
  if (isSupabaseConfigured()) await connection();
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;
  const profile = user ? await getCurrentProfile() : null;
  const displayName = profile?.full_name || profile?.username || user?.email || "Account";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="group flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105"><ShoppingBag className="h-5 w-5" /></div>
            <div className="flex flex-col"><span className="text-lg font-bold tracking-tight group-hover:text-primary">LoopWear</span><span className="-mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Pre-Owned</span></div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">{navLinks.map(([href, label]) => <Link key={href} href={href} className="transition-colors hover:text-foreground">{label}</Link>)}</nav>
        </div>
        <form action="/browse" method="get" className="hidden max-w-md flex-1 lg:flex">
          <div className="relative w-full"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" name="q" placeholder="Search pre-owned clothing…" aria-label="Search listings" className="h-9 w-full rounded-full bg-muted/50 pl-9 text-xs" /></div>
        </form>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/sell" className="hidden sm:block"><Button variant="outline" size="sm" className="gap-1.5 rounded-full text-xs font-semibold"><PlusCircle className="h-3.5 w-3.5" />List an Item</Button></Link>
          {user ? <details className="group relative">
            <summary className="flex max-w-40 cursor-pointer list-none items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted" aria-label="Open account menu">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="size-3.5" /></span><span className="truncate">{displayName}</span>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-border bg-background p-2 shadow-lg">
              <Link href="/settings/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">Profile / Settings</Link>
              <Link href="/favorites" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">Favorites</Link>
              <form action={logoutAction}><button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Log out</button></form>
            </div>
          </details> : <div className="flex items-center gap-2">
            <Link href="/login"><Button variant="ghost" size="sm" className="rounded-full text-xs font-semibold">Sign in</Button></Link>
            <Link href="/register"><Button size="sm" className="rounded-full text-xs font-semibold">Register</Button></Link>
          </div>}
          <HeaderMobileNav authenticated={Boolean(user)} />
        </div>
      </div>
      <form action="/browse" method="get" className="border-t border-border/40 px-4 pb-3 pt-1 lg:hidden">
        <div className="relative mx-auto max-w-7xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" name="q" placeholder="Search pre-owned clothing…" aria-label="Search listings" className="h-9 w-full rounded-full bg-muted/50 pl-9 text-xs" /></div>
      </form>
    </header>
  );
}
