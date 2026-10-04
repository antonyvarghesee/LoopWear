export type Condition =
  | "New with Tags"
  | "Like New"
  | "Excellent Pre-Owned"
  | "Very Good"
  | "Good";

export interface Seller {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  rating: number;
  reviewCount: number;
  isVerified?: boolean;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  size: string;
  brand: string;
  category: string;
  categorySlug: string;
  condition: Condition;
  imageUrl: string;
  additionalImages?: string[];
  seller: Seller;
  likesCount: number;
  createdAt: string;
  featured?: boolean;
  tag?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  itemCount: number;
  imageUrl: string;
  accentColor?: string;
}
