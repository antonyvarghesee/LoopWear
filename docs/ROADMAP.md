# LoopWear roadmap

Work is sequenced so the app can ship on free-tier infrastructure (Supabase, Stripe Test Mode, Resend, Sentry, Vercel). No AWS. No paid add-ons unless requested.

## Phase 0 — Scaffold (current)

- Next.js App Router, TypeScript, Tailwind, shadcn/ui, ESLint
- Folder layout, `.env.example`, docs
- Minimal marketing homepage
- Lint, typecheck, and production build green

**Out of scope:** auth, schema, listings, uploads, payments, messaging, admin.

## Phase 1 — Platform foundation

- Provision Supabase (Auth, Postgres, Storage, Realtime)
- Env-backed server/browser clients
- Sentry project (optional until DSN exists)
- Error/not-found pages already in place; wire Sentry DSN
- Resend domain or `onboarding@resend.dev` for local tests

## Phase 2 — Identity and profiles

- Register / login / logout / session
- Server-side session helpers
- Profile create/edit
- Protected account routes

## Phase 3 — Listings and media

- Listing schema + RLS
- Create / edit / archive own listings
- Photo upload to Supabase Storage
- Public listing detail pages (SEO)

## Phase 4 — Discovery

- Browse listings
- Search and filters (category, size, price, condition)
- Favorites

## Phase 5 — Messaging

- Conversations tied to a listing
- Realtime message delivery
- Server authorization so only participants can read/write

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
