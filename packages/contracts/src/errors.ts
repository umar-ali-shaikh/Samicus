/**
 * Shared error shape, ported from apps/api's existing convention (services/access.js's
 * HttpError + app.js's error handler): a status code, an optional all-caps machine-readable
 * code, and an "expose" flag so 5xx internals are never leaked to the client by default.
 *
 * Codes already in use across apps/api (do not rename without updating the call sites):
 * NOT_AUTHENTICATED, EMAIL_NOT_VERIFIED, RAG_DISABLED, PAYMENTS_DISABLED.
 * This list grows as each domain is ported in Phase 3 -- it is intentionally not exhaustive yet.
 */
export const KNOWN_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "EMAIL_NOT_VERIFIED",
  "RAG_DISABLED",
  "PAYMENTS_DISABLED",
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

/** Open union: autocompletes known codes but allows new ones as domains are ported. */
export type ErrorCode = KnownErrorCode | (string & {});

export interface AppErrorOptions {
  code?: ErrorCode;
  /** When true, the error handler may return `message` (and `code`) to the client even for 5xx. */
  expose?: boolean;
  cause?: unknown;
}

/** Mirrors apps/api/src/services/access.js's HttpError. Safe to throw from any layer. */
export class AppError extends Error {
  readonly status: number;
  readonly code?: ErrorCode;
  readonly expose: boolean;

  constructor(status: number, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.status = status;
    this.code = options.code;
    this.expose = options.expose ?? status < 500;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
