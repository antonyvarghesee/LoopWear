import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ListingForm } from "@/components/listings/listing-form";
import { getListingFormOptions, getOwnListingForEdit } from "@/services/listings";
import { requireAuth } from "@/services/auth";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireAuth();
  const { id } = await params;
  const [listing, { categories, brands }] = await Promise.all([
    getOwnListingForEdit(id),
    getListingFormOptions(),
  ]);
  if (!listing) notFound();
  return <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
    <div className="mb-8"><p className="text-sm font-medium text-primary">Seller space</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Edit listing</h1><p className="mt-2 text-muted-foreground">Update the details for “{listing.title}”.</p></div>
    <ListingForm categories={categories} brands={brands} listing={listing} status={listing.status} />
  </main>;
}
