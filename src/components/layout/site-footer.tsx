"use client";

import * as React from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight, ShieldCheck, Heart, Leaf } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SiteFooter() {
  const [email, setEmail] = React.useState("");
  const [subscribed, setSubscribed] = React.useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setSubscribed(true);
    setEmail("");
  };

  return (
    <footer className="w-full border-t border-border/80 bg-card text-card-foreground mt-auto">
      {/* Top Banner Section */}
      <div className="border-b border-border/60 bg-muted/40 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">100% Sustainable</h4>
                <p className="text-xs text-muted-foreground">
                  Diverting textile waste by keeping quality fashion in circulation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Buyer & Seller Trust</h4>
                <p className="text-xs text-muted-foreground">
                  Verified profiles, condition grading, and safe transaction holds.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Heart className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Zero Listing Fees</h4>
                <p className="text-xs text-muted-foreground">
                  Sellers keep maximum value from every item sold in the loop.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">
                LoopWear
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-sm">
              The modern peer-to-peer marketplace for pre-owned clothing. Buy vintage, streetwear, denim, and designer fashion directly from closets nationwide.
            </p>

            {/* Newsletter */}
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
                Join the Loop Newsletter
              </p>
              {subscribed ? (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  Thanks for subscribing! You&apos;ll receive curated vintage drops weekly.
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex gap-2 max-w-sm">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                  <Button type="submit" size="sm" className="h-9 rounded-lg gap-1 text-xs shrink-0">
                    Subscribe
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </form>
              )}
            </div>
          </div>

          {/* Nav Col 1 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Categories</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <Link href="#categories" className="hover:text-foreground transition-colors">
                  Outerwear & Jackets
                </Link>
              </li>
              <li>
                <Link href="#categories" className="hover:text-foreground transition-colors">
                  Vintage & Retro
                </Link>
              </li>
              <li>
                <Link href="#categories" className="hover:text-foreground transition-colors">
                  Streetwear
                </Link>
              </li>
              <li>
                <Link href="#categories" className="hover:text-foreground transition-colors">
                  Denim & Jeans
                </Link>
              </li>
              <li>
                <Link href="#categories" className="hover:text-foreground transition-colors">
                  Knitwear & Sweaters
                </Link>
              </li>
              <li>
                <Link href="#categories" className="hover:text-foreground transition-colors">
                  Footwear & Sneakers
                </Link>
              </li>
            </ul>
          </div>

          {/* Nav Col 2 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Marketplace</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <Link href="#featured" className="hover:text-foreground transition-colors">
                  Featured Drops
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-foreground transition-colors">
                  How to Sell Clothes
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-foreground transition-colors">
                  Buyer Protection Policy
                </Link>
              </li>
              <li>
                <Link href="#why-loopwear" className="hover:text-foreground transition-colors">
                  Condition Guide
                </Link>
              </li>
              <li>
                <Link href="#why-loopwear" className="hover:text-foreground transition-colors">
                  Sustainability Impact
                </Link>
              </li>
            </ul>
          </div>

          {/* Nav Col 3 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Platform</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <span className="hover:text-foreground cursor-pointer" onClick={() => alert("Scaffold mode — full features ship in Phase 1-8.")}>
                  About LoopWear
                </span>
              </li>
              <li>
                <span className="hover:text-foreground cursor-pointer" onClick={() => alert("Scaffold mode — full features ship in Phase 1-8.")}>
                  Community Rules
                </span>
              </li>
              <li>
                <span className="hover:text-foreground cursor-pointer" onClick={() => alert("Scaffold mode — full features ship in Phase 1-8.")}>
                  Help & FAQs
                </span>
              </li>
              <li>
                <span className="hover:text-foreground cursor-pointer" onClick={() => alert("Scaffold mode — full features ship in Phase 1-8.")}>
                  Privacy Policy
                </span>
              </li>
              <li>
                <span className="hover:text-foreground cursor-pointer" onClick={() => alert("Scaffold mode — full features ship in Phase 1-8.")}>
                  Terms of Service
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between border-t border-border/60 pt-8 sm:flex-row gap-4">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            &copy; {new Date().getFullYear()} LoopWear. Give clothes another loop. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Peer-to-Peer Marketplace</span>
            <span>&bull;</span>
            <span>Free Tier Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
