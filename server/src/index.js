import "dotenv/config";

import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
dns.setDefaultResultOrder("ipv4first");

import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { PracticeArea } from "./models/index.js";
import { seedAll } from "./seed/seed.js";

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();

  // The default in-memory MongoDB is process-local and starts empty every run — seed it
  // automatically so `npm run dev` works standalone. Harmless no-op against a persistent
  // MONGODB_URI that has already been seeded (every seed write is an upsert).
  if ((await PracticeArea.countDocuments()) === 0) {
    await seedAll();
  }

  const app = createApp();
  app.listen(PORT, () => console.log(`Samicus API listening on :${PORT}`));
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
