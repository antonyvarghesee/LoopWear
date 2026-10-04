"use client";

import * as React from "react";
import { Sparkles, Search } from "lucide-react";

import { FEATURED_LISTINGS } from "@/lib/placeholder-data";
import { ListingCard } from "@/components/listings/listing-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export function FeaturedListings() {
  const [selectedCategory, setSelectedCategory] = React.useState<string>("All");
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  const categories = ["All", "Outerwear & Jackets", "Vintage & Retro", "Streetwear", "Denim & Jeans", "Knitwear & Sweaters", "Footwear & Sneakers"];

  const filteredListings = FEATURED_LISTINGS.filter((listing) => {
    const matchesCategory =
      selectedCategory === "All" || listing.category === selectedCategory;
    const matchesSearch =
      listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.condition.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <section id="featured" className="py-16 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-widest mb-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Curated Pre-Loved Drops</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Featured Pre-Owned Clothing
            </h2>
          </div>

          {/* Quick Stats / Filter Indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredListings.length}</span> items showing
            <Badge variant="outline" className="text-[10px]">Static Demo Data</Badge>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box inside featured section */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter featured items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-xs rounded-full bg-muted/40"
            />
          </div>
        </div>

        {/* Listings Grid or Empty State */}
        {filteredListings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matching listings"
            description={`No clothing items found for category "${selectedCategory}" matching "${searchQuery}".`}
            actionLabel="Reset Filters"
            onAction={() => {
              setSelectedCategory("All");
              setSearchQuery("");
            }}
          />
        )}
      </div>
    </section>
  );
}
