import { Router } from "express";
import crypto from "crypto";
import { Invoice, Payment } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Simulated gateway: intents are created and immediately capturable in dev, escrow held
// until an explicit release (mirrors the "held in escrow until consultation completes" copy).
router.post("/payments/intents", requireAuth, async (req, res) => {
  const invoice = await Invoice.findById(req.body.invoiceId);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json({ intentId: crypto.randomBytes(8).toString("hex"), amount: invoice.total, status: "requires_capture" });
});

router.post("/payments/:id/capture", requireAuth, async (req, res) => {
  const { invoiceId, method } = req.body;
  const payment = await Payment.create({ invoiceId, method, gatewayRef: `SIM-${Date.now()}`, escrowState: "held" });
  await Invoice.findByIdAndUpdate(invoiceId, { status: "paid" });
  res.status(201).json(payment);
});

export default router;
