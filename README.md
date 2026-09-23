# Samicus

A legal-services platform for Indian law — client intake, lawyer matching, case law research, contract drafting/review, and an AI legal assistant grounded in Indian Kanoon sources.

## Stack

- **Client** (`client/`): React + Vite
- **Server** (`server/`): Node/Express + MongoDB (Mongoose)
- npm workspaces monorepo (`client`, `server`)

## Prerequisites

- Node.js 18+
- npm 9+
- A MongoDB URI (or leave unset — the server auto-starts an in-memory MongoDB for local dev)

## Setup

```bash
npm install
```

Copy `server/.env.example` to `server/.env` and fill in real values (see [Environment variables](#environment-variables)).

## Running locally

```bash
npm run dev        # client only, http://localhost:5173
npm run dev:full   # server (:4000) + client (:5173) together
npm run seed        # seed the database
```

The client expects the server at `http://localhost:4000` and the server expects the client's origin to match `CLIENT_ORIGIN` in `server/.env` (CORS). If either dev server picks a different port because the default is already in use, update the other side to match.

## Deploying (single service)

Frontend and backend ship as **one process on one port** — the Express server serves the built React app as static files and the API from the same origin, so there's nothing to deploy separately and no CORS to configure in production.

```bash
npm install
npm run build   # builds client/dist
npm run start   # serves client/dist + the API, both on PORT (default 4000)
```

Point your host's build command at `npm install && npm run build` and its start command at `npm run start`, with `server/.env` variables (see below) set in the platform's environment config. The client's API calls automatically switch to same-origin `/api` in production builds (`import.meta.env.DEV` is false) — no `VITE_API_BASE_URL` needed unless you deliberately split the frontend onto a different host from the API.

## Environment variables

Set in `server/.env` (never commit this file — it's git-ignored):

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string. If unset, an in-memory MongoDB is used automatically. |
| `PORT` | Server port (default `4000`). |
| `JWT_SECRET` | Secret for signing auth JWTs. |
| `DEV_OTP` | Fixed OTP accepted for every phone number in dev (mocked SMS). |
| `CLIENT_ORIGIN` | Allowed CORS origin for the client dev server. |
| `IK_API_TOKEN` | Indian Kanoon API token — powers case law search and the AI Legal Assistant. Costs money per call. |
| `OPENROUTER_API_KEY` | OpenRouter API key — powers LLM calls (query understanding + answer generation). |
| `OPENROUTER_MODEL` | OpenRouter model slug. Defaults to a free-tier model; check [openrouter.ai/models](https://openrouter.ai/models) if it stops working (free slugs get retired). |
| `GEMINI_API_KEY` | Optional. Google Gemini API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey), free, no credit card) — powers semantic embedding re-ranking of AI Legal Assistant evidence. Unset = falls back to a local, free TF-IDF ranker automatically. |
| `GEMINI_EMBEDDING_MODEL` | Optional. Gemini embedding model slug, only used if `GEMINI_API_KEY` is set. Defaults to `gemini-embedding-001`. |

## Project structure

```
client/   React app (screens, components, API client)
server/   Express API (routes, controllers, models, services)
```

Server services of note:
- `services/indianKanoon.js` — Indian Kanoon API client (search, doc fetch, fragments), cached.
- `services/openRouter.js` — shared OpenRouter chat-completions client.
- `services/legalAssistant.js` — the RAG pipeline behind the AI Legal Assistant (query understanding → Indian Kanoon retrieval → grounded, cited answer generation).
