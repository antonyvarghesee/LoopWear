"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Heart, List, LogOut, Menu, MessageCircle, PackageCheck, PlusCircle, UserRound, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

const links = [
  ["#featured", "Browse Listings"],
  ["#categories", "Categories"],
  ["#how-it-works", "How It Works"],
  ["#why-loopwear", "Sustainability"],
] as const;

export function HeaderMobileNav({ authenticated }: { authenticated: boolean }) {
  const [open, setOpen] = React.useState(false);
  return <>
    <button onClick={() => setOpen((value) => !value)} className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
    {open && <div className="absolute inset-x-0 top-full border-b border-border bg-background px-4 py-4 shadow-lg md:hidden">
      <nav className="flex flex-col gap-1">{links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">{label}</Link>)}
        <Link href="/sell" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><PlusCircle className="size-4" />List an item</Link>
        {authenticated && <Link href="/settings/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><UserRound className="size-4" />Account Settings</Link>}
        {authenticated && <Link href="/dashboard/orders" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><PackageCheck className="size-4" />My Orders</Link>}
        {authenticated && <Link href="/dashboard/listings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><List className="size-4" />My Listings</Link>}
        {authenticated && <Link href="/favorites" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Heart className="size-4" />Favorites</Link>}
        {authenticated && <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Bell className="size-4" />Notifications</Link>}
        {authenticated && <Link href="/messages" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><MessageCircle className="size-4" />Messages</Link>}
        {authenticated && <form action={logoutAction} className="mt-1 border-t border-border pt-1"><button type="submit" onClick={() => setOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="size-4" />Log out</button></form>}
      </nav>
    </div>}
  </>;
}
