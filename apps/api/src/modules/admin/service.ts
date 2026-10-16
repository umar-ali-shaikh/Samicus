/**
 * Business logic for the admin (trust & safety) domain. Ported from routes/admin.js -- same
 * behaviour, including the verification-is-a-gate rule (only this decision can flip an
 * advocate to "verified", always audit-logged) and the checks-array status rewrite on decision.
 */
import { getCounts } from "../../utils/callCounter.js";
import { HttpError } from "../../services/access.js";
import { complaints as complaintsReport } from "../../services/analytics/index.js";
import { ADMIN_ACCESS_REASON_MIN } from "@vidhira/contracts";
import type { AdminAccessGrantListItemDto, AdminMatterAccessInput, AdminMatterReviewDto, AdminStatsDto, ComplaintsReportDto, DecideVerificationInput, UsageDto, VerificationCaseDto, VerificationCaseListItemDto } from "@vidhira/contracts";
import { logAudit } from "../../platform/audit.js";
import { getMatterForAdminReview } from "../matters/service.js";
import * as repo from "./repository.js";

export async function getUsage(): Promise<UsageDto> {
  return { callsSinceStart: await getCounts() };
}

// Shared by trust & safety (admin) and the founder -- see modules/founder for the dedicated
// analytics tabs; this is the raw {kpis, complaints} shape ComplaintsDesk.jsx always rendered.
export async function getComplaintsReport(): Promise<ComplaintsReportDto> {
  return (await complaintsReport()) as ComplaintsReportDto;
}

export async function getStats(): Promise<AdminStatsDto> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [pendingVerification, verifiedAdvocates, pendingQuestions, pendingAnswers, openComplaints, conflictFlags, unassignedOrders] = await Promise.all([
    repo.count("verification_cases", (q) => q.eq("decision", "pending")),
    repo.count("advocates", (q) => q.eq("verification_status", "verified")),
    repo.count("public_questions", (q) => q.eq("status", "pending_moderation")),
    repo.count("public_answers", (q) => q.eq("moderation_state", "pending")),
    repo.count("complaints", (q) => q.neq("status", "resolved")),
    repo.count("conflict_checks", (q) => q.eq("status", "conflict").gte("checked_at", thirtyDaysAgo)),
    repo.count("service_orders", (q) => q.is("advocate_id", null).not("paid_at", "is", null)),
  ]);
  return {
    pendingVerification,
    verifiedAdvocates,
    pendingModeration: pendingQuestions + pendingAnswers,
    openComplaints,
    conflictFlags30d: conflictFlags,
    unassignedServiceOrders: unassignedOrders,
  };
}

export async function listPendingVerificationCases(): Promise<VerificationCaseListItemDto[]> {
  return repo.listPendingVerificationCases();
}

export async function decideVerification(user: { id: string }, caseId: string, input: DecideVerificationInput): Promise<VerificationCaseDto> {
  const existing = await repo.getVerificationCaseById(caseId);
  if (!existing) throw new HttpError(404, "Case not found.");
  if (existing.decision !== "pending") throw new HttpError(409, "This case was already decided.");

  const checks = (existing.checks || []).map((c) => ({
    ...c,
    status: input.decision === "approved" ? "pass" : c.status === "pass" ? "pass" : "needs_info",
    ...(input.note ? { note: input.note } : {}),
  }));
  const verificationCase = await repo.updateVerificationCase(existing.id, { decision: input.decision, checks, decided_at: new Date().toISOString(), reviewer_id: user.id });

  const advocate = await repo.updateAdvocateVerificationStatus(verificationCase.advocate_id, input.decision === "approved" ? "verified" : "documents_requested");
  await repo.updateUserKycStatus(advocate.user_id, input.decision === "approved" ? "verified" : "pending");
  await repo.insertVerificationAuditLog({ actorId: user.id, subjectId: verificationCase.advocate_id, reason: input.note || null });

  return {
    id: verificationCase.id,
    advocate_id: verificationCase.advocate_id,
    checks: verificationCase.checks,
    decision: verificationCase.decision,
    decided_at: verificationCase.decided_at,
    reviewer_id: verificationCase.reviewer_id,
    created_at: verificationCase.created_at,
  };
}

/**
 * Break-glass matter access (admin_access_grants). An admin is never a party to a matter, so
 * loadMatterForUser would (correctly) 404 them; this is the one, logged, way in. A reason is
 * mandatory -- an attempt without a real one is still recorded, as `denied`, so the log shows
 * attempts and not just successes. Each view needs its own reason: there is no standing grant.
 */
export async function accessMatter(user: { id: string; role: string }, input: AdminMatterAccessInput): Promise<AdminMatterReviewDto> {
  const matterId = await repo.findMatterIdByReference(input.reference);
  if (!matterId) throw new HttpError(404, "No matter with that reference.");

  const granted = input.reason.length >= ADMIN_ACCESS_REASON_MIN;
  const grant = await repo.insertAdminAccessGrant({ actorId: user.id, matterId, reason: input.reason, outcome: granted ? "recorded" : "denied" });
  await logAudit({ actorId: user.id, actorRole: user.role, action: "admin_matter_access", subjectType: "matter", subjectId: matterId, reason: input.reason, outcome: granted ? "recorded" : "denied" });
  if (!granted) throw new HttpError(400, `Give a reason of at least ${ADMIN_ACCESS_REASON_MIN} characters (e.g. the complaint reference and what you need to check).`);

  return { grant, ...(await getMatterForAdminReview(user.id, matterId)) };
}

export async function listAccessGrants(): Promise<AdminAccessGrantListItemDto[]> {
  return (await repo.listAdminAccessGrants()) as unknown as AdminAccessGrantListItemDto[];
}
