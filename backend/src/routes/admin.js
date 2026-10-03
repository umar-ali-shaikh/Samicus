import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getCounts } from "../utils/callCounter.js";

const router = Router();

// Lightweight cost/usage visibility for the per-call-billed providers (Indian Kanoon,
// OpenRouter) — see docs/legal-assistant-spec.md gap #6. In-memory only (resets on
// restart); good enough for "are we about to get an IK bill surprise", not a ledger.
router.get("/admin/usage", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ callsSinceStart: getCounts() });
});

router.get("/admin/verification-cases", requireAuth, requireRole("admin"), async (req, res) => {
  const { data, error } = await getSupabase()
    .from("verification_cases")
    .select("*, advocate:advocates(*, user:users(full_name))")
    .eq("decision", "pending");
  if (error) throw error;
  res.json(data);
});

// Verification is a gate (data-model doc principle #4): only this action can flip an
// advocate to "verified", and it is always audit-logged.
router.post("/admin/verification-cases/:id/decide", requireAuth, requireRole("admin"), async (req, res) => {
  const supabase = getSupabase();
  const { decision } = req.body; // "approved" | "sent_back"

  const { data: verificationCase, error } = await supabase
    .from("verification_cases")
    .update({ decision, decided_at: new Date().toISOString(), reviewer_id: req.user.id })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw error;

  if (decision === "approved") {
    const { error: advocateError } = await supabase
      .from("advocates")
      .update({ verification_status: "verified" })
      .eq("id", verificationCase.advocate_id);
    if (advocateError) throw advocateError;
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id,
    actor_role: "admin",
    action: "advocate_verification_decision",
    subject_type: "Advocate",
    subject_id: verificationCase.advocate_id,
  });
  if (auditError) throw auditError;

  res.json(verificationCase);
});

export default router;
