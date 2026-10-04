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
| Embeddings | **Google Gemini** `gemini-embedding-001` | Free tier |
| LLM | **OpenRouter** (free-tier models by default) | Query understanding, grounded answers, contract review |
| Legal sources | **Indian Kanoon** API | Paid per call — the knowledge base avoids repeat calls |
| Payments | **Razorpay** (optional) | Pay-per-transaction; the UI says so honestly when it is off |
| Video | **Jitsi Meet** | No account needed |
| App | React 19 + Vite (`frontend/`), Node 20+ / Express 5 (`backend/`), npm workspaces | One process serves both |

MongoDB is intentionally not used — see [docs/RAG.md](docs/RAG.md).

## What's in it

* **Accounts & trust** — Google/email sign-in with verified email; personal, family and business accounts with
  members; advocate onboarding with admin verification of Bar Council enrolment before anyone is listed.
* **Find & book** — verified-advocate directory, neutral ranking (never paid), real availability slots with
  no double-booking, a 10-step booking wizard, instant "Talk now" and urgent flows with a real conflict check
  and consent before facts are shared.
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
cp .env.example .env   # single shared file: SUPABASE_*, QDRANT_*, GEMINI_API_KEY, OPENROUTER_API_KEY, IK_API_TOKEN, VITE_*
# run backend/src/db/schema.sql once in the Supabase SQL editor
npm run dev:full                         # API :4000 + web :5173
```

```bash
npm run build && npm run start           # single-process production run (PORT, default 4000)
npm test -w backend                      # API + RAG tests
npm run e2e -w frontend                  # browser tests, see frontend/e2e/README.md
```

## Project structure

```
frontend/   React app — auth/, screens/, modals/, api/ (react-query hooks), lib/ (api + supabase clients)
backend/
  src/routes/            HTTP handlers (every route authorises; ids from the client are never trusted)
  src/services/          access.js (authorization helpers), slots, matching, drafting, contract review, analytics
  src/services/rag/      qdrant.js, chunk.js, ingest.js, retrieve.js, clauses.js
  src/db/                schema.sql (fresh install) + migrations/ (upgrades, incl. RLS lock-down)
  src/test/              in-memory Supabase stand-in used by the route + RAG tests
docs/       SETUP.md, RAG.md, legal-assistant-spec.md
```

## Honest limits

* **Payments** need a Razorpay account; without keys bookings are held and settled directly with the advocate.
* **Uploaded files are not virus-scanned** (marked `pending`, never "clean"); contract review reads text PDFs,
  DOCX and TXT only — there is no OCR.
* **e-Stamping** is not integrated (the drafting flow says so).
* **No email/SMS notifications** yet — updates are in-app (messages poll every few seconds).
* The **document templates, clause rationale notes and any pack-compliance rulesets are legal content**:
  have a qualified advocate review them before launch.
* Review **Indian Kanoon's API terms** for the persistent passage index the RAG pipeline builds; set
  `QDRANT_URL` empty to turn it off.
