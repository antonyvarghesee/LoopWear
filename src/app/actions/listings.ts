"use server";

import { redirect } from "next/navigation";
import {
  archiveOwnListing,
  createDraftListing,
  publishOwnListing,
  removeOwnListing,
  updateOwnListing,
} from "@/services/listings";

export type ListingActionState = {
  status: "error" | "success";
  message: string;
  fieldErrors?: Record<string, string>;
  href?: string;
} | null;

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getListingInput(formData: FormData) {
  return {
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    categoryId: getString(formData, "categoryId"),
    brandId: getString(formData, "brandId"),
    gender: getString(formData, "gender"),
    size: getString(formData, "size"),
    condition: getString(formData, "condition"),
    color: getString(formData, "color"),
    material: getString(formData, "material"),
    originalPrice: getString(formData, "originalPrice"),
    sellingPrice: getString(formData, "sellingPrice"),
    location: getString(formData, "location"),
  };
}

export async function createListingAction(_state: ListingActionState, formData: FormData): Promise<ListingActionState> {
  try {
    const created = await createDraftListing(getListingInput(formData));
    if (!created.success) return { status: "error", message: created.error, fieldErrors: created.fieldErrors };

    if (getString(formData, "intent") === "publish") {
      const published = await publishOwnListing(created.data.id);
      if (!published.success) {
        return {
          status: "error",
          message: `Your draft was saved, but it couldn't be published: ${published.error}`,
          href: `/sell/${created.data.id}/edit`,
        };
      }
      redirect(`/listing/${published.data.slug}`);
    }
    redirect("/dashboard/listings?status=DRAFT&saved=1");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Listing creation action failed:", error);
    return { status: "error", message: "We couldn't save this listing. Please try again." };
  }
}

export async function updateListingAction(_state: ListingActionState, formData: FormData): Promise<ListingActionState> {
  const id = getString(formData, "id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { status: "error", message: "This listing could not be found." };
  }

  try {
    const updated = await updateOwnListing(id, getListingInput(formData));
    if (!updated.success) return { status: "error", message: updated.error, fieldErrors: updated.fieldErrors };
    if (getString(formData, "intent") === "publish") {
      const published = await publishOwnListing(id);
      if (!published.success) {
        return { status: "error", message: published.error, href: `/dashboard/listings` };
      }
      redirect(`/listing/${published.data.slug}`);
    }
    redirect("/dashboard/listings?saved=1");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Listing update action failed:", error);
    return { status: "error", message: "We couldn't save this listing. Please try again." };
  }
}

export async function manageListingAction(_state: ListingActionState, formData: FormData): Promise<ListingActionState> {
  const id = getString(formData, "id");
  const intent = getString(formData, "intent");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { status: "error", message: "This listing could not be found." };
  }

  try {
    const result = intent === "publish" ? await publishOwnListing(id)
      : intent === "archive" ? await archiveOwnListing(id)
        : intent === "remove" ? await removeOwnListing(id)
          : null;
    if (!result) return { status: "error", message: "Choose a valid listing action." };
    if (!result.success) return { status: "error", message: result.error };
    redirect(`/dashboard/listings?status=${result.data.status}&updated=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Listing management action failed:", error);
    return { status: "error", message: "We couldn't update this listing. Please try again." };
  }
}
