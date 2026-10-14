# AI App Builder Starter

1. `npx create-next-app@latest myapp --ts --app --src-dir --import-alias "@/*"`
2. Copy `src/` and `.env.example` into `myapp/` (overwrite page.tsx).
3. `npm i v0-sdk @supabase/supabase-js @vercel/sdk stripe jszip`
4. Apply `supabase/migrations/20261014113000_initial_schema.sql` to the Supabase project configured in Vercel.
5. Supabase > Auth > URL Configuration: set the Site URL to `https://www.masidy.app` and allow `https://www.masidy.app/auth/callback` and `http://localhost:3000/auth/callback`.
6. `.env.local`: fill all values. Also add `NEXT_PUBLIC_ROOT_DOMAIN` (same value as ROOT_DOMAIN).
7. Domains: add ROOT_DOMAIN to your Vercel account and point its nameservers to Vercel (needed for wildcard subdomains).
8. `npm run dev`, then deploy to Vercel with the same env vars.

VERIFY before launch
- v0 SDK and @vercel/sdk method names vs installed types (fix in `lib/v0.ts` and `lib/vercel.ts` only).
- That deployed apps land in a Vercel project owned by the account/team behind VERCEL_TOKEN. Domains only work if so.
- Vercel and v0 terms allow reselling, and your plan's domain and project limits.

## Stripe setup
1. Stripe Dashboard (use TEST mode first): create two one-time Products (e.g. 50 credits, 200 credits). Copy each Price ID into STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO.
2. Credit amounts are set in `src/lib/stripe.ts` (PACKS). Keep them matching your prices.
3. Webhooks: add endpoint `https://YOURSITE/api/stripe-webhook`, event `checkout.session.completed`. Copy the signing secret into STRIPE_WEBHOOK_SECRET.
4. Local testing: `stripe listen --forward-to localhost:3000/api/stripe-webhook`. Test card 4242 4242 4242 4242.
5. Set NEXT_PUBLIC_SITE_URL to your real URL in production.

## First-deploy test checklist
Do these in order; stop at the first failure.
1. Sign in with the magic link. Check a `profiles` row exists with 10 credits.
2. Generate an app. Preview loads, credits drop to 9, an `apps` row exists.
3. Send a change ("make the header blue"). Preview updates, credits 8.
4. Force a failure (wrong V0_API_KEY once). Credits must be refunded.
5. Click Deploy. A live URL appears, `deployments` row saved, credits drop by 2.
6. Check `apps.vercel_project_id` is filled and that project exists in the Vercel account behind VERCEL_TOKEN. IF EMPTY, domains will not work: see the fallback in the notes.
7. Set a subdomain. Open `name.ROOT_DOMAIN`.
8. Add a custom domain you own, set the DNS records shown, click Check DNS.
9. Stripe test purchase: credits increase once. Resend the webhook from the Stripe dashboard: credits must NOT increase again.
10. Log in as a second user: they must not see the first user's apps.

## Masidy white-label notes
- All supplier calls go through `src/lib/providers/index.ts`. Swap a supplier there only.
- Users see Masidy subdomains only. Deploy auto-assigns `name-xxxx.ROOT_DOMAIN`.
- Preview iframes still load from the generator's own domain. Hiding it needs a proxy on your domain (not built).
- Admin: set `is_admin` for yourself (migration 4), then POST `/api/admin` to suspend/unsuspend apps or grant credits.

## LAUNCH BLOCKERS (get these in writing before taking real money)
1. Vercel: confirm reselling hosting under your brand is allowed (Vercel for Platforms, multi-project) and that the v0 API may be used for a customer-facing app builder. Use a paid Vercel plan, not Hobby.
2. Supabase: per-user backends under your brand need Supabase for Platforms (invite-only). Until approved, use Supabase only for Masidy's own accounts and data.
3. Publish Masidy Terms, Privacy Policy and an Acceptable Use Policy (phishing, malware, spam). Have a lawyer review.
4. Add a spending cap and alerts on every supplier account.

## Domains (Masidy flow)
- Every app gets `name-xxxx.masidy.app` automatically at deploy. The name `app` is reserved for Masidy's own dashboard.
- Custom domain: user adds it, a cron job (every 15 min) checks DNS and flips it live when verified. The Masidy address keeps working.
- Buy a domain: user searches, pays Masidy through Stripe (cost + DOMAIN_MARKUP_PERCENT). After payment the server registers it, attaches it to the app, and refunds automatically if anything fails.
- The initial Supabase migration creates the domain order table. Set CRON_SECRET (Vercel sends it to the cron route). `vercel.json` holds the schedule.
- VERIFY in `src/lib/registrar.ts`: price and purchase field names against https://openapi.vercel.sh/ and test one real purchase with a cheap domain.
- Decide your policy: who is the registrant, and can users transfer a bought domain out? Put it in your Terms.

## Keeping supplier names hidden from users (checklist)
Code already shows only "Masidy" in the UI, errors, and addresses. These need settings in each dashboard:
1. Login emails: Auth > SMTP Settings: use your own sender (e.g. no-reply@masidy.app) and edit the email templates so they say Masidy. Without this, the default sender name shows the database supplier.
2. Checkout: in Stripe Settings > Branding, set the Masidy name, logo, colors. Set the statement descriptor to MASIDY. The hosted checkout page still shows a small payments-provider footer; that cannot be removed. Domain/credit receipts: turn on Stripe emails with your branding or send your own.
3. DNS instructions: the verification records for custom domains come from the host and may contain the host's name (for example a record name or target). That text cannot be changed; keep the instructions generic (already done).
4. Preview iframe: loads from the generator's domain. Fix later with a proxy on a Masidy domain.
5. Generated code: scan and strip supplier names from comments, package names, and README text in generated files before showing them.
6. Public legal pages use provider categories only. Privacy laws may require a subprocessor list on request: keep a private one ready.

## Workspace features (v0-style)
The signed-in workspace has Home, Projects, Chats, Design Systems, and Templates navigation, project search, and a project list. Templates and design directions are prompt presets; saved/custom design-system management is not implemented.
Each project has Preview, Code (view and edit files), Chat (history), Versions (preview, restore as new app, publish a chosen version), and Share (download zip, push to GitHub, domains, environment variables, delete). The project toolbar's Settings shortcut opens Share.
Import (sidebar): zip upload, or a public GitHub repo URL.
The workspace subscribes to Postgres Changes on `public.apps` for the signed-in owner's rows and reloads the app list after changes and reconnects. Before enabling it in Supabase, confirm this is the project used by the deployment, add `apps` to the `supabase_realtime` publication, and ensure `apps` has an owner-scoped `SELECT` RLS policy. The subscription filter is not an authorization boundary. Generation status still polls the external generator because it only reaches Postgres when this app writes the resulting status.

GitHub setup
1. GitHub > Settings > Developer settings > OAuth Apps > New. Callback URL: `NEXT_PUBLIC_SITE_URL/api/github/callback`.
2. Put the Client ID and secret in env. Generate `GITHUB_TOKEN_KEY` with `openssl rand -base64 32`.
3. The initial Supabase migration creates the GitHub connections table.
Push creates a private repo `masidy-<app>` on first push, then commits a full snapshot each time. Two-way sync (GitHub changes flowing back) is NOT built.

VERIFY (names in `src/lib/v0.ts` come from the docs and are untested): findMessages, findVersions, getVersion (includeDefaultFiles), updateVersion, fork, init (files / repo), delete.

## Generation: async with live progress, stop and resume
Generation runs in the background. The page checks status every 2.5 seconds, shows Stop while working, and Resume after a failure. Failed runs are refunded automatically (a run over 10 minutes counts as failed). Stopped runs are not refunded. Real token streaming is not built; this is simpler and more reliable.
Quality picker: Fast (1 credit) or Best (3 credits). Set V0_MODEL_FAST / V0_MODEL_BEST to the model ids shown in the current API docs (leave blank for the default).
Image attachments (up to 3 PNG/JPG/WebP) are uploaded to the `attachments` bucket and passed with the prompt.
Environment variables per app are stored at the host, applied on the next deploy. Keys beginning with VERCEL are blocked.
VERIFY: `modelConfiguration`, `attachments`, `responseMode: 'async'` on sendMessage, `stop`, `resume`, and the env method names in `lib/vercel.ts`.

## Hiding suppliers: what the code does now
- Emails: templates in `emails/` link to YOUR domain (token_hash flow), not the database supplier's address. Paste them into Auth > Email Templates. Set Auth > SMTP to your own sender (no-reply@masidy.app) and add SPF/DKIM records for masidy.app. Set Auth > URL Configuration > Site URL to your Masidy URL.
- Browser traffic: `next.config.js` forwards `/sb/*` to the database, so the network tab shows your domain. (Replace next.config.ts with next.config.js.) Server-side admin calls are not visible to users.
- DNS instructions: Masidy-worded records from your own env: DOMAIN_CNAME_TARGET (create `domains.masidy.app` as a CNAME to the host's target in your DNS) and DOMAIN_APEX_IP (from the host's domain settings). TEST that a custom domain pointed at your CNAME verifies; if the host rejects CNAME chains, set DOMAIN_CNAME_TARGET to the host's own target and accept that name showing. A TXT record is only shown when the host demands one.
- Live preview proxy: previews load from `<token>.pv.masidy.app`. Needs: a wildcard domain `*.pv.masidy.app` added to THIS project's host, PREVIEW_UPSTREAM_SUFFIXES set to the generator's preview domain suffix (e.g. the host part after the dot), and `src/middleware.ts`. Without the env var, previews fall back to the raw address. Limits: no websockets (no hot reload), assets served from third hosts are not rewritten, and all preview traffic passes through your servers (bandwidth cost).
- Generated files: `src/lib/scrub.ts` renames the package, the generator meta tag, and names in comments and docs. It never touches imports, URLs or config, so files like `vercel.json` stay (needed for deploys).
- Checkout: set Masidy branding in Stripe settings, and ask Stripe about a custom checkout domain (e.g. pay.masidy.app). A processor footer and card form cannot be fully hidden.
