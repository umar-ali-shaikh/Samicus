import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { HttpError } from "./services/access.js";

import authRoutes from "./routes/auth.js";
import accountsRoutes from "./routes/accounts.js";
import situationsRoutes from "./routes/situations.js";
import advocatesRoutes from "./routes/advocates.js";
import intakeRoutes from "./routes/intake.js";
import consultationsRoutes from "./routes/consultations.js";
import mattersRoutes from "./routes/matters.js";
import documentsRoutes from "./routes/documents.js";
import messagesRoutes from "./routes/messages.js";
import servicesRoutes from "./routes/services.js";
import paymentsRoutes, { paymentWebhook } from "./routes/payments.js";
import researchRoutes from "./routes/research.js";
import contractReviewRoutes from "./routes/contractReview.js";
import packRoutes from "./routes/pack.js";
import draftingRoutes from "./routes/drafting.js";
import askLearnRoutes from "./routes/askLearn.js";
import adminRoutes, { resubmitRouter } from "./routes/admin.js";
import founderRoutes from "./routes/founder.js";
import privacyRoutes from "./routes/privacy.js";
import indianKanoonRoutes from "./routes/indianKanoon.js";
import configRoutes from "./routes/config.js";
import complaintsRoutes from "./routes/complaints.js";
import legalAssistantRoutes from "./routes/legalAssistant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../../frontend/dist");

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
          "connect-src": ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://lumberjack.razorpay.com"],
          "img-src": ["'self'", "data:", "https://*.googleusercontent.com", "https://*.supabase.co"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
      credentials: true,
    })
  );

  // Razorpay's webhook signature covers the raw body, so it must be mounted before express.json().
  app.use("/api", paymentWebhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // Coarse per-IP backstop; individual routes add tighter per-user limits where money or abuse is at stake.
  app.use(
    "/api",
    rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests — slow down." } })
  );

  const api = express.Router();
  api.use(configRoutes);
  api.use(authRoutes);
  api.use(indianKanoonRoutes);
  api.use(legalAssistantRoutes);
  api.use(accountsRoutes);
  api.use(situationsRoutes);
  api.use(advocatesRoutes);
  api.use(resubmitRouter);
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

  // Unknown API paths are a JSON 404, never the SPA shell.
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // Serves the built client (frontend/dist) so frontend + backend deploy as one
  // process/origin. No-ops harmlessly if the client hasn't been built (dist missing) —
  // API-only dev (client run separately via `npm run dev -w frontend`) still works.
  app.use(express.static(CLIENT_DIST));
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
      if (err) next();
    });
  });

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    if (err?.name === "MulterError") {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? "File is too large (25 MB max)." : err.message });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    // Never leak database/driver internals for unexpected failures.
    const message = status >= 500 && !err.expose && !(err instanceof HttpError) ? "Something went wrong. Please try again." : err.message;
    const exposeCode = typeof err.code === "string" && /^[A-Z_]+$/.test(err.code) && (status < 500 || err.expose || err instanceof HttpError);
    res.status(status).json({ error: message, ...(exposeCode ? { code: err.code } : {}) });
  });

  return app;
}
