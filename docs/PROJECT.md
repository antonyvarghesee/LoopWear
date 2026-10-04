# LoopWear project plan

LoopWear is a modern peer-to-peer marketplace for buying and selling pre-owned clothing. This document is the development plan.

## Goals

Buyers can discover, favorite, message about, and purchase second-hand clothing. Sellers can list items with photos, manage inventory, and fulfill orders. Operators can moderate reports from an admin dashboard.

## Stack (free-first)

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js App Router, React, TypeScript | Server Components, SEO, one codebase |
| UI | Tailwind CSS, shadcn/ui | Accessible primitives, consistent theming |
| Data | Supabase PostgreSQL | Hosted Postgres on the free tier |
| Auth | Supabase Auth | Email/OAuth without custom identity infra |
| Files | Supabase Storage | Listing photos without AWS |
| Realtime | Supabase Realtime | Inbox updates without a dedicated broker |
| Validation | Zod | Shared server/client schemas |
| ORM | **Not Prisma** | Supabase SQL + typed queries are enough |
| Payments | Stripe Test Mode | Card checkout without live charges |
| Email | Resend | Transactional mail on a free tier |
| Errors | Sentry | Production diagnostics |
| Tests | Vitest, Playwright | Unit and browser coverage |

Do not add paid infrastructure unless explicitly requested. Never introduce AWS.

## Architecture rules

- TypeScript `strict` mode, including `noUncheckedIndexedAccess`.
- Server Components by default. Client Components only for interactivity (forms, error boundaries, realtime UI).
- Authorize every mutation on the server. Never trust client-side prices, roles, or permissions.
- Validate inputs with Zod at the server boundary.
- Keep business logic in `src/services`; keep UI in `src/app` and `src/components`.
- Secrets live in environment variables only. `.env.example` documents keys; `.env*` is gitignored except `.env.example`.
- Public listing pages must be SEO-friendly (metadata, semantic HTML).
- Fail closed: unknown errors show a generic page; log details server-side / Sentry.

## Supabase Foundation & Client Architecture

- **Client**: `src/lib/supabase/client.ts` — Browser-side client using `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Server**: `src/lib/supabase/server.ts` — Server-side client using `@supabase/ssr` cookies for Server Components, Server Actions, & Route Handlers.
- **Admin**: `src/lib/supabase/admin.ts` — Server-only admin client using `SUPABASE_SERVICE_ROLE_KEY`. Never exposed to client bundles.
- **Middleware**: `src/lib/supabase/middleware.ts` & `src/middleware.ts` — Automatic session token refresh on HTTP requests.
- **Migrations**: SQL schema located in `supabase/migrations/20261004000000_initial_schema.sql`.

## Target project structure

```text
src/
  app/                 # routes, layouts, metadata (RSC default)
  components/
    layout/            # site chrome (header, footer)
    home/              # homepage sections
    listings/          # listing components
    ui/                # shadcn primitives
  hooks/               # client hooks
  lib/
    env.ts             # Zod env schemas & Supabase helpers
    supabase/          # client, server, admin & middleware Supabase modules
    stripe/            # payments (later)
    email/             # Resend (later)
    validations/       # request/form schemas
  services/            # domain logic
  types/               # shared types
supabase/
  migrations/          # PostgreSQL migrations
docs/                  # plans & documentation
e2e/                   # Playwright E2E tests
```

## Database Schema & Row Level Security

Initial migration table setup (`20261004000000_initial_schema.sql`):
- `profiles` — seller & buyer profiles keyed to `auth.users(id)`
- `categories` & `brands` — clothing taxonomy & brands
- `listings` & `listing_images` — seller listings & photo metadata
- `favorites` — user favorited items
- `conversations` & `messages` — messaging threads & Realtime delivery
- `orders` & `payments` — checkout orders & Stripe PaymentIntents
- `reviews` — post-purchase seller/item ratings
- `reports` — trust & safety moderation items
- `notifications` — user activity notifications

Every table enforces Row Level Security (RLS). Storage buckets (`listing-images`, `avatars`) enforce authenticated write policies and public read policies.

## Quality gates

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
