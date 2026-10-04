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
- **Session refresh**: `src/lib/supabase/middleware.ts` & `src/proxy.ts` — Automatic session token refresh on HTTP requests.
- **Migrations**: SQL schema and follow-up changes are in `supabase/migrations/`.

## Identity and Profiles (Implemented)

- Email registration with username and display name, email verification, password login/logout, and password recovery/reset use Supabase Auth.
- Auth callbacks exchange Supabase PKCE codes and only redirect to fixed internal verification or password-reset routes.
- Server session helpers distinguish an absent session from Supabase/configuration failures. `/settings/profile` is guarded on the server.
- Users can edit username, display name, bio, and location. Profile identity is derived from the authenticated server session.
- Profile rows are created by a database trigger. RLS and SQL column grants prevent authenticated users from inserting profile rows or changing system-controlled trust fields; only username, display name, bio, and location can be updated.
- Username format and uniqueness are enforced in the database; username conflicts during updates receive a safe user-facing error.

### Supabase setup required to run auth

- Apply the existing migrations in timestamp order, including `20261004000002_secure_profiles_and_user_trigger.sql`.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` in the deployment environment.
- In Supabase Auth, enable email/password sign-in and add `${NEXT_PUBLIC_APP_URL}/auth/callback` to the allowed redirect URLs. Configure confirmation and recovery emails to use the redirect URL supplied by the app.

## Clothing Listings (Implemented; media deferred)

- `/sell` creates a draft by default, with explicit publish available after validation.
- Sellers can edit, publish, archive, remove, and filter their own listings from `/dashboard/listings`; `/sell/[id]/edit` verifies ownership server-side.
- `/listing/[slug]` renders active listings with SEO metadata, seller details, and a photo placeholder. Image upload is deferred.
- Categories and brands are loaded from Supabase. The listing migration seeds common choices without overwriting existing catalog entries.
- Listing ownership, insert defaults, allowed status changes, and unique URL slugs are enforced in PostgreSQL as well as the server service.
- Listing migration: `supabase/migrations/20261004000003_listing_system.sql`.

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
