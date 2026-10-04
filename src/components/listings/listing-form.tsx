"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createListingAction, updateListingAction, type ListingActionState } from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listingConditions, listingGenders } from "@/lib/validations/listing";
import type { ListingBrand, ListingCategory, ListingRecord, ListingStatus } from "@/types/listing-management";

interface ListingFormProps {
  categories: ListingCategory[];
  brands: ListingBrand[];
  listing?: ListingRecord;
  status?: ListingStatus;
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="text-xs text-destructive">{children}</p> : null;
}

export function ListingForm({ categories, brands, listing, status = "DRAFT" }: ListingFormProps) {
  const action = listing ? updateListingAction : createListingAction;
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(action, null);
  const error = (field: string) => state?.fieldErrors?.[field];

  return (
    <form action={formAction} noValidate className="space-y-8">
      {listing && <input type="hidden" name="id" value={listing.id} />}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-6"><h2 className="text-lg font-semibold">Item details</h2><p className="mt-1 text-sm text-muted-foreground">Tell buyers what makes this piece worth a second life.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><label htmlFor="title" className="text-sm font-medium">Listing title</label><Input id="title" name="title" required maxLength={120} defaultValue={listing?.title ?? ""} placeholder="Vintage Levi's denim jacket" aria-invalid={Boolean(error("title"))} />{error("title") ? <FieldError>{error("title")}</FieldError> : <p className="text-xs text-muted-foreground">Keep it clear and specific.</p>}</div>
          <div className="space-y-1.5 sm:col-span-2"><label htmlFor="description" className="text-sm font-medium">Description</label><Textarea id="description" name="description" required minLength={20} maxLength={5000} rows={6} defaultValue={listing?.description ?? ""} placeholder="Describe the fit, details, and any signs of wear…" aria-invalid={Boolean(error("description"))} />{error("description") && <FieldError>{error("description")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="categoryId" className="text-sm font-medium">Category</label><Select id="categoryId" name="categoryId" required defaultValue={listing?.category_id ?? ""} aria-invalid={Boolean(error("categoryId"))}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>{error("categoryId") && <FieldError>{error("categoryId")}</FieldError>}{categories.length === 0 && <p className="text-xs text-destructive">No categories are available. Apply the listing catalog migration in Supabase.</p>}</div>
          <div className="space-y-1.5"><label htmlFor="brandId" className="text-sm font-medium">Brand <span className="text-muted-foreground">(optional)</span></label><Select id="brandId" name="brandId" defaultValue={listing?.brand_id ?? ""} aria-invalid={Boolean(error("brandId"))}><option value="">Unbranded / not listed</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</Select>{error("brandId") && <FieldError>{error("brandId")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="gender" className="text-sm font-medium">Style category</label><Select id="gender" name="gender" required defaultValue={listing?.gender ?? "Unisex"}>{listingGenders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</Select>{error("gender") && <FieldError>{error("gender")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="size" className="text-sm font-medium">Size</label><Input id="size" name="size" required maxLength={32} defaultValue={listing?.size ?? ""} placeholder="M, 32, One size" aria-invalid={Boolean(error("size"))} />{error("size") && <FieldError>{error("size")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="condition" className="text-sm font-medium">Condition</label><Select id="condition" name="condition" required defaultValue={listing?.condition ?? "Very Good"}>{listingConditions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</Select>{error("condition") && <FieldError>{error("condition")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="color" className="text-sm font-medium">Color <span className="text-muted-foreground">(optional)</span></label><Input id="color" name="color" maxLength={60} defaultValue={listing?.color ?? ""} placeholder="Indigo" aria-invalid={Boolean(error("color"))} />{error("color") && <FieldError>{error("color")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="material" className="text-sm font-medium">Material <span className="text-muted-foreground">(optional)</span></label><Input id="material" name="material" maxLength={100} defaultValue={listing?.material ?? ""} placeholder="Cotton denim" aria-invalid={Boolean(error("material"))} />{error("material") && <FieldError>{error("material")}</FieldError>}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-6"><h2 className="text-lg font-semibold">Price and location</h2><p className="mt-1 text-sm text-muted-foreground">Set a fair price and let buyers know where the item is located.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5"><label htmlFor="sellingPrice" className="text-sm font-medium">Selling price</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input id="sellingPrice" name="sellingPrice" type="number" inputMode="decimal" min="0.01" max="99999999.99" step="0.01" required className="pl-7" defaultValue={listing?.selling_price ?? ""} placeholder="45.00" aria-invalid={Boolean(error("sellingPrice"))} /></div>{error("sellingPrice") && <FieldError>{error("sellingPrice")}</FieldError>}</div>
          <div className="space-y-1.5"><label htmlFor="originalPrice" className="text-sm font-medium">Original price <span className="text-muted-foreground">(optional)</span></label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input id="originalPrice" name="originalPrice" type="number" inputMode="decimal" min="0.01" max="99999999.99" step="0.01" className="pl-7" defaultValue={listing?.original_price ?? ""} placeholder="90.00" aria-invalid={Boolean(error("originalPrice"))} /></div>{error("originalPrice") && <FieldError>{error("originalPrice")}</FieldError>}</div>
          <div className="space-y-1.5 sm:col-span-2"><label htmlFor="location" className="text-sm font-medium">Location <span className="text-muted-foreground">(optional)</span></label><Input id="location" name="location" autoComplete="address-level2" maxLength={120} defaultValue={listing?.location ?? ""} placeholder="City or region" aria-invalid={Boolean(error("location"))} />{error("location") && <FieldError>{error("location")}</FieldError>}</div>
        </div>
      </section>

      {state?.message && <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{state.message}{state.href && <Link href={state.href} className="ml-2 font-semibold underline">Continue to your saved listing</Link>}</div>}
      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
        <Link href="/dashboard/listings" className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Cancel</Link>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(!listing || status === "DRAFT") && <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending} className="h-11">{pending ? "Saving…" : listing ? "Save draft" : "Save draft"}</Button>}
          {(!listing || status === "DRAFT") && <Button type="submit" name="intent" value="publish" disabled={pending} className="h-11">{pending ? "Working…" : "Publish listing"}</Button>}
          {listing && status !== "DRAFT" && <Button type="submit" disabled={pending} className="h-11">{pending ? "Saving…" : "Save changes"}</Button>}
        </div>
      </div>
      {listing && <p className="text-right text-xs text-muted-foreground">Listing URL: /listing/{listing.slug}</p>}
      {!listing && <p className="text-right text-xs text-muted-foreground">A URL-friendly address is generated from your title when you save.</p>}
    </form>
  );
}
