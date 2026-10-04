"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteListingImageAction, reorderListingImagesAction, uploadListingImageAction } from "@/app/actions/listing-images";
import type { ListingImageRecord } from "@/services/listing-images";
import { MAX_LISTING_IMAGES } from "@/lib/validations/listing-image";
import { Button } from "@/components/ui/button";

export function ListingImageManager({ listingId, images }: { listingId: string; images: ListingImageRecord[] }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const selectFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files);
    setPreviews(picked.map((file) => URL.createObjectURL(file)));
    setError("");
    startTransition(async () => {
      for (const file of picked) {
        const result = await uploadListingImageAction(listingId, file);
        if (result.error) { setError(result.error); break; }
      }
      setPreviews([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };
  const remove = (imageId: string) => startTransition(async () => {
    setError(""); const result = await deleteListingImageAction(listingId, imageId);
    if (result.error) setError(result.error); else router.refresh();
  });
  const move = (index: number, delta: number) => startTransition(async () => {
    const next = [...images]; const destination = index + delta;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setError(""); const result = await reorderListingImagesAction(listingId, next.map((image) => image.id));
    if (result.error) setError(result.error); else router.refresh();
  });
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="images-title">
    <h2 id="images-title" className="text-lg font-semibold">Listing photos</h2>
    <p className="mt-1 text-sm text-muted-foreground">Up to {MAX_LISTING_IMAGES} JPEG, PNG, or WebP images, maximum 5 MB each. The first photo is primary.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple disabled={busy || images.length >= MAX_LISTING_IMAGES} onChange={(event) => void selectFiles(event.currentTarget.files)} aria-label="Choose listing photos" />
      {busy && <span role="status" className="text-sm text-muted-foreground">Uploading or saving photos…</span>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {previews.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{previews.map((src) => <Image key={src} src={src} alt="Selected image preview" width={240} height={240} unoptimized className="aspect-square rounded-xl object-cover" />)}</div>}
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image, index) => <div key={image.id} className="space-y-2">
      {image.signedUrl && <Image src={image.signedUrl} alt={`Listing photo ${index + 1}`} width={320} height={320} unoptimized className="aspect-square w-full rounded-xl object-cover" />}
      <div className="flex flex-wrap gap-1"><Button type="button" variant="outline" disabled={busy || index === 0} aria-label="Move image earlier" onClick={() => move(index, -1)}>←</Button><Button type="button" variant="outline" disabled={busy || index === images.length - 1} aria-label="Move image later" onClick={() => move(index, 1)}>→</Button><Button type="button" variant="outline" disabled={busy} onClick={() => remove(image.id)}>Remove</Button></div>
      {index === 0 && <p className="text-xs font-medium">Primary photo</p>}
    </div>)}</div>
    {images.length === 0 && previews.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No photos added yet.</p>}
  </section>;
}
