import { PgBoss } from "pg-boss";
import { env } from "./config/env.js";

let boss: PgBoss | null = null;

// Lazily created, memoized singleton -- same pattern as config/db.ts's getSupabase().
export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss(env.DATABASE_URL);
    boss.on("error", (err) => console.error("pg-boss error:", err.message));
  }
  return boss;
}
