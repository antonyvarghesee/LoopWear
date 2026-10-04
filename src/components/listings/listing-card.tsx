"use client";

import * as React from "react";
import Image from "next/image";
import { Heart, ShieldCheck, Star } from "lucide-react";

import type { Listing } from "@/types/listing";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

interface ListingCardProps {
  listing: Listing;
}

export function ListingCard({ listing }: ListingCardProps) {
  const [liked, setLiked] = React.useState(false);
  const [likesCount, setLikesCount] = React.useState(listing.likesCount);

  const toggleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLiked((prev) => !prev);
    setLikesCount((prev) => (liked ? prev - 1 : prev + 1));
  };

  const discount = listing.originalPrice
    ? Math.round(
        ((listing.originalPrice - listing.price) / listing.originalPrice) * 100,
      )
    : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-md">
      {/* Image Container */}
      <div className="relative aspect-4/5 w-full overflow-hidden bg-muted">
        <Image
          src={listing.imageUrl}
          alt={listing.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
          <Badge variant="secondary" className="backdrop-blur-md bg-background/90 text-[11px] font-medium shadow-xs">
            {listing.condition}
          </Badge>
          {listing.tag && (
            <Badge variant="default" className="bg-primary/90 text-primary-foreground text-[11px] font-medium shadow-xs">
              {listing.tag}
            </Badge>
          )}
        </div>

        {/* Like Button */}
        <button
          onClick={toggleLike}
          aria-label={liked ? "Unlike listing" : "Like listing"}
          className={`absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all ${
            liked
              ? "bg-rose-500 text-white shadow-sm"
              : "bg-background/80 text-foreground hover:bg-background hover:scale-110"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
        </button>

        {/* Size tag on bottom right of image */}
        <div className="absolute bottom-3 right-3 z-10 rounded-md bg-background/90 px-2 py-0.5 text-xs font-semibold text-foreground backdrop-blur-md shadow-xs">
          Size {listing.size}
        </div>
      </div>

      {/* Details Container */}
      <div className="flex flex-1 flex-col p-4">
        {/* Brand & Category */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="font-semibold uppercase tracking-wider text-foreground/80">
            {listing.brand}
          </span>
          <span>{listing.category}</span>
        </div>

        {/* Title */}
        <h3 className="line-clamp-1 text-sm font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
          {listing.title}
        </h3>

        {/* Price & Savings */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">
            ${listing.price}
          </span>
          {listing.originalPrice && (
            <span className="text-xs text-muted-foreground line-through">
              ${listing.originalPrice}
            </span>
          )}
          {discount && discount > 0 && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {discount}% off
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="my-3 h-px w-full bg-border/60" />

        {/* Seller Info & Likes */}
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Avatar
              src={listing.seller.avatarUrl}
              alt={listing.seller.name}
              fallback={listing.seller.name.substring(0, 2).toUpperCase()}
              size="sm"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-foreground line-clamp-1">
                  @{listing.seller.username}
                </span>
                {listing.seller.isVerified && (
                  <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                <span>{listing.seller.rating}</span>
                <span>({listing.seller.reviewCount})</span>
              </div>
            </div>
          </div>

          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Heart className={`h-3 w-3 ${liked ? "fill-rose-500 text-rose-500" : ""}`} />
            {likesCount}
          </span>
        </div>
      </div>
    </div>
  );
}
