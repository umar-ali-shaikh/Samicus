// `npm start` at the repo root. One-service deploy (e.g. a single Render web service): runs apps/api on an internal port and
// apps/web on the platform's public $PORT, with apps/web pointed at the API over localhost. The
// browser never calls apps/api directly (apps/web's server actions do), so nothing else needs to
// be public -- except Razorpay's webhook, which apps/web forwards (app/api/payments/webhook).
// The two-service setup in docs/SETUP.md §6 still works and is unchanged; this is for hosts where
// you only have one service. No dependencies -- plain node:child_process.
//
// If either process exits, the other is stopped and this exits non-zero, so the platform restarts
// the whole service instead of leaving a half-working site up.
import { spawn } from "node:child_process";

const PUBLIC_PORT = process.env.PORT || "3000";
// 4001, not apps/api's usual 4000: a PORT=4000 copied from .env.example into the host's env would
// otherwise put both processes on the same port.
const API_PORT = process.env.API_PORT || "4001";
if (API_PORT === PUBLIC_PORT) {
  console.error(`[render-start] API_PORT and PORT are both ${PUBLIC_PORT} -- set API_PORT to a different internal port`);
  process.exit(1);
}

// Always the internal API, even if API_INTERNAL_URL is set in the host's env (e.g. copied from
// .env.example as localhost:4000) -- in one-service mode there is only one right answer.
const API_INTERNAL_URL = `http://127.0.0.1:${API_PORT}`;

function run(name, args, env) {
  const child = spawn("npm", args, { stdio: "inherit", env: { ...process.env, ...env } });
  child.on("exit", (code, signal) => {
    console.error(`[render-start] ${name} exited (code ${code}, signal ${signal}) -- stopping the service`);
    shutdown(code || 1);
  });
  return child;
}

const children = [
  // The API reads PORT itself, so give it the internal port explicitly (not the public one).
  run("api", ["run", "start", "-w", "apps/api"], { PORT: API_PORT }),
  run("web", ["run", "start", "-w", "apps/web", "--", "-p", PUBLIC_PORT], { API_INTERNAL_URL }),
];

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 5000).unref();
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => shutdown(0));

console.log(`[render-start] web on :${PUBLIC_PORT}, api on :${API_PORT} (web -> ${API_INTERNAL_URL})`);
