import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getCounts } from "../utils/callCounter.js";
import { HttpError } from "../services/access.js";

const router = Router();
router.use("/admin", requireAuth, requireRole("admin", "founder"));

// Lightweight cost/usage visibility for the per-call-billed providers (Indian Kanoon,
// OpenRouter, Gemini) — in-memory only (resets on restart).
router.get("/admin/usage", (req, res) => {
  res.json({ callsSinceStart: getCounts() });
});

async function count(table, apply = (q) => q) {
  const { count: n, error } = await apply(getSupabase().from(table).select("*", { count: "exact", head: true }));
  if (error) throw error;
  return n || 0;
}

router.get("/admin/stats", async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [pendingVerification, verifiedAdvocates, pendingQuestions, pendingAnswers, openComplaints, conflictFlags, unassignedOrders] = await Promise.all([
    count("verification_cases", (q) => q.eq("decision", "pending")),
    count("advocates", (q) => q.eq("verification_status", "verified")),
    count("public_questions", (q) => q.eq("status", "pending_moderation")),
    count("public_answers", (q) => q.eq("moderation_state", "pending")),
    count("complaints", (q) => q.neq("status", "resolved")),
    count("conflict_checks", (q) => q.eq("status", "conflict").gte("checked_at", thirtyDaysAgo)),
    count("service_orders", (q) => q.is("advocate_id", null).not("paid_at", "is", null)),
  ]);
  res.json({ pendingVerification, verifiedAdvocates, pendingModeration: pendingQuestions + pendingAnswers, openComplaints, conflictFlags30d: conflictFlags, unassignedServiceOrders: unassignedOrders });
});

router.get("/admin/verification-cases", async (req, res) => {
  const { data, error } = await getSupabase()
    .from("verification_cases")
    .select(
      "id, checks, decision, created_at, advocate:advocates(id, bar_council, enrolment_number, enrolment_year, city, years_of_practice, education, verification_status, user:users(full_name, email), advocate_practice_areas(practice_area:practice_areas(name)))"
    )
    .eq("decision", "pending")
    .order("created_at");
  if (error) throw error;
  res.json(data);
});

// Verification is a gate (data-model doc principle #4): only this action can flip an
// advocate to "verified", and it is always audit-logged.
router.post("/admin/verification-cases/:id/decide", requireRole("admin"), async (req, res) => {
  const supabase = getSupabase();
  const { decision, note } = req.body || {};
  if (!["approved", "sent_back"].includes(decision)) throw new HttpError(400, "decision must be 'approved' or 'sent_back'.");

  const { data: existing, error: findError } = await supabase.from("verification_cases").select("*").eq("id", req.params.id).maybeSingle();
  if (findError) throw findError;
  if (!existing) throw new HttpError(404, "Case not found.");
  if (existing.decision !== "pending") throw new HttpError(409, "This case was already decided.");

  const checks = (existing.checks || []).map((c) => ({ ...c, status: decision === "approved" ? "pass" : c.status === "pass" ? "pass" : "needs_info", ...(note ? { note } : {}) }));
  const { data: verificationCase, error } = await supabase
    .from("verification_cases")
    .update({ decision, checks, decided_at: new Date().toISOString(), reviewer_id: req.user.id })
    .eq("id", existing.id)
    .select()
    .single();
  if (error) throw error;

  const { data: advocate, error: advocateError } = await supabase
    .from("advocates")
    .update({ verification_status: decision === "approved" ? "verified" : "documents_requested" })
    .eq("id", verificationCase.advocate_id)
    .select("user_id")
    .single();
  if (advocateError) throw advocateError;

  const { error: userError } = await supabase.from("users").update({ kyc_status: decision === "approved" ? "verified" : "pending" }).eq("id", advocate.user_id);
  if (userError) throw userError;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id,
    actor_role: "admin",
    action: "advocate_verification_decision",
    subject_type: "Advocate",
    subject_id: verificationCase.advocate_id,
    reason: note || null,
  });
  if (auditError) throw auditError;

  res.json(verificationCase);
});

// Advocates resubmit after being sent back.
export const resubmitRouter = Router();
resubmitRouter.post("/advocate/resubmit", requireAuth, requireRole("advocate"), async (req, res) => {
  const supabase = getSupabase();
  const { data: advocate, error } = await supabase.from("advocates").select("id, verification_status").eq("user_id", req.user.id).maybeSingle();
  if (error) throw error;
  if (!advocate) throw new HttpError(404, "No advocate profile.");
  if (advocate.verification_status !== "documents_requested") throw new HttpError(409, "Nothing to resubmit.");
  const { error: caseError } = await supabase.from("verification_cases").insert({ advocate_id: advocate.id, checks: [{ type: "resubmission", status: "pending" }] });
  if (caseError) throw caseError;
  const { error: updateError } = await supabase.from("advocates").update({ verification_status: "submitted" }).eq("id", advocate.id);
  if (updateError) throw updateError;
  res.json({ ok: true });
});

export default router;
