"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, PlusCircle, Sparkles, ShieldCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-muted/30 via-background to-background py-16 md:py-24 border-b border-border/40">
      {/* Decorative Background Accents */}
      <div className="absolute top-1/4 left-1/2 -z-10 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Text Column */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-xs animate-in fade-in-50">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Peer-to-Peer Clothing Marketplace</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-primary font-semibold">Phase 0 Scaffolding</span>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance leading-[1.1]">
              Give clothes <span className="text-primary underline decoration-primary/30 underline-offset-8">another loop</span>.
            </h1>

            <p className="max-w-2xl text-base sm:text-lg leading-relaxed text-muted-foreground mx-auto lg:mx-0 text-balance">
              LoopWear is the modern, sustainable marketplace to buy and sell pre-owned outerwear, vintage grails, denim, and streetwear directly from curated fashion closets.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
              <Link href="#featured">
                <Button size="lg" className="rounded-full px-7 gap-2 text-sm font-semibold shadow-sm w-full sm:w-auto">
                  Shop Pre-Loved
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full px-7 gap-2 text-sm font-semibold w-full sm:w-auto"
                onClick={() => alert("Selling flow will be enabled in Phase 2!")}
              >
                <PlusCircle className="h-4 w-4 text-primary" />
                Start Selling for Free
              </Button>
            </div>

            {/* Quick Value Badges */}
            <div className="pt-6 grid grid-cols-3 gap-4 border-t border-border/60 max-w-lg mx-auto lg:mx-0 text-left">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>0% Listing Fee</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Keep full selling value</p>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Buyer Safeguard</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Hold until verified</p>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>Curated Style</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Quality graded items</p>
              </div>
            </div>
          </div>

          {/* Right Fashion Imagery Grid */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Main Feature Image Card */}
              <div className="relative aspect-4/5 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl">
                <Image
                  src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80"
                  alt="Pre-owned fashion model lookbook"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-cover"
                />

                {/* Overlaid Floating Badge */}
                <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/20 bg-background/90 p-3.5 backdrop-blur-md shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                        90s
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Vintage Oversized Blazer</p>
                        <p className="text-[10px] text-muted-foreground">Condition: Excellent Pre-Owned</p>
                      </div>
                    </div>
                    <Badge variant="success">$88</Badge>
                  </div>
                </div>
              </div>

              {/* Secondary Floating Fashion Snippet (Top Right Overlay) */}
              <div className="hidden sm:block absolute -top-4 -right-4 w-40 aspect-square overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-lg">
                <div className="relative w-full h-full rounded-lg overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=400&q=80"
                    alt="Vintage leather item detail"
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      Top Rated Seller
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
