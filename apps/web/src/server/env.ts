import "server-only";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Fails loudly at boot (throws) if a required var is missing or malformed -- see
 * docs/MASTER-PROMPT.md's security requirements: only NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY may reach the browser bundle; every other secret
 * (service-role key, OpenRouter/Razorpay/etc.) lives only in apps/api's/apps/worker's env.
 *
 * API_INTERNAL_URL is new in this target architecture (not an existing env var name):
 * the private-network hostname apps/web uses to reach apps/api server-to-server, per
 * docs/architecture/01-target-architecture.md section 2/4. Defaults to localhost for dev.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_INTERNAL_URL: z.string().url().default("http://localhost:4000"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    API_INTERNAL_URL: process.env.API_INTERNAL_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});
