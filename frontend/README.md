# Samicus frontend

React 19 + Vite. All data comes from the API (`/api`, see `src/lib/api.js`); sign-in is Supabase Auth
(`src/lib/supabase.js`, `src/auth/`). Server state is cached with TanStack Query (`src/api/hooks.js`).

```bash
cp .env.example .env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173 (expects the API on :4000)
npm run build            # → dist/ (served by the backend in production)
npm run lint
npm run e2e              # browser tests with a stubbed backend, see e2e/README.md
```

Layout: `auth/` (login, verify email, reset password) · `shell/` (nav, role routing) · `screens/` ·
`modals/` · `components/` (UI primitives, forms) · `state/UIState.jsx` (hash routing, toasts, modals).
The signed-in user's role decides the experience: client, advocate, admin or founder.
