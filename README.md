# GoXL Commerce

AI-powered social commerce platform for small businesses: promote on Instagram, Facebook and WhatsApp, answer customers with an AI sales assistant, take orders and payments, and track delivery.

**Stack:** Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage). Brand: Deep Forest Green `#1B4332`, Lime-Yellow `#C8E600`, Montserrat.

## What works today (Stage 1: Foundation)

- Email and password sign-up and sign-in (Supabase Auth)
- Multi-tenant businesses: one user can own or join several, with a switcher (agency use)
- Onboarding wizard: business, brand, language, delivery policies, FAQs
- Business profile editing with logo upload
- Product catalogue: SKU, prices, discount, variants, sizes, stock, up to 6 photos per product
- Team: invite by email, roles (owner, manager, sales, fulfilment), change role, remove, leave
- Social accounts screen showing real connection state (connect needs Meta credentials, see below)
- Overview with live counts and a getting-started checklist
- Database already contains the tables for the next stages: customers, campaigns, conversations, messages, orders, order items, payments, shipments, audit log

Tenant isolation, roles and the "no order is paid without a verified payment" rule are enforced by Postgres row level security and triggers, not only in the UI.

## Not built yet

Creative Studio, campaigns and publishing, inbox, AI assistant, CRM, orders UI, Razorpay payments, dispatch, automation, analytics, billing. Their sidebar entries are marked "Soon".

## Database

All tables live in a dedicated Postgres schema called `gx`, so they cannot clash with anything else in the Supabase project.

1. Run `supabase/migrations/*.sql` in order (SQL editor, or `supabase db push`). Already applied to the project this repo was built against.
2. **Expose the schema:** Supabase Dashboard > Project Settings > Data API > Exposed schemas > add `gx` > Save. Without this the app cannot read its tables.
3. Authentication > URL Configuration: set Site URL to your deployed URL and add `<your-url>/auth/callback` to Redirect URLs.

> This project shares one Supabase project with another app that has a trigger on `auth.users`. Every GoXL sign-up therefore also creates an inactive row in that app's own `public.profiles` table. A separate Supabase project for GoXL avoids this.

## Run locally

```bash
cp .env.example .env.local   # fill in the URL and anon key
npm install
npm run dev
```

## Deploy

Push to GitHub and import the repo in Vercel (or any Node host). Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

## Connecting Meta (Instagram, Facebook, WhatsApp)

You need a Meta developer app, a verified business, and Meta app review for the publishing and messaging permissions. Add `META_APP_ID`, `META_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. Access tokens must be stored in Supabase Vault, never in a normal column. WhatsApp Status cannot be published by API; the product uses a manual share step.

## Roadmap

| Stage | Scope |
|---|---|
| 1 | Foundation (done) |
| 2 | Creative studio, campaign composer, publishing, calendar |
| 3 | WhatsApp webhook, inbox, AI assistant over the catalogue, CRM, human takeover |
| 4 | Orders, Razorpay payment links and webhook verification, dispatch, delivery updates |
| 5 | Instagram and Facebook messaging, analytics, agency dashboards, billing |
