"use client";

import Image from "next/image";
import { ArrowUpRight, Shirt } from "lucide-react";

import { FEATURED_CATEGORIES } from "@/lib/placeholder-data";
import { Badge } from "@/components/ui/badge";

export function CategoryGrid() {
  return (
    <section id="categories" className="py-16 bg-muted/20 border-b border-border/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-widest mb-1">
              <Shirt className="h-3.5 w-3.5" />
              <span>Explore Categories</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Shop by Clothing Style &amp; Vintage Era
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Find unique pre-owned wardrobe staples curated across high-demand clothing categories.
          </p>
        </div>

        {/* Category Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURED_CATEGORIES.map((category) => (
            <div
              key={category.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-md"
            >
              {/* Image Container */}
              <div className="relative aspect-16/10 w-full overflow-hidden bg-muted">
                <Image
                  src={category.imageUrl}
                  alt={category.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Item Count Badge */}
                <div className="absolute top-3 left-3">
                  <Badge variant="secondary" className="backdrop-blur-md bg-background/80 text-[11px]">
                    {category.itemCount.toLocaleString()} items
                  </Badge>
                </div>

                {/* Category Title & Action */}
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold tracking-tight text-white group-hover:text-primary-foreground transition-colors">
                      {category.name}
                    </h3>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-white group-hover:text-black">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-xs text-white/80 line-clamp-1 mt-0.5">
                    {category.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
