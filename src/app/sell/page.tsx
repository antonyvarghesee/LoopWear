import type { Metadata } from "next";
import { connection } from "next/server";
import { ListingForm } from "@/components/listings/listing-form";
import { getListingFormOptions } from "@/services/listings";
import { requireAuth } from "@/services/auth";

export const metadata: Metadata = { title: "List an item" };

export default async function SellPage() {
  await connection();
  await requireAuth("/sell");
  const { categories, brands } = await getListingFormOptions();
  return <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
    <div className="mb-8"><p className="text-sm font-medium text-primary">Sell on LoopWear</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Give a good piece another loop</h1><p className="mt-2 max-w-2xl text-muted-foreground">Add item details, save the listing, then add photos from its edit page.</p></div>
    <ListingForm categories={categories} brands={brands} />
  </main>;
}
