import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { createRateLimiter } from "./platform/rateLimit.js";
import { HttpError } from "./services/access.js";
import { getSupabase } from "./config/db.js";
import { logger } from "./platform/logger.js";

import authRoutes from "./routes/auth.js";
import accountsRoutes from "./modules/accounts/router.js";
import situationsRoutes from "./modules/situations/router.js";
import advocatesRoutes from "./modules/advocates/router.js";
import intakeRoutes from "./modules/intake/router.js";
import consultationsRoutes from "./modules/consultations/router.js";
import mattersRoutes from "./modules/matters/router.js";
import documentsRoutes from "./modules/documents/router.js";
import messagesRoutes from "./modules/messages/router.js";
import servicesRoutes from "./modules/services/router.js";
import paymentsRoutes, { paymentWebhook } from "./modules/payments/router.js";
import researchRoutes from "./modules/research/router.js";
import contractReviewRoutes from "./modules/contractreview/router.js";
import packRoutes from "./modules/pack/router.js";
import draftingRoutes from "./modules/drafting/router.js";
import askLearnRoutes from "./modules/learn/router.js";
import adminRoutes from "./modules/admin/router.js";
import founderRoutes from "./modules/founder/router.js";
import privacyRoutes from "./modules/privacy/router.js";
import caseLawRoutes from "./modules/caselaw/router.js";
import configRoutes from "./routes/config.js";
import complaintsRoutes from "./modules/complaints/router.js";
import legalAssistantRoutes from "./modules/assistant/router.js";

export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) sit in front of the app as a single reverse-proxy hop —
  // without this, req.ip resolves to the proxy's address for every request, which breaks
  // per-IP rate limiting (and makes express-rate-limit throw on the X-Forwarded-For
  // mismatch it detects). "1" trusts exactly one hop, not an open-ended chain.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // The SPA is served from this origin; it talks to Supabase (auth), Razorpay (checkout) and Google (OAuth).
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": ["'self'", "https://checkout.razorpay.com"],
          "frame-src": ["'self'", "https://api.razorpay.com", "https://meet.jit.si"],
          "connect-src": ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://api.razorpay.com", "https://lumberjack.razorpay.com"],
          "img-src": ["'self'", "data:", "https://*.googleusercontent.com", "https://*.supabase.co"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        },
      },
      crossOriginEmbedderPolicy: false,
      // Razorpay's checkout opens bank pages in popups that need window.opener.
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    })
  );

  const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
      credentials: true,
    })
  );

  // Razorpay's webhook signature covers the raw body, so it must be mounted before express.json().
  app.use("/api", paymentWebhook);

  app.use(express.json({ limit: "1mb" }));
  // Structured request logging, replacing morgan -- shares platform/logger.ts's pino instance
  // (and its PII redaction: auth headers, tokens, prompts) so req.log.error(...) calls below
  // and any other app-level logging land in the same stream with the same redaction rules.
  app.use(pinoHttp({ logger }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // Liveness: process is up, no dependency checks. Readiness: DB is actually reachable.
  // Unauthenticated and unmounted under /api by design — orchestrators probe these directly.
  app.get("/healthz", (req, res) => res.json({ ok: true }));
  app.get("/readyz", async (req, res) => {
    try {
      const { error } = await getSupabase().from("plans").select("id", { head: true, count: "exact" });
      if (error) throw error;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: "Database unreachable" });
    }
  });

  // Coarse per-IP backstop; individual routes add tighter per-user limits where money or abuse is at stake.
  app.use(
    "/api",
    createRateLimiter("rl:global:", { windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests — slow down." } })
  );

  const api = express.Router();
  api.use(configRoutes);
  api.use(authRoutes);
  api.use(caseLawRoutes);
  api.use(legalAssistantRoutes);
  api.use(accountsRoutes);
  api.use(situationsRoutes);
  api.use(advocatesRoutes);
  api.use(intakeRoutes);
  api.use(consultationsRoutes);
  api.use(mattersRoutes);
  api.use(documentsRoutes);
  api.use(messagesRoutes);
  api.use(servicesRoutes);
  api.use(paymentsRoutes);
  api.use(researchRoutes);
  api.use(contractReviewRoutes);
  api.use(packRoutes);
  api.use(draftingRoutes);
  api.use(askLearnRoutes);
  api.use(complaintsRoutes);
  api.use(adminRoutes);
  api.use(founderRoutes);
  api.use(privacyRoutes);
  app.use("/api", api);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    if (err?.name === "MulterError") {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? "File is too large (25 MB max)." : err.message });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
    const status = err.status || 500;
    // req.log is unset only for errors thrown before pino-http's own middleware runs (e.g. the
    // Razorpay webhook route, mounted earlier so its signature check sees the raw body).
    if (status >= 500) (req.log || logger).error(err);
    // Never leak database/driver internals for unexpected failures.
    const message = status >= 500 && !err.expose && !(err instanceof HttpError) ? "Something went wrong. Please try again." : err.message;
    const exposeCode = typeof err.code === "string" && /^[A-Z_]+$/.test(err.code) && (status < 500 || err.expose || err instanceof HttpError);
    res.status(status).json({ error: message, ...(exposeCode ? { code: err.code } : {}) });
  });

  return app;
}
