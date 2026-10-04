"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ListingGalleryImage = { id: string; url: string };

export function getNextGalleryIndex(currentIndex: number, direction: -1 | 1, imageCount: number) {
  if (imageCount <= 1) return 0;
  return (currentIndex + direction + imageCount) % imageCount;
}

export function ListingImageGallery({ images, listingTitle }: { images: ListingGalleryImage[]; listingTitle: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = images[selectedIndex];

  if (!selectedImage) return null;

  const selectRelativeImage = (direction: -1 | 1) => {
    setSelectedIndex((currentIndex) => getNextGalleryIndex(currentIndex, direction, images.length));
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-muted to-muted/40 sm:aspect-[4/3]">
        <Image
          key={selectedImage.id}
          src={selectedImage.url}
          alt={`${listingTitle}, photo ${selectedIndex + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover"
        />
        {images.length > 1 && <>
          <button
            type="button"
            aria-label="Previous listing photo"
            onClick={() => selectRelativeImage(-1)}
            className="absolute left-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next listing photo"
            onClick={() => selectRelativeImage(1)}
            className="absolute right-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </>}
      </div>
      {images.length > 1 && <div className="grid grid-cols-5 gap-2">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            aria-label={`Show photo ${index + 1} of ${images.length}`}
            aria-pressed={selectedIndex === index}
            onClick={() => setSelectedIndex(index)}
            className={`relative aspect-square overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedIndex === index ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-75 transition-opacity hover:opacity-100"}`}
          >
            <Image src={image.url} alt="" fill sizes="20vw" className="object-cover" />
          </button>
        ))}
      </div>}
    </div>
  );
}
