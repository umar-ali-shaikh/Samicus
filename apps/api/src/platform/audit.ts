/**
 * Typed wrapper around the audit_logs insert pattern already used ad hoc across admin.js,
 * matters.js, documents.js, askLearn.js and advocates.js (same shape, re-typed here rather
 * than changed). New Phase 2+ call sites (starting with role-elevation logging in
 * provision.ts) use this helper; existing call sites are left as-is and migrate to it
 * module-by-module as each domain is converted in Phase 3, not rewritten wholesale here.
 */
import { getSupabase } from "../config/db.js";

export interface AuditEntry {
  actorId: string;
  actorRole?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  reason?: string | null;
  outcome?: "recorded" | "denied";
  ip?: string | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await getSupabase().from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    subject_type: entry.subjectType ?? null,
    subject_id: entry.subjectId ?? null,
    reason: entry.reason ?? null,
    outcome: entry.outcome ?? "recorded",
    ip: entry.ip ?? null,
  });
  if (error) throw error;
}
