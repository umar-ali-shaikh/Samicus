import express from "express";
import cors from "cors";
import morgan from "morgan";

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
import paymentsRoutes from "./routes/payments.js";
import researchRoutes from "./routes/research.js";
import contractReviewRoutes from "./routes/contractReview.js";
import packRoutes from "./routes/pack.js";
import draftingRoutes from "./routes/drafting.js";
import askLearnRoutes from "./routes/askLearn.js";
import adminRoutes from "./routes/admin.js";
import founderRoutes from "./routes/founder.js";
import privacyRoutes from "./routes/privacy.js";
import indianKanoonRoutes from "./routes/indianKanoon.js";
import legalAssistantRoutes from "./routes/legalAssistant.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(authRoutes);
  api.use(indianKanoonRoutes);
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
  api.use(adminRoutes);
  api.use(founderRoutes);
  api.use(privacyRoutes);
  app.use("/api", api);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Internal server error" });
  });

  return app;
}
