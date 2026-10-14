// Deletes everything global-setup.ts created, in reverse creation order (FK-safe: later rows
// generally reference earlier ones, so deleting newest-first never trips a foreign key), then
// the 4 disposable auth users. Leaves the dev/staging Supabase project exactly as it was before
// this run, regardless of whether the tests themselves passed or failed.
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { SeedIds } from "./seedIds";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const SEED_FILE = path.join(__dirname, ".auth", "seed.json");

async function main() {
  if (!fs.existsSync(SEED_FILE)) {
    console.log("e2e global-teardown: no seed.json found (global-setup may have failed before writing it) -- nothing to clean up.");
    return;
  }
  const seed: SeedIds = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  let deleted = 0;
  for (const { table, match } of [...seed.rows].reverse()) {
    let query = admin.from(table).delete();
    for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
    const { error } = await query;
    const label = Object.entries(match).map(([k, v]) => `${k}=${v}`).join(",");
    if (error) console.error(`teardown: failed to delete ${table}/${label}: ${error.message}`);
    else deleted++;
  }

  let deletedUsers = 0;
  for (const authId of seed.authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(authId);
    if (error) console.error(`teardown: failed to delete auth user ${authId}: ${error.message}`);
    else deletedUsers++;
  }

  fs.rmSync(SEED_FILE, { force: true });
  console.log(`e2e global-teardown: deleted ${deleted}/${seed.rows.length} rows, ${deletedUsers}/${seed.authUserIds.length} auth users.`);
}

export default main;
