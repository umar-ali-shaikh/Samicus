import "server-only";
import { headers } from "next/headers";

/** Current request's origin, derived from headers rather than a hardcoded env var so it works
 * correctly in any environment (dev, preview, prod) and behind a reverse proxy. */
export async function currentOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  return `${proto}://${host}`;
}
