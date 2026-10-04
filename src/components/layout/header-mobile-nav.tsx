"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const links = [
  ["#featured", "Browse Listings"],
  ["#categories", "Categories"],
  ["#how-it-works", "How It Works"],
  ["#why-loopwear", "Sustainability"],
] as const;

export function HeaderMobileNav() {
  const [open, setOpen] = React.useState(false);
  return <>
    <button onClick={() => setOpen((value) => !value)} className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
    {open && <div className="absolute inset-x-0 top-full border-b border-border bg-background px-4 py-4 shadow-lg md:hidden">
      <nav className="flex flex-col gap-1">{links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">{label}</Link>)}</nav>
    </div>}
  </>;
}

export function ListItemPlaceholderButton() {
  return <Button variant="outline" size="sm" className="gap-1.5 rounded-full text-xs font-semibold" onClick={() => window.alert("Selling flow will be available in Phase 2!")}>
    <PlusCircle className="h-3.5 w-3.5" />List an Item
  </Button>;
}
