import type { Category, Listing } from "@/types/listing";

export const FEATURED_CATEGORIES: Category[] = [
  {
    id: "cat-1",
    name: "Outerwear & Jackets",
    slug: "outerwear",
    description: "Leather jackets, trench coats, blazers & coats",
    itemCount: 1420,
    imageUrl:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "cat-2",
    name: "Vintage & Retro",
    slug: "vintage",
    description: "Authenticated vintage pieces from the 70s, 80s & 90s",
    itemCount: 980,
    imageUrl:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "cat-3",
    name: "Streetwear",
    slug: "streetwear",
    description: "Graphic tees, hoodies, track pants & statement wear",
    itemCount: 2150,
    imageUrl:
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "cat-4",
    name: "Denim & Jeans",
    slug: "denim",
    description: "Selvedge denim, vintage Levis, jackets & skirts",
    itemCount: 1840,
    imageUrl:
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "cat-5",
    name: "Knitwear & Sweaters",
    slug: "knitwear",
    description: "Chunky wool, soft cashmere, cable-knits & cardigans",
    itemCount: 1120,
    imageUrl:
      "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "cat-6",
    name: "Footwear & Sneakers",
    slug: "footwear",
    description: "Curated retro sneakers, leather boots & loafers",
    itemCount: 1650,
    imageUrl:
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
  },
];

export const FEATURED_LISTINGS: Listing[] = [
  {
    id: "item-1",
    title: "Vintage 90s Distressed Leather Biker Jacket",
    description:
      "Heavyweight genuine leather jacket with natural patina and zipper detail. Perfect oversized boxy fit.",
    price: 145,
    originalPrice: 380,
    size: "L",
    brand: "Schott NYC",
    category: "Outerwear & Jackets",
    categorySlug: "outerwear",
    condition: "Excellent Pre-Owned",
    imageUrl:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1000&q=80",
    seller: {
      id: "user-1",
      name: "Alex Rivera",
      username: "alex_vintage",
      avatarUrl:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
      rating: 4.9,
      reviewCount: 42,
      isVerified: true,
    },
    likesCount: 38,
    createdAt: "2 hours ago",
    featured: true,
    tag: "Vintage",
  },
  {
    id: "item-2",
    title: "Japanese 14oz Raw Selvedge Denim Jeans",
    description:
      "Unwashed indigo raw denim jeans with red line selvedge ID. Crisp fabric starting to develop subtle wear patterns.",
    price: 110,
    originalPrice: 220,
    size: "32 x 32",
    brand: "Naked & Famous",
    category: "Denim & Jeans",
    categorySlug: "denim",
    condition: "Like New",
    imageUrl:
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=1000&q=80",
    seller: {
      id: "user-2",
      name: "Marcus Chen",
      username: "denim_head",
      avatarUrl:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
      rating: 5.0,
      reviewCount: 68,
      isVerified: true,
    },
    likesCount: 24,
    createdAt: "5 hours ago",
    featured: true,
    tag: "Sustainable Choice",
  },
  {
    id: "item-3",
    title: "Hand-Knitted Cream Cable Wool Sweater",
    description:
      "100% thick virgin wool sweater in natural off-white. Ultra warm and structured silhouette.",
    price: 78,
    originalPrice: 160,
    size: "M",
    brand: "Inis Meáin",
    category: "Knitwear & Sweaters",
    categorySlug: "knitwear",
    condition: "Very Good",
    imageUrl:
      "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=1000&q=80",
    seller: {
      id: "user-3",
      name: "Elena Rostova",
      username: "cozy_finds",
      avatarUrl:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
      rating: 4.8,
      reviewCount: 31,
      isVerified: false,
    },
    likesCount: 52,
    createdAt: "1 day ago",
    featured: true,
    tag: "Winter Essential",
  },
  {
    id: "item-4",
    title: "Retro High-Top Leather Sneakers",
    description:
      "Clean monochrome high-top leather sneakers. Minimal sole wear, comes with original box.",
    price: 95,
    originalPrice: 190,
    size: "US 10",
    brand: "Common Projects",
    category: "Footwear & Sneakers",
    categorySlug: "footwear",
    condition: "Good",
    imageUrl:
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1000&q=80",
    seller: {
      id: "user-4",
      name: "Jordan Smith",
      username: "kicks_archive",
      avatarUrl:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
      rating: 4.9,
      reviewCount: 115,
      isVerified: true,
    },
    likesCount: 67,
    createdAt: "1 day ago",
    featured: true,
    tag: "Popular",
  },
  {
    id: "item-5",
    title: "Minimalist Double-Breasted Trench Coat",
    description:
      "Classic camel cotton-blend water-resistant trench coat with adjustable waist belt and horn buttons.",
    price: 160,
    originalPrice: 450,
    size: "S",
    brand: "APC",
    category: "Outerwear & Jackets",
    categorySlug: "outerwear",
    condition: "Like New",
    imageUrl:
      "https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1000&q=80",
    seller: {
      id: "user-5",
      name: "Yuki Tanaka",
      username: "tokyo_thrifter",
      avatarUrl:
        "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
      rating: 5.0,
      reviewCount: 94,
      isVerified: true,
    },
    likesCount: 45,
    createdAt: "2 days ago",
    featured: true,
    tag: "Designer",
  },
  {
    id: "item-6",
    title: "Overdyed Oversized Heavyweight Hoodie",
    description:
      "Faded washed charcoal black hoodie with double-layer hood and dropped shoulders.",
    price: 65,
    originalPrice: 130,
    size: "XL",
    brand: "Acne Studios",
    category: "Streetwear",
    categorySlug: "streetwear",
    condition: "Excellent Pre-Owned",
    imageUrl:
      "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1000&q=80",
    seller: {
      id: "user-6",
      name: "Sam Vance",
      username: "street_loop",
      avatarUrl:
        "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=200&q=80",
      rating: 4.7,
      reviewCount: 22,
      isVerified: false,
    },
    likesCount: 31,
    createdAt: "3 days ago",
    featured: true,
    tag: "Streetwear",
  },
];

export const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Discover & Filter",
    description:
      "Browse thousands of unique, pre-loved garments curated by style, size, condition, and price.",
    forWho: "Buyer",
  },
  {
    step: "02",
    title: "List in Minutes",
    description:
      "Snap photos of your pre-owned clothes, set your price, and list effortlessly without selling fees.",
    forWho: "Seller",
  },
  {
    step: "03",
    title: "Secure Purchase",
    description:
      "Pay securely. Sellers ship directly with trackable shipping and automated updates.",
    forWho: "Buyer & Seller",
  },
  {
    step: "04",
    title: "Keep Clothing in the Loop",
    description:
      "Reduce fashion waste, earn money from your closet, and refresh your wardrobe sustainably.",
    forWho: "Community",
  },
];

export const VALUE_PROPOSITIONS = [
  {
    title: "Circular Fashion",
    description:
      "Extend the lifespan of quality garments and divert textile waste away from landfills.",
    icon: "Recycle",
  },
  {
    title: "Curated Quality",
    description:
      "Every listing features clear condition tags, detailed measurements, and verified seller scores.",
    icon: "Sparkles",
  },
  {
    title: "Zero Seller Listing Fees",
    description:
      "Keep more of what you earn when giving your pre-owned clothing another loop.",
    icon: "Tag",
  },
  {
    title: "Buyer Protection",
    description:
      "Your money is held safely until your item arrives exactly as described by the seller.",
    icon: "ShieldCheck",
  },
];
