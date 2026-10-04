# LoopWear project plan

LoopWear is a modern peer-to-peer marketplace for buying and selling pre-owned clothing. This document is the development plan. Product features are **not implemented** in the current scaffold.

## Goals

Buyers can discover, favorite, message about, and purchase second-hand clothing. Sellers can list items with photos, manage inventory, and fulfill orders. Operators can moderate reports from an admin dashboard.

## Non-goals (this phase)

- Authentication
- Database schema
- Listings, search, favorites
- Image upload
- Payments and orders
- Messaging
- Reviews and reports
- Admin dashboard

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
| ORM | **Not Prisma** | Supabase SQL + typed queries are enough; Prisma would duplicate the data layer |
| Payments | Stripe Test Mode | Card checkout without live charges |
| Email | Resend | Transactional mail on a free tier |
| Errors | Sentry | Production diagnostics |
| Tests | Vitest, Playwright | Unit and browser coverage |
| Hosting | Vercel (or equivalent) later | No AWS |

Do not add paid infrastructure unless explicitly requested. Never introduce AWS.

## Architecture rules

- TypeScript `strict` mode, including `noUncheckedIndexedAccess`.
- Server Components by default. Client Components only for interactivity (forms, error boundaries, realtime UI).
- Authorize every mutation on the server. Never trust client-side prices, roles, or permissions.
- Validate inputs with Zod at the server boundary.
- Keep business logic in `src/services`; keep UI in `src/app` and `src/components`.
- Secrets live in environment variables only. `.env.example` documents keys; `.env*` is gitignored except `.env.example`.
- Public listing pages must be SEO-friendly (metadata, semantic HTML).
- UI must be responsive and accessible (labels, focus, contrast, keyboard).
- Fail closed: unknown errors show a generic page; log details server-side / Sentry.

## Target project structure

```text
src/
  app/                 # routes, layouts, metadata (RSC default)
  components/
    layout/            # site chrome
    ui/                # shadcn primitives
  hooks/               # client hooks when required
  lib/
    env.ts             # Zod env schemas
    supabase/          # clients (Phase 1+)
    stripe/            # payments (later)
    email/             # Resend (later)
    validations/       # request/form schemas
  services/            # domain logic
  types/               # shared types
docs/                  # plans
e2e/                   # Playwright
```

## Data sketch (not implemented)

Future Supabase tables, subject to migration review:

- `profiles` — public seller/buyer profile keyed to `auth.users`
- `listings` — title, description, category, size, condition, **server-owned price**, status
- `listing_images` — storage object paths
- `favorites`
- `conversations` / `messages`
- `orders` / `order_items` — amounts copied from listings at purchase time
- `reviews`
- `reports`
- `admin roles` — server-enforced, not a client flag

Row Level Security on every table. Storage policies for listing images. Stripe webhook is the source of truth for paid orders.

## Security notes

- Service role key is server-only.
- Checkout amounts come from the database, not the request body.
- Messaging and admin routes check session + role on the server.
- Report flows must not leak reporter identity to the reported user.

## Quality gates

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Vitest for services and schemas
- Playwright for critical user journeys once those journeys exist
