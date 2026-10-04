import type { ListingCondition, ListingGender } from "@/lib/validations/listing";

export type ListingStatus = "DRAFT" | "ACTIVE" | "SOLD" | "ARCHIVED" | "REMOVED";

export interface ListingRecord {
  id: string;
  seller_id: string;
  title: string;
  slug: string;
  description: string;
  category_id: string | null;
  brand_id: string | null;
  gender: ListingGender;
  size: string;
  condition: ListingCondition;
  color: string | null;
  material: string | null;
  original_price: number | null;
  selling_price: number;
  location: string | null;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  primaryImageUrl?: string | null;
  categories?: { name: string } | Array<{ name: string }> | null;
  brands?: { name: string } | Array<{ name: string }> | null;
  profiles?: {
    id?: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    rating: number;
    review_count: number;
    is_verified: boolean;
  } | null;
}

export interface ListingCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ListingBrand {
  id: string;
  name: string;
  slug: string;
}
