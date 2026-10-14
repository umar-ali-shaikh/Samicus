/**
 * Shared ioredis client, lazily created like config/db.js's getSupabase() singleton. Redis is
 * optional: when REDIS_URL is unset, getRedisClient() returns null and callers (platform/cache,
 * platform/rateLimit) fall back to their in-process implementations -- the app keeps working
 * on a single instance exactly as it did before Redis was introduced, per
 * docs/MASTER-PROMPT.md's "the app must keep working when an optional integration is
 * unconfigured" rule. When it IS set (e.g. the docker-compose "redis" service), every
 * horizontally-scaled instance shares the same cache/rate-limit state.
 */
import { Redis } from "ioredis";
import { env } from "../config/env.js";

let client: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  if (client !== undefined) return client;
  if (!env.REDIS_URL) {
    client = null;
    return client;
  }
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    // Reconnect quietly in the background rather than rejecting in-flight commands forever.
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  });
  client.on("error", (err: Error) => console.error("Redis connection error:", err.message));
  return client;
}
