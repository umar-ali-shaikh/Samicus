/**
 * Malware scanning for uploads via ClamAV's clamd daemon (free, self-hosted -- see
 * docker-compose.yml's `clamav` service). Talks clamd's INSTREAM protocol over plain TCP with
 * node:net, so no extra dependency. Optional like Redis/Qdrant: with CLAMAV_HOST unset, or if
 * clamd can't be reached, scanBuffer() returns "unscanned" and the upload keeps the honest
 * `pending` status it always had -- it never claims "clean" without a real scan.
 *
 * Protocol: "zINSTREAM\0", then chunks of [4-byte big-endian length][bytes], then a zero-length
 * chunk; clamd answers "stream: OK" or "stream: <Signature> FOUND" (NUL-terminated).
 */
import net from "node:net";
import { logger } from "./logger.js";

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string } | { status: "unscanned"; reason: string };

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 30_000;

export function isClamavConfigured(): boolean {
  return Boolean(process.env.CLAMAV_HOST);
}

export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return { status: "unscanned", reason: "CLAMAV_HOST not set" };
  const port = Number(process.env.CLAMAV_PORT || 3310);

  try {
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const parts: Buffer[] = [];
      socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error(`clamd timed out after ${TIMEOUT_MS}ms`)));
      socket.on("error", reject);
      socket.on("data", (d) => parts.push(d));
      socket.on("end", () => resolve(Buffer.concat(parts).toString("utf8").replace(/\0/g, "").trim()));
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let i = 0; i < buffer.length; i += CHUNK) {
          const chunk = buffer.subarray(i, i + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length, 0);
          socket.write(len);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
    });

    if (/^stream: OK$/.test(reply)) return { status: "clean" };
    const found = /^stream: (.+) FOUND$/.exec(reply);
    if (found) return { status: "infected", signature: found[1] ?? "unknown" };
    // e.g. "INSTREAM size limit exceeded. ERROR" -- a scanner error is not a verdict.
    logger.warn({ reply }, "clamd returned an unexpected reply; upload left unscanned");
    return { status: "unscanned", reason: reply || "empty reply" };
  } catch (err) {
    logger.warn({ err }, "clamd unreachable; upload left unscanned");
    return { status: "unscanned", reason: err instanceof Error ? err.message : String(err) };
  }
}
