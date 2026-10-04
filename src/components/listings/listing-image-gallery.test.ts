import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));

import { getNextGalleryIndex, ListingImageGallery } from "@/components/listings/listing-image-gallery";

const images = [
  { id: "first", url: "https://signed.test/first" },
  { id: "second", url: "https://signed.test/second" },
  { id: "third", url: "https://signed.test/third" },
];

describe("ListingImageGallery", () => {
  it("selects the first image initially and exposes accessible thumbnail buttons and navigation", () => {
    const markup = renderToStaticMarkup(createElement(ListingImageGallery, { images, listingTitle: "Vintage jacket" }));

    expect(markup).toContain('src="https://signed.test/first"');
    expect(markup).toContain('alt="Vintage jacket, photo 1"');
    expect(markup).toContain('aria-label="Show photo 1 of 3" aria-pressed="true"');
    expect(markup).toContain('aria-label="Show photo 2 of 3" aria-pressed="false"');
    expect(markup).toContain('aria-label="Previous listing photo"');
    expect(markup).toContain('aria-label="Next listing photo"');
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).not.toContain("storage_path");
  });

  it("moves backward and forward, wrapping at either end", () => {
    expect(getNextGalleryIndex(0, 1, images.length)).toBe(1);
    expect(getNextGalleryIndex(1, -1, images.length)).toBe(0);
    expect(getNextGalleryIndex(2, 1, images.length)).toBe(0);
    expect(getNextGalleryIndex(0, -1, images.length)).toBe(2);
  });

  it("keeps a one-image gallery simple without thumbnail or navigation controls", () => {
    const markup = renderToStaticMarkup(createElement(ListingImageGallery, { images: [images[0]!], listingTitle: "Vintage jacket" }));

    expect(markup).toContain('src="https://signed.test/first"');
    expect(markup).not.toContain("aria-label=\"Previous listing photo\"");
    expect(markup).not.toContain("aria-label=\"Next listing photo\"");
    expect(markup).not.toContain("aria-pressed");
    expect(getNextGalleryIndex(0, 1, 1)).toBe(0);
  });
});
