import "dotenv/config";

import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
dns.setDefaultResultOrder("ipv4first");

import { createApp } from "./app.js";
import { getSupabase } from "./config/db.js";
import { seedAll } from "./seed/seed.js";

const PORT = process.env.PORT || 4000;

async function main() {
  const supabase = getSupabase();

  // Supabase/Postgres is persistent (unlike the old in-memory-Mongo dev fallback), so
  // this only seeds a genuinely empty database. Harmless no-op otherwise — every seed
  // write is an upsert.
  const { count, error } = await supabase.from("practice_areas").select("*", { count: "exact", head: true });
  if (error) throw error;
  if (count === 0) {
    await seedAll();
  }

  const app = createApp();
  app.listen(PORT, () => console.log(`Samicus API listening on :${PORT}`));
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
