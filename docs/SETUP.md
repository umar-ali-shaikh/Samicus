# Setup guide

Everything below uses free tiers. You need three things: a **Supabase** project (database, auth,
file storage), a **Qdrant** cluster (vector search) and a **Google Cloud** OAuth client (Google sign-in).

## 1. Supabase

1. Create a project at <https://supabase.com>. Note **Project URL**, the **anon (public) key** and the
   **service_role key** (Project Settings → API). The service-role key is server-only.
2. SQL editor → paste and run `backend/src/db/schema.sql` once (fresh project).
   *Upgrading an older Vidhira database?* Run `backend/src/db/migrations/001_supabase_auth.sql`, then
   `002_security.sql`, then `003_web_source.sql` (adds the 'web' source for the Tavily fallback below).
   The schema ends by enabling row-level security with no policies: the public anon key can read
   nothing, so every request must go through the API.
3. **Authentication → Providers**
   * **Email**: enabled, **Confirm email = ON** (this is the email verification step; the API refuses
     unverified accounts).
   * **Google**: enabled with the client ID/secret from step 4.
4. **Authentication → URL Configuration**: set **Site URL** to your deployed origin and add
   `http://localhost:5173` (dev) and your production URL to **Redirect URLs**.
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
`GEMINI_API_KEY` the app still runs; the research library and contract review say they are not
enabled and the assistant falls back to live Indian Kanoon search.

## 4. Other keys

| Variable | Where from | Needed for |
|---|---|---|
| `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> (free) | embeddings (RAG) |
| `OPENROUTER_API_KEY` | <https://openrouter.ai> | assistant answers, contract review |
| `IK_API_TOKEN` | <https://api.indiankanoon.org> (paid per call) | live case-law search / assistant |
| `TAVILY_API_KEY` | <https://tavily.com> (free tier) | web-search fallback, see below (optional) |
| `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | <https://razorpay.com> | online payments (optional) |

### AI Legal Assistant evidence pipeline

`answerLegalQuestion` (`backend/src/services/legalAssistant.js`) tries sources in order, stopping
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
cp .env.example .env   # single file at the repo root, shared by backend/ and frontend/ — fill in the values above
npm run dev:full       # API :4000 + web :5173
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

## 6. Deploy (one service)

The Express server serves the built React app and the API from one origin.

```bash
npm install && npm run build   # build with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set
npm run start
```

On Render/Railway/Fly set the backend variables as environment variables, **and** the two `VITE_` variables
at *build* time. Point Razorpay's webhook at `https://<app>/api/payments/webhook` (event `payment.captured`).

## 7. Tests

```bash
npm test -w backend            # 99 tests: route authorization, RAG pipeline, slots, chunking, payments
npm run build -w frontend && node frontend/e2e/smoke.mjs   # see frontend/e2e/README.md
```
