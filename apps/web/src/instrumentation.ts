/**
 * Runs once at server boot (Next.js instrumentation hook). Importing env here forces the
 * @t3-oss/env-nextjs validation to run eagerly, so a missing/malformed var crashes startup
 * immediately instead of failing lazily on the first request that happens to touch it.
 */
export async function register() {
  await import("./server/env");
}
