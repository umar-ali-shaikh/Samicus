/**
 * pino-based structured logger, wired into app.js via pino-http (replacing morgan) for
 * request logging, and used directly for the global error handler's err logging. PII
 * redaction paths cover the fields a bare console.error(err) could otherwise leak (see
 * docs/MASTER-PROMPT.md's "never log prompts containing client matter facts").
 */
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["req.headers.authorization", "*.password", "*.token", "*.accessToken", "*.prompt"],
    censor: "[redacted]",
  },
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});
