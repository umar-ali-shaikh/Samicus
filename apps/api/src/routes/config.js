import { Router } from "express";
import { publicPaymentConfig } from "../services/razorpay.js";
import { ragEnabled } from "@vidhira/rag/ingest";
import { isLlmConfigured } from "../services/llm.js";

const router = Router();

// Capability flags the client uses to show honest "not enabled" states instead of dead buttons.
router.get("/config", (req, res) => {
  res.json({
    payments: publicPaymentConfig(),
    research: { enabled: ragEnabled() },
    legalAssistant: { enabled: Boolean(isLlmConfigured() && process.env.IK_API_TOKEN) },
    video: { provider: "jitsi" },
  });
});

export default router;
