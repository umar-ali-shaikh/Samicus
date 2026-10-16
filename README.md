# Vidhira

A legal-services platform for Indian law — find a verified advocate, book or talk to one now, research Indian
law with cited answers, draft and review contracts, and track matters from intake to resolution.

**Nothing in the app is demo data.** Advocates, matters, messages, documents and analytics all come from real
people using it; the only seeded rows are reference catalogues (practice areas, the situation picker and the
document templates with their clause library).

## Stack — chosen to be budget-friendly

| Concern | Choice | Notes |
|---|---|---|
| Sign-in | **Supabase Auth** — Google OAuth 2.0 and email/password, **email verification required** | Free; Google accounts arrive pre-verified |
| Relational data + files | **Supabase** Postgres + private Storage bucket | Row-level security denies the public key everything; only the API touches data |
| Vector search (RAG) | **Qdrant** (Cloud free tier or self-hosted) | 768-d, int8-quantised, payload on disk |
| Embeddings | **OpenRouter** `sentence-transformers/all-mpnet-base-v2` | Paid per call, sub-cent per request |
| LLM | **OpenRouter** (paid models) by default, or **Claude** via `LLM_PROVIDER=anthropic` | Query understanding, grounded answers, contract review — one switch in `apps/api/src/services/llm.js` |
| Legal sources | **Indian Kanoon** API | Paid per call — the knowledge base avoids repeat calls |
| Web fallback | **Tavily** (optional) | Government/legal-aid domain allowlist only; skipped when `TAVILY_API_KEY` is blank |
| Cache + rate limits | **Redis** (optional) | Shared across instances when `REDIS_URL` is set; in-process otherwise |
| Background jobs | **pg-boss** on Postgres (`DATABASE_URL`) | `apps/worker` — RAG ingest/reindex/re-embed |
| Payments | **Razorpay** (optional) | Pay-per-transaction; the UI says so honestly when it is off |
| Video | **Jitsi Meet** | No account needed |
| App | Next.js 16 (`apps/web/`), Node 20+ / Express 5 (`apps/api/`), npm workspaces | Two services; `apps/web` calls `apps/api` server-to-server |

MongoDB is intentionally not used — see [docs/RAG.md](docs/RAG.md).

## What's in it

* **Accounts & trust** — Google/email sign-in with verified email; personal, family and business accounts with
  members; advocate onboarding with admin verification of Bar Council enrolment before anyone is listed.
* **Find & book** — verified-advocate directory, neutral ranking (never paid), real availability slots with
  no double-booking, a 9-step booking wizard, and instant "Talk now" with real matching, a conflict check
  and consent before facts are shared. (The API also has an urgent-request endpoint, but no urgent-help
  screen is built in `apps/web`.)
* **Consultations** — Jitsi rooms that open 15 minutes before the start, notes, ratings, convert-to-matter.
* **Matters** — timeline, tasks, hearings, fee proposals the client must accept, itemised invoices
  (professional / government / platform fee separate), access grants, secure per-matter messaging.
* **Documents** — private storage, signed download links, share only with advocates you work with.
* **AI legal assistant + research library (RAG)** — passage-level retrieval from Qdrant, live Indian Kanoon
  search only when the knowledge base can't answer; every answer cited. See [docs/RAG.md](docs/RAG.md).
* **Drafting & contract review** — templates with clause library, live preview, DOCX/PDF download, advocate
  review; contract review compares each clause with a balanced baseline via retrieval.
* **Back office** — verification queue, moderation, service orders, catalogue/guides/rulesets, complaints, and a
  founder Command Centre whose every figure is computed from live data.

## Setup

See **[docs/SETUP.md](docs/SETUP.md)** for Supabase, Google OAuth, Qdrant and deployment. Short version:

```bash
npm install
cp .env.example .env   # repo-root file: SUPABASE_*, QDRANT_*, OPENROUTER_API_KEY, IK_API_TOKEN
# apps/web reads its own apps/web/.env.local (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, API_INTERNAL_URL)
# run apps/api/src/db/schema.sql once in the Supabase SQL editor
npm run dev:full                         # apps/api :4000 + apps/web :3000
```

```bash
npm run start -w apps/api && npm run build -w apps/web && npm run start -w apps/web  # two services
npm test -w apps/api                     # API + RAG tests
npm run e2e -w apps/web                  # Playwright + axe-core smoke + flow suites (real backend; 3 specs make
                                         # metered AI/Indian Kanoon calls), see apps/web/e2e/README.md
```

## Project structure

```
apps/web/   Next.js App Router — auth, every screen, server actions that call apps/api
apps/api/
  src/modules/           one dir per domain (accounts, advocates, matters, drafting, ...): router + service
  src/services/          access.js (authorization helpers), slots, matching, contract review, analytics
  src/db/                schema.sql (fresh install) + migrations/ (upgrades, incl. RLS lock-down)
  src/test/              in-memory Supabase stand-in used by the module + RAG tests
apps/worker/  pg-boss job processor — RAG reindex/reembed-all/reprocess queues
packages/rag/       shared RAG package — ingest, retrieve, clauses, chunk, embeddings, qdrant
packages/contracts/ Zod DTOs shared by apps/api and apps/web
docs/       SETUP.md, RAG.md, legal-assistant-spec.md, architecture/ (migration docs)
```

## Honest limits

* **Payments** need a Razorpay account; without keys bookings are held and settled directly with the advocate.
* **Virus scanning needs ClamAV.** With `CLAMAV_HOST` set (docker compose runs one), uploads are scanned before
  they're stored and infected files are refused; without it, uploads are marked `pending`, never "clean".
  Contract review reads text PDFs, DOCX and TXT; scanned PDFs need OCR, which is opt-in
  (`DOCUMENT_OCR=anthropic` — Claude transcribes the pages, a billed call per scan).
* **e-Stamping** is not integrated (the drafting flow says so).
* **No email/SMS notifications** yet — updates are in-app (messages poll every few seconds).
* The **document templates, clause rationale notes and any pack-compliance rulesets are legal content**:
  have a qualified advocate review them before launch.
* Review **Indian Kanoon's API terms** for the persistent passage index the RAG pipeline builds; set
  `QDRANT_URL` empty to turn it off.
