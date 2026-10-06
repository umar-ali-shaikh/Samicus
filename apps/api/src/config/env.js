// Single shared .env lives at the repo root (not inside apps/api/ or frontend/) so both
// apps read the same file. Loaded explicitly by path since cwd varies (npm run dev from
// apps/api/, or the root workspace scripts).
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env") });
