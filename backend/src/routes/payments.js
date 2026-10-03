import { Router } from "express";
import crypto from "crypto";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Simulated gateway: intents are created and immediately capturable in dev, escrow held
// until an explicit release (mirrors the "held in escrow until consultation completes" copy).
router.post("/payments/intents", requireAuth, async (req, res) => {
  const { data: invoice, error } = await getSupabase().from("invoices").select("*").eq("id", req.body.invoiceId).maybeSingle();
  if (error) throw error;
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json({ intentId: crypto.randomBytes(8).toString("hex"), amount: invoice.total, status: "requires_capture" });
});

router.post("/payments/:id/capture", requireAuth, async (req, res) => {
  const { invoiceId, method } = req.body;
  // Payment.create + Invoice status update as one transaction — see capture_payment() in schema.sql.
  const { data: payment, error } = await getSupabase().rpc("capture_payment", {
    p_invoice_id: invoiceId,
    p_method: method,
    p_gateway_ref: `SIM-${Date.now()}`,
    p_escrow_state: "held",
  });
  if (error) throw error;
  res.status(201).json(payment);
});

export default router;
