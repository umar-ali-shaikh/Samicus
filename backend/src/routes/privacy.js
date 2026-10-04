import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, advocateForUser, memberAccountIds } from "../services/access.js";
import { removeObject } from "../services/storage.js";

const router = Router();

// Data-subject export: everything we hold that is about the caller (no one else's data).
router.post("/privacy/export", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const accountIds = await memberAccountIds(req.user.id);
  const inAccounts = (table, columns) => (accountIds.length ? supabase.from(table).select(columns).in("account_id", accountIds) : { data: [], error: null });

  const [memberships, intakes, consultations, matters, documents, questions, complaints, orders, assistant] = await Promise.all([
    supabase.from("account_members").select("*").eq("user_id", req.user.id),
    inAccounts("intake_requests", "id, description, urgency, city, mode, language, kind, status, created_at"),
    inAccounts("consultations", "id, mode, scheduled_start, state, fee_total, paid_at, created_at"),
    inAccounts("matters", "id, reference, title, stage, opened_at"),
    inAccounts("documents", "id, filename, kind, size_bytes, created_at"),
    accountIds.length ? supabase.from("public_questions").select("id, body, status, created_at").in("author_account_id", accountIds) : { data: [], error: null },
    supabase.from("complaints").select("ref, title, category, status, created_at").eq("raised_by", req.user.id),
    supabase.from("payment_orders").select("kind, amount_paise, status, paid_at").eq("created_by", req.user.id),
    supabase.from("legal_assistant_sessions").select("session_id, created_at, turns:legal_assistant_turns(question, created_at)").eq("user_id", req.user.id),
  ]);
  for (const r of [memberships, intakes, consultations, matters, documents, questions, complaints, orders, assistant]) if (r.error) throw r.error;

  res.setHeader("Content-Disposition", 'attachment; filename="vidhira-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    user: req.user,
    memberships: memberships.data,
    requests: intakes.data,
    consultations: consultations.data,
    matters: matters.data,
    documents: documents.data,
    publicQuestions: questions.data,
    complaints: complaints.data,
    payments: orders.data,
    aiAssistantHistory: assistant.data,
  });
});

// Account deletion: refused while matters are engaged (statutory retention). Otherwise the
// person is anonymised in place (rows other parties rely on keep their integrity), their
// login is removed, and files that only they held are deleted.
router.post("/privacy/delete", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const accountIds = await memberAccountIds(req.user.id);

  if (accountIds.length > 0) {
    const { count, error } = await supabase
      .from("matters")
      .select("*", { count: "exact", head: true })
      .in("account_id", accountIds)
      .not("stage", "in", "(closed,archived)");
    if (error) throw error;
    if (count > 0) throw new HttpError(409, "Cannot delete account while matters are engaged. Statutory retention applies until they are closed.");
  }
  const advocate = await advocateForUser(req.user.id);
  if (advocate) {
    const { count, error } = await supabase.from("matters").select("*", { count: "exact", head: true }).eq("advocate_id", advocate.id).not("stage", "in", "(closed,archived)");
    if (error) throw error;
    if (count > 0) throw new HttpError(409, "You still have open matters as an advocate.");
    const { error: offError } = await supabase.from("advocates").update({ availability_state: "offline", verification_status: "rejected" }).eq("id", advocate.id);
    if (offError) throw offError;
  }

  // Delete files in accounts where this user is the only member.
  for (const accountId of accountIds) {
    const { count, error } = await supabase.from("account_members").select("*", { count: "exact", head: true }).eq("account_id", accountId);
    if (error) throw error;
    if (count !== 1) continue;
    const { data: docs, error: docsError } = await supabase.from("documents").select("id, storage_key").eq("account_id", accountId);
    if (docsError) throw docsError;
    for (const d of docs) await removeObject(d.storage_key).catch(() => {});
    if (docs.length) {
      const { error: delError } = await supabase.from("documents").delete().in("id", docs.map((d) => d.id));
      if (delError) throw delError;
    }
  }

  const authId = req.user.auth_id;
  const { error: anonError } = await supabase
    .from("users")
    .update({ email: null, phone: null, full_name: "Deleted user", avatar_url: null, city: null, state: null, auth_id: null })
    .eq("id", req.user.id);
  if (anonError) throw anonError;
  await supabase.from("account_members").delete().eq("user_id", req.user.id);
  if (authId) {
    const { error: authError } = await supabase.auth.admin.deleteUser(authId);
    if (authError) console.error("Failed to delete auth user:", authError.message);
  }
  res.status(204).end();
});

export default router;
