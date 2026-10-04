"use client";

import Link from "next/link";
import { ArrowRight, PlusCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="py-16 bg-muted/40 border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 sm:p-12 lg:p-16 shadow-xl">
          {/* Subtle Decorative Pattern */}
          <div className="absolute top-0 right-0 -z-0 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 -z-0 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

          <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-medium text-primary-foreground backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Join the Circular Fashion Loop</span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl text-balance">
              Ready to refresh your wardrobe or clear your closet?
            </h2>

            <p className="text-sm sm:text-base text-primary-foreground/80 leading-relaxed text-balance">
              Whether you&apos;re hunting for authentic vintage grail items or turning unworn clothes into cash, LoopWear makes peer-to-peer fashion buying and selling seamless.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link href="#featured">
                <Button
                  size="lg"
                  variant="secondary"
                  className="rounded-full px-8 gap-2 font-semibold text-sm shadow-md w-full sm:w-auto"
                >
                  Explore All Listings
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-8 gap-2 font-semibold text-sm border-white/30 text-white hover:bg-white/10 w-full sm:w-auto"
                onClick={() => alert("Selling flow will be enabled in Phase 2!")}
              >
                <PlusCircle className="h-4 w-4" />
                List Your First Item
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
