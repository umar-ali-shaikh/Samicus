/**
 * pino-based structured logger, replacing morgan once wired in (Phase 2+). Not yet adopted
 * by app.js -- morgan stays in place until the module-by-module conversion reaches it.
 * PII redaction paths cover the fields today's console.error(err) calls could otherwise leak
 * (see docs/MASTER-PROMPT.md's "never log prompts containing client matter facts").
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
