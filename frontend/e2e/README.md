# UI tests (Playwright, no live backend needed)

`smoke.mjs` renders every screen for each role (client, advocate, admin, founder) in a real browser;
`flows.mjs` drives the interactive paths (Google/email sign-in, email verification, booking wizard,
urgent help, drafting, research, assistant, messaging) and checks the payloads the UI sends.

Both run against the **built** app with the network stubbed (`fixtures.mjs` mirrors the API's response
shapes, Supabase endpoints are intercepted), so they need no Supabase project, Qdrant or API keys.

```bash
npm run e2e -w frontend
```

Requires `playwright` (`npm i -D playwright` or a global install; set `PLAYWRIGHT_MODULE` to its path)
and a Chromium binary (`CHROMIUM_PATH`, default `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
