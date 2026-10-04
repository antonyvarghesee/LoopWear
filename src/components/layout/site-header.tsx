"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ShoppingBag, Menu, X, PlusCircle, User, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/80 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Main Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs transition-transform duration-300 group-hover:scale-105">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                LoopWear
              </span>
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase -mt-1">
                Pre-Owned
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link
              href="#featured"
              className="hover:text-foreground transition-colors"
            >
              Browse Listings
            </Link>
            <Link
              href="#categories"
              className="hover:text-foreground transition-colors"
            >
              Categories
            </Link>
            <Link
              href="#how-it-works"
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              How It Works
            </Link>
            <Link
              href="#why-loopwear"
              className="hover:text-foreground transition-colors"
            >
              Sustainability
            </Link>
          </nav>
        </div>

        {/* Search Bar (Desktop) */}
        <div className="hidden lg:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search jackets, vintage denim, sneakers, coats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 h-9 rounded-full bg-muted/50 text-xs border-border/60 focus-visible:bg-background"
            />
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex rounded-full gap-1.5 text-xs font-semibold"
            onClick={() => alert("Selling flow will be available in Phase 2!")}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            List an Item
          </Button>

          <Button
            variant="default"
            size="sm"
            className="rounded-full gap-1.5 text-xs font-semibold"
            onClick={() => alert("Authentication will be available in Phase 2!")}
          >
            <User className="h-3.5 w-3.5" />
            Sign In
          </Button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex md:hidden items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar (Mobile viewport only) */}
      <div className="flex lg:hidden px-4 pb-3 pt-1 border-t border-border/40 md:border-none">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search pre-owned clothes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-full bg-muted/50 text-xs border-border/60"
          />
        </div>
      </div>

      {/* Mobile Drawer Navigation Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background px-4 pt-2 pb-6 space-y-4 animate-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-3">
            <Link
              href="#featured"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              Browse Listings
            </Link>
            <Link
              href="#categories"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              Categories
            </Link>
            <Link
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="#why-loopwear"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              Sustainability & Protection
            </Link>
          </nav>

          <div className="pt-2 border-t border-border flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-full gap-2 text-xs font-semibold justify-center"
              onClick={() => {
                setMobileMenuOpen(false);
                alert("Selling flow will be available in Phase 2!");
              }}
            >
              <PlusCircle className="h-4 w-4" />
              List an Item for Free
            </Button>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Zero commission listing fees</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
