/**
 * Redis is now approved (Phase 4 sign-off): createRateLimiter() below is what every router
 * should call instead of express-rate-limit's rateLimit() directly -- it picks a real
 * RedisStore (rate-limit-redis, shared across horizontally-scaled instances) when REDIS_URL is
 * configured, and falls back to express-rate-limit's own built-in in-memory store otherwise
 * (same per-instance behaviour as before Redis was introduced).
 */
import { rateLimit, type Options as RateLimitOptions } from "express-rate-limit";
import { RedisStore, type SendCommandFn } from "rate-limit-redis";
import { getRedisClient } from "./redis.js";

/**
 * Every router's rate limiter should be built with this instead of calling express-rate-limit's
 * rateLimit() directly, so the Redis/memory choice is made in exactly one place. `prefix`
 * namespaces this limiter's keys in Redis (shared across all instances) -- give each call site
 * a distinct one (e.g. "rl:login:", "rl:draft-review:") so unrelated limiters never collide.
 */
export function createRateLimiter(prefix: string, options: Partial<RateLimitOptions>): ReturnType<typeof rateLimit> {
  const client = getRedisClient();
  // ioredis's .call() is typed with overloads keyed to specific known commands, which doesn't
  // line up with rate-limit-redis's generic "any raw command" SendCommandFn -- both sides are
  // correct at runtime (this is the library's own documented integration pattern), the mismatch
  // is purely in how precisely each package's types model a raw Redis command.
  const sendCommand = client ? ((...args: string[]) => client.call(args[0] as string, ...args.slice(1)) as ReturnType<SendCommandFn>) : undefined;
  const store = sendCommand ? new RedisStore({ prefix, sendCommand }) : undefined;
  return rateLimit({ ...options, ...(store ? { store } : {}) } as RateLimitOptions);
}
