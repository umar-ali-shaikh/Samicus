# Setup guide

Everything below uses free tiers. You need three things: a **Supabase** project (database, auth,
file storage), a **Qdrant** cluster (vector search) and a **Google Cloud** OAuth client (Google sign-in).

## 1. Supabase

1. Create a project at <https://supabase.com>. Note **Project URL**, the **anon (public) key** and the
   **service_role key** (Project Settings → API). The service-role key is server-only.
2. SQL editor → paste and run `apps/api/src/db/schema.sql` once (fresh project).
   *Upgrading an older Vidhira database?* Run every file in `apps/api/src/db/migrations/` **in order**
   that you haven't already applied — they're numbered and idempotent (`if not exists` /
   `add column if not exists`) — safe to re-run.
   The server logs a startup warning naming any expected table it can't find (see
   `apps/api/src/index.js`'s `EXPECTED_MIGRATION_TABLES` check), so check the server logs after
   upgrading if a feature 500s.
   The schema ends by enabling row-level security with no policies: the public anon key can read
   nothing, so every request must go through the API.
3. **Authentication → Providers**
   * **Email**: enabled, **Confirm email = ON** (this is the email verification step; the API refuses
     unverified accounts).
   * **Google**: enabled with the client ID/secret from step 4.
4. **Authentication → URL Configuration**: set **Site URL** to your deployed origin and add
   `http://localhost:3000` (dev) and your production URL to **Redirect URLs**.
5. **Email delivery.** Supabase's built-in mailer is limited to a handful of emails per hour — fine for
   testing, not for launch. Add custom SMTP (Authentication → SMTP Settings); Resend, Brevo and
   Amazon SES all have free tiers.
6. Storage: nothing to do — the API creates the private `documents` bucket on first boot.

## 2. Google OAuth 2.0

1. <https://console.cloud.google.com> → APIs & Services → **OAuth consent screen** (External), add your
   support email and your domain.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   * Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Paste the client ID and secret into Supabase → Authentication → Providers → Google.

Google accounts arrive with a verified email, so they skip the verification screen.

## 3. Qdrant

* **Cloud (easiest):** <https://cloud.qdrant.io> → create a free cluster → copy the cluster URL and an API key.
* **Self-hosted:** `docker run -p 6333:6333 -v qdrant_data:/qdrant/storage qdrant/qdrant` and use
  `QDRANT_URL=http://localhost:6333` (no API key).

Collections and payload indexes are created automatically on first use. Without `QDRANT_URL` and
`OPENROUTER_API_KEY` the app still runs; the research library and contract review say they are not
enabled and the assistant falls back to live Indian Kanoon search.

## 4. Other keys

| Variable | Where from | Needed for |
|---|---|---|
| `OPENROUTER_API_KEY` | <https://openrouter.ai> | assistant answers, contract review, embeddings (RAG) |
| `IK_API_TOKEN` | <https://api.indiankanoon.org> (paid per call) | live case-law search / assistant |
| `TAVILY_API_KEY` | <https://tavily.com> (free tier) | web-search fallback, see below (optional) |
| `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | <https://razorpay.com> | online payments (optional) |
| `LLM_PROVIDER` + `ANTHROPIC_API_KEY` | <https://platform.claude.com> | use Claude instead of OpenRouter for chat (optional; embeddings stay on OpenRouter) |
| `DOCUMENT_OCR=anthropic` (+ `ANTHROPIC_API_KEY`) | <https://platform.claude.com> | OCR for scanned PDFs in contract review (optional, opt-in; sends the pages to Anthropic) |
| `CLAMAV_HOST` (+ `CLAMAV_PORT`) | self-hosted ClamAV — `docker compose up` includes one | malware-scan uploads before storing them (optional; unscanned uploads stay `pending`) |

### AI Legal Assistant evidence pipeline

`answerLegalQuestion` (`apps/api/src/services/legalAssistant.js`) tries sources in order, stopping
as soon as it has enough: the knowledge base (Qdrant) first, then a live Indian Kanoon search if
that's thin, then Tavily — restricted to a trusted government/legal-aid domain allowlist — if
Indian Kanoon alone still doesn't cover practical details (procedure, helplines, forms, time
limits). Whatever Indian Kanoon or Tavily turned up gets written back into the knowledge base in
the background after the answer is sent, so the same question is cheaper and faster next time.
Every stage degrades gracefully — a missing `TAVILY_API_KEY`, or any stage failing outright, just
skips to the next one rather than breaking the answer.

## 5. Configure and run

```bash
npm install
cp .env.example .env   # repo-root file, read by apps/api + apps/worker — fill in the values above
# apps/web reads its own apps/web/.env.local (Next.js convention, not the root .env) — create it
# with the NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / API_INTERNAL_URL values
# from .env.example's "apps/web (Next.js)" section.
npm run dev:full       # apps/api :4000 + apps/web :3000
```

First boot seeds only the **reference catalogues** (practice areas, the situation picker and the
document templates with their clause library). There is no demo data: advocates, matters, messages and
analytics all come from real people using the app.

### Roles

* Everyone starts as a **client**. A user can **apply as an advocate** from Profile; they stay hidden
  until an admin verifies their Bar Council enrolment.
* **Admins and the founder** are set by email allow-list — `ADMIN_EMAILS` / `FOUNDER_EMAILS` in
  the root `.env` — and only for an address Supabase has verified. Roles are never settable from the client.

### Admin checklist after launch

1. Sign in with an `ADMIN_EMAILS` account → **Catalogue & rules**: add your fixed-fee **services**,
   publish reviewed **guides**, and (if you offer pack compliance) a **ruleset** prepared by a compliance advocate.
2. **Verification queue**: approve advocates after checking their enrolment against the Bar Council roll.
3. **Moderation**: publish public questions and advocate answers.
4. Seed the knowledge base by using the AI assistant on real questions (see `docs/RAG.md`).

## 6. Deploy

### One service (e.g. Render) -- `npm start`

The root `npm start` runs **both** apps in one process group (`scripts/render-start.mjs`):
`apps/web` on the platform's `$PORT`, `apps/api` on an internal port (`API_PORT`, default
`4001`), with `apps/web` pointed at it over `127.0.0.1`. The browser never calls `apps/api`
directly, so it needs no public URL; the one exception, Razorpay's webhook, is forwarded by
`apps/web` (`/api/payments/webhook` on the web host). If either process exits, both are stopped
so the platform restarts the service.

Render settings for this mode (`render.yaml` has the same as a Blueprint):

| Setting | Value |
|---|---|
| Root Directory | *(empty -- repo root)* |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Health Check Path | `/login` (`/` redirects there) |
| Node | 22 (from `.nvmrc` / `engines`; or env `NODE_VERSION=22`) |
| Env | everything from `.env.example` you use -- **but don't set `PORT`, `API_PORT` or `API_INTERNAL_URL`**: Render provides `PORT`, and the script sets the other two. `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` must be present at build time. `CLIENT_ORIGIN` = the service's own URL. |

Razorpay's webhook then points at `https://<service-host>/api/payments/webhook`.

### Two services

`apps/web` (Next.js) and `apps/api` (Express) deploy as two separate services/origins —
`apps/web`'s server actions call `apps/api` over `API_INTERNAL_URL` (private network), and the
browser never talks to `apps/api` directly.

```bash
# apps/api — no build step, runs TypeScript directly via tsx
npm install
npm run start -w apps/api   # reads the root .env (or `npm run start:api` from the root)

# apps/web
npm run build -w apps/web   # NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set at *build* time
npm run start -w apps/web
```

On Render/Railway/Fly/Vercel, set `apps/api`'s environment variables on that service, and
`apps/web`'s `NEXT_PUBLIC_*` + `API_INTERNAL_URL` on its own service (Vercel: Next.js's native
target). Point Razorpay's webhook at `https://<apps-api-host>/api/payments/webhook`
(event `payment.captured`), and `apps/api`'s `CLIENT_ORIGIN` at `apps/web`'s public origin.

If a worker is needed (RAG reindex/reembed/reprocess jobs), deploy `apps/worker` as a third
service with `DATABASE_URL` set (direct Postgres connection, for `pg-boss` — distinct from
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, which hit Supabase's REST API).

## 7. Tests

```bash
npm test -w apps/api     # route authorization, RAG pipeline, slots, chunking, payments
npm run e2e -w apps/web  # Playwright + axe-core smoke suite against a REAL backend — see apps/web/e2e/README.md
                          # (never point this at a production Supabase project)
```
