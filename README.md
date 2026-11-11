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

## Deploy at goxl.in/business-live

The app is built to live under the path `/business-live` (`basePath` in `next.config.mjs`, override with `NEXT_PUBLIC_BASE_PATH`; use an empty value for a subdomain such as business.goxl.in).

1. Deploy this repo as its own project (for example on Vercel) with `NEXT_PUBLIC_BASE_PATH=/business-live`.
2. Make `https://goxl.in/business-live/*` reach that deployment. The method depends on where goxl.in is hosted:
   - Vercel: in the goxl.in project add a rewrite `{ "source": "/business-live/:path*", "destination": "https://<deployment>.vercel.app/business-live/:path*" }`.
   - Cloudflare, nginx or another proxy: proxy `/business-live/` to the deployment, passing the path through unchanged.
   - WordPress or shared hosting without a proxy: use a subdomain instead (CNAME `business.goxl.in` to the deployment, `NEXT_PUBLIC_BASE_PATH=` empty).
3. Supabase > Authentication > URL Configuration: Site URL `https://goxl.in/business-live`, redirect URL `https://goxl.in/business-live/auth/callback`.
4. Supabase > Project Settings > Data API > Exposed schemas: add `gx`.


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

## Stage 2 and 3: publishing, inbox and AI assistant

Server environment variables (see `.env.example`): `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (public URL including `/business-live`), `ANTHROPIC_API_KEY`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `CRON_SECRET`.

1. **Supabase**: Settings > API > Exposed schemas must include `gx`. Authentication > URL configuration: set the Site URL to the app URL and add `<app URL>/auth/callback` as a redirect.
2. **Connect accounts** in Social Accounts with the numeric ID and an access token from your Meta app (verified against Meta before saving; tokens live in `gx.channel_secrets`, readable only by the server).
3. **WhatsApp webhook**: callback `<app URL>/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`. Payload signatures are checked with `META_APP_SECRET`.
4. **Scheduled posts**: call `GET <app URL>/api/cron/publish` with `Authorization: Bearer <CRON_SECRET>` every 5 minutes (Supabase pg_cron + pg_net, or any scheduler; Vercel Hobby cron is daily only).
5. Try the AI assistant without WhatsApp from the inbox test box.

Not in this release: reels/video, WhatsApp Status API posting (not offered by Meta), orders, Razorpay and dispatch (Stage 4).

## Per-account keys (Settings)

Each business adds its own keys in **Settings**: Claude or OpenAI API key (and the provider choice), Meta app secret, and Razorpay key ID, key secret and webhook secret. WhatsApp, Instagram and Facebook tokens go in **Social Accounts**. Everything is encrypted with `SECRETS_ENCRYPTION_KEY` before it is stored and is only readable by the server; the browser only ever sees the last four characters. Only the account owner can change keys. Platform-level `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `META_APP_SECRET` are optional fallbacks.

Webhooks: WhatsApp `<app>/api/webhooks/whatsapp` (verify token shown per account in Settings), Razorpay `<app>/api/webhooks/razorpay?b=<business id>` (shown in Settings), event `payment_link.paid`.

## Stage 4: orders, payments, dispatch

Orders come from an inbox draft or are entered by hand, reserve stock, and get a Razorpay payment link sent on WhatsApp. An order becomes paid only through a verified Razorpay payment (webhook, or "Check payment status", or an owner/manager recording a manual payment). Dispatch needs a paid order and notifies the customer with tracking.
