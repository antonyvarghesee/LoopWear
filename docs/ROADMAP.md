# LoopWear roadmap

Work is sequenced so the app can ship on free-tier infrastructure (Supabase, Stripe Test Mode, Resend, Sentry, Vercel). No AWS. No paid add-ons unless requested.

## Phase 0 — Scaffold (Completed)

- Next.js App Router, TypeScript, Tailwind, shadcn/ui, ESLint
- Folder layout, `.env.example`, docs
- Minimal marketing homepage
- Lint, typecheck, and production build green

## Phase 1 — Platform foundation (Completed)

- Provision Supabase foundation (Auth, Postgres, Storage, Realtime)
- Env-backed server, browser, admin, and middleware clients
- Complete SQL migration schema (`supabase/migrations/20261004000000_initial_schema.sql`) with RLS policies, indexes, storage buckets, and Realtime publications
- Graceful environment variable validation with Zod

## Phase 2 — Identity and profiles (Completed)

- Supabase email registration, verification callback, login, logout, and password recovery/reset
- Server-side session helpers and protected `/settings/profile` route
- Profile display/edit for username, display name, bio, and location
- Database-owned profile creation and restricted editable-column RLS/grants
- Auth, profile, validation, and route-guard tests

## Phase 3 — Listings and media (Completed)

- Listing schema migration, seller-scoped RLS, server authorization, and database-owned unique slugs
- Draft creation, own-listing edit, publish, archive, and remove lifecycle
- Seller dashboard with status filters
- Database-driven category and brand selection with initial seed data
- Public active listing detail pages with SEO metadata, seller information, and image galleries
- Private listing image uploads, ordering, deletion, RLS policies, and signature validation (`20261004000004_listing_images.sql`)

## Phase 4 — Discovery (Browse and search implemented)

- `/browse` displays active listings only, with database-backed URL search, filters, sorting, and pagination (Prompt 6).
- `/favorites` lets signed-in buyers save and remove active listings (Prompt 7).
- `/seller/[username]` displays public seller details and paginated active listings (Prompt 8).

## Phase 5 — Messaging (Implemented)

- `/messages` lists the signed-in user's most recently active listing conversations; `/messages/[conversationId]` checks membership server-side and loads a bounded message history.
- Buyers can open a conversation from an active listing. A security-definer database function takes the authenticated buyer from `auth.uid()` and the seller from the listing; the existing unique buyer/seller/listing key makes creation idempotent.
- RLS and column grants allow participants to read conversations/messages and insert message content only. Sender IDs, timestamps, and read state are database-controlled; recipients mark only incoming messages as read.
- Supabase Realtime watches only INSERT events for the open conversation, and the messages SELECT RLS policy controls row delivery.
- Migration: `supabase/migrations/20261004000008_messaging.sql`.

## Phase 6 — Checkout and orders

- Stripe Test Mode checkout
- Webhooks to create/fulfill orders
- Order tracking for buyer and seller
- Prices taken from the database only

## Phase 7 — Trust and safety

- Reviews of sellers/items after purchase
- Report listings/users
- Admin dashboard for reports, users, and listings
- Server-enforced admin role

## Phase 8 — Hardening

- Accessibility and responsive pass
- Playwright journeys for buy/sell/report
- Rate limits, email templates, observability
- Production env checklist (still no AWS)

## Explicitly deferred

- Prisma
- Live Stripe keys
- Native apps
- Paid search, CDN, or queue products
