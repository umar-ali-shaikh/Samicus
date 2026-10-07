/**
 * Business logic for the matters domain. Ported from routes/matters.js -- same behaviour,
 * including the exact validation order, error messages and side-permission rules, split out
 * from HTTP concerns.
 */
import { HttpError, advocateForUser, assertAccountMember, loadMatterForUser, memberAccountIds, requireSide, type Advocate, type Matter } from "../../services/access.js";
import { PLATFORM_FEE, GST_RATE } from "../../services/matching.js";
import { paymentsEnabled } from "../../services/razorpay.js";
import type {
  AccessGrantDto,
  AccessGrantInput,
  FeeProposalDto,
  FeeProposalInput,
  HearingDto,
  HearingInput,
  InvoiceCreateResultDto,
  InvoiceDto,
  InvoiceInput,
  LegalSpendDto,
  MatterDetailDto,
  MatterDto,
  MatterListItemDto,
  MatterPatchInput,
  MyTaskDto,
  TaskDto,
  TaskInput,
} from "@vidhira/contracts";
import * as repo from "./repository.js";

export async function listMyMatters(userId: string): Promise<MatterListItemDto[]> {
  const [accountIds, advocate, granted] = await Promise.all([memberAccountIds(userId), advocateForUser(userId), repo.grantedMatterIds(userId)]);

  const [byAccount, byAdvocate, byGrant] = await Promise.all([
    accountIds.length ? repo.listMattersByAccountIds(accountIds) : Promise.resolve([]),
    advocate ? repo.listMattersByAdvocateId(advocate.id) : Promise.resolve([]),
    granted.length ? repo.listMattersByIds(granted) : Promise.resolve([]),
  ]);

  const rows = new Map<string, repo.MatterRow & { mySide: "client" | "advocate" }>();
  for (const m of [...byAccount, ...byAdvocate, ...byGrant]) {
    rows.set(m.id, { ...m, mySide: advocate && m.advocate_id === advocate.id ? "advocate" : "client" });
  }
  return [...rows.values()].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()) as unknown as MatterListItemDto[];
}

// Open to-dos for the signed-in user across all their matters (client tasks for clients,
// advocate tasks for the engaged advocate).
export async function listMyTasks(userId: string): Promise<MyTaskDto[]> {
  const [accountIds, advocate] = await Promise.all([memberAccountIds(userId), advocateForUser(userId)]);
  const out: MyTaskDto[] = [];

  async function fetchFor(column: "account_id" | "advocate_id", values: string[], ownerType: string) {
    const matters = await repo.listOpenMattersByColumn(column, values);
    if (matters.length === 0) return;
    const tasks = await repo.listOpenTasksForOwner(matters.map((m) => m.id), ownerType);
    for (const t of tasks) out.push({ ...t, matter: matters.find((m) => m.id === t.matter_id)! } as unknown as MyTaskDto);
  }

  if (accountIds.length) await fetchFor("account_id", accountIds, "client");
  if (advocate) await fetchFor("advocate_id", [advocate.id], "advocate");
  out.sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"));
  return out;
}

interface MatterViewContext {
  matter: Matter;
  side: "client" | "advocate" | "viewer";
  advocate: Advocate | null;
}

async function loadMatterContext(user: { id: string }, matterId: string): Promise<MatterViewContext> {
  try {
    return await loadMatterForUser(user, matterId);
  } catch (err) {
    // A user holding an explicit access grant (e.g. a CA or family member) is a read-only client-side viewer.
    if (!(err instanceof HttpError) || err.status !== 404) throw err;
    const granted = await repo.grantedMatterIds(user.id);
    if (!granted.includes(matterId)) throw err;
    const matter = await repo.findMatterRawById(matterId);
    if (!matter) throw err;
    return { matter: matter as Matter, side: "viewer", advocate: null };
  }
}

export async function getMatterDetail(user: { id: string }, matterId: string): Promise<MatterDetailDto> {
  const ctx = await loadMatterContext(user, matterId);
  const matter = await repo.findMatterJoinedById(ctx.matter.id);

  const [timeline, tasks, hearings, documents, access, feeProposals, invoices] = await Promise.all([
    repo.listTimelineForMatter(ctx.matter.id),
    repo.listTasksForMatter(ctx.matter.id),
    repo.listHearingsForMatter(ctx.matter.id),
    repo.listDocumentsForMatter(ctx.matter.id, ctx.side === "advocate" ? ctx.advocate!.id : null),
    repo.listAccessGrantsForMatter(ctx.matter.id),
    repo.listFeeProposalsForMatter(ctx.matter.id),
    repo.listInvoicesForMatter(ctx.matter.id),
  ]);

  const showFees = ctx.side !== "viewer" || access.some((g) => (g as { subject_id: string; scope: string[] }).subject_id === user.id && (g as { scope: string[] }).scope.includes("fees"));
  return {
    matter: matter as unknown as MatterDto,
    side: ctx.side,
    timeline: timeline as unknown as MatterDetailDto["timeline"],
    tasks: tasks as unknown as MatterDetailDto["tasks"],
    hearings: hearings as unknown as MatterDetailDto["hearings"],
    documents: documents as unknown as MatterDetailDto["documents"],
    access: ctx.side === "client" ? (access as unknown as AccessGrantDto[]) : [],
    feeProposals: showFees ? (feeProposals as unknown as FeeProposalDto[]) : [],
    invoices: showFees ? (invoices as unknown as InvoiceDto[]) : [],
  };
}

export async function patchMatter(user: { id: string; role: string }, matterId: string, input: MatterPatchInput): Promise<MatterDto> {
  const ctx = await loadMatterForUser(user, matterId);
  if (ctx.side === "client") {
    // Clients may only close their own matter; everything else is the advocate's call.
    if (!(input.stage === "closed" && Object.keys(input).length === 1)) throw new HttpError(403, "Only your advocate can update matter details.");
    await assertAccountMember(user.id, ctx.matter.account_id, ["owner", "admin"]);
  }
  const patch: Record<string, unknown> = {};
  if (input.stage) patch.stage = input.stage;
  if (input.stage === "closed") patch.closed_at = new Date().toISOString();
  if (input.nextAction !== undefined) patch.next_action = input.nextAction;
  if (input.forum !== undefined) patch.forum = input.forum;
  if (input.title) patch.title = input.title;
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update.");

  const updated = await repo.updateMatter(ctx.matter.id, patch);
  if (input.stage) {
    await repo.insertTimelineEvent({
      matterId: ctx.matter.id,
      type: "stage_changed",
      title: `Matter moved to "${input.stage.replace(/_/g, " ")}"`,
      actorType: ctx.side === "advocate" ? "advocate" : "user",
      actorId: ctx.side === "advocate" ? ctx.advocate!.id : user.id,
    });
  }
  return updated as unknown as MatterDto;
}

export async function addTask(user: { id: string }, matterId: string, input: TaskInput): Promise<TaskDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "advocate", "Only the engaged advocate can add tasks.");
  const task = await repo.insertTask({ matterId: ctx.matter.id, label: input.label, ownerType: input.ownerType, dueAt: input.dueAt, isStatutoryDeadline: input.isStatutoryDeadline });
  return task as unknown as TaskDto;
}

export async function completeTask(user: { id: string }, matterId: string, taskId: string, completed: boolean): Promise<TaskDto> {
  const ctx = await loadMatterForUser(user, matterId);
  const existing = await repo.findTaskById(ctx.matter.id, taskId);
  if (!existing) throw new HttpError(404, "Task not found.");
  if (existing.owner_type !== ctx.side) throw new HttpError(403, "This task belongs to the other party.");

  const task = await repo.updateTaskCompletion(existing.id, completed ? new Date().toISOString() : null);
  if (completed) {
    await repo.insertTimelineEvent({
      matterId: ctx.matter.id,
      type: "task_completed",
      title: `Task done: ${task.label}`,
      actorType: ctx.side === "advocate" ? "advocate" : "user",
      actorId: ctx.side === "advocate" ? ctx.advocate!.id : user.id,
    });
  }
  return task as unknown as TaskDto;
}

export async function addHearing(user: { id: string }, matterId: string, input: HearingInput): Promise<HearingDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "advocate", "Only the engaged advocate can list hearings.");
  const hearing = await repo.insertHearing({ matterId: ctx.matter.id, listedAt: input.listedAt, forum: input.forum || (ctx.matter.forum as string | undefined), courtHall: input.courtHall, purpose: input.purpose });
  return hearing as unknown as HearingDto;
}

// --- Access grants ---

export async function grantAccess(user: { id: string; role: string }, matterId: string, input: AccessGrantInput): Promise<AccessGrantDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "client");
  await assertAccountMember(user.id, ctx.matter.account_id, ["owner", "admin"]);

  const person = await repo.findUserByEmail(input.email);
  if (!person) throw new HttpError(404, "No Vidhira user has that email yet. Ask them to sign up first.");

  const grant = await repo.insertAccessGrant({ matterId: ctx.matter.id, subjectId: person.id, subjectName: person.full_name, subjectRole: input.role, scope: input.scope });
  await repo.insertAuditLog({ actorId: user.id, actorRole: user.role, action: "matter_access_granted", subjectType: "Matter", subjectId: ctx.matter.id });
  return grant as unknown as AccessGrantDto;
}

export async function revokeAccess(user: { id: string; role: string }, matterId: string, grantId: string): Promise<void> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "client");
  await assertAccountMember(user.id, ctx.matter.account_id, ["owner", "admin"]);

  await repo.revokeAccessGrant(grantId, ctx.matter.id);
  // Revocation is immediate and always audit-logged, per the data-model doc.
  await repo.insertAuditLog({ actorId: user.id, actorRole: user.role, action: "matter_access_revoked", subjectType: "Matter", subjectId: ctx.matter.id });
}

// --- Fees: proposal -> acceptance -> invoices ---

export async function sendFeeProposal(user: { id: string }, matterId: string, input: FeeProposalInput): Promise<FeeProposalDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "advocate", "Only the engaged advocate can send a fee proposal.");
  const proposal = await repo.insertFeeProposal({
    matterId: ctx.matter.id,
    advocateId: ctx.advocate!.id,
    scopeText: input.scopeText,
    milestones: input.milestones,
    statutoryEstimate: input.statutoryEstimate,
    exclusions: input.exclusions,
    validUntil: input.validUntil,
  });
  return proposal as unknown as FeeProposalDto;
}

export async function acceptFeeProposal(user: { id: string }, matterId: string, proposalId: string): Promise<FeeProposalDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "client", "Only the client can accept a fee proposal.");
  await assertAccountMember(user.id, ctx.matter.account_id, ["owner", "admin", "finance"]);

  const existing = await repo.findFeeProposalById(ctx.matter.id, proposalId);
  if (!existing) throw new HttpError(404, "Proposal not found.");
  if (existing.accepted_at) throw new HttpError(409, "This proposal was already accepted.");
  if (existing.valid_until && new Date(existing.valid_until) < new Date()) throw new HttpError(410, "This proposal has expired. Ask your advocate for a new one.");

  const proposal = await repo.acceptFeeProposal(existing.id);
  await repo.updateMatter(ctx.matter.id, { stage: "engagement_confirmed", engaged_at: new Date().toISOString(), next_action: "Advocate to begin work per the agreed scope" });
  await repo.insertTimelineEvent({ matterId: ctx.matter.id, type: "engagement_confirmed", title: "Fee proposal accepted — engagement confirmed", actorType: "user", actorId: user.id });
  return proposal as unknown as FeeProposalDto;
}

// Itemised the way the product promises: professional, government and platform fees are
// always separate lines; GST (18%) applies to professional + platform fee.
export async function raiseInvoice(user: { id: string }, matterId: string, input: InvoiceInput): Promise<InvoiceCreateResultDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "advocate", "Only the engaged advocate can raise an invoice.");

  const lines = [
    ...input.items.map((i) => ({ ...i, tax_rate: i.category === "professional" ? GST_RATE * 100 : 0 })),
    { label: "Platform fee", amount: PLATFORM_FEE, category: "platform" as const, tax_rate: GST_RATE * 100 },
  ];
  const taxable = lines.filter((l) => l.tax_rate > 0).reduce((s, l) => s + l.amount, 0);
  const gst = Math.round(taxable * GST_RATE);
  const total = lines.reduce((s, l) => s + l.amount, 0) + gst;

  const invoice = await repo.insertInvoice({ matterId: ctx.matter.id, total, dueAt: input.dueAt });
  await repo.insertInvoiceLineItems(lines.map((l, position) => ({ invoiceId: invoice.id, position, label: l.label, amount: l.amount, category: l.category, taxRate: l.tax_rate })));
  return { ...invoice, gst } as unknown as InvoiceCreateResultDto;
}

// With online payments switched off, the advocate records that the client settled directly.
export async function settleInvoiceOffline(user: { id: string }, matterId: string, invoiceId: string): Promise<InvoiceDto> {
  const ctx = await loadMatterForUser(user, matterId);
  requireSide(ctx, "advocate", "Only the engaged advocate can record a payment.");
  if (paymentsEnabled()) throw new HttpError(409, "Online payments are enabled — the client pays through the app.");

  const updated = await repo.updateInvoiceStatusIfUnpaid(invoiceId, ctx.matter.id, "paid");
  if (!updated) throw new HttpError(404, "Invoice not found or already paid.");
  await repo.insertAuditLog({ actorId: user.id, actorRole: "advocate", action: "invoice_settled_offline", subjectType: "Invoice", subjectId: updated.id as string });
  return updated as unknown as InvoiceDto;
}

export async function getLegalSpend(user: { id: string }, accountId: string): Promise<LegalSpendDto> {
  await assertAccountMember(user.id, accountId, ["owner", "admin", "finance"]);
  const matters = await repo.listMattersForAccount(accountId);
  const invoices = await repo.listInvoiceTotalsForMatters(matters.map((m) => m.id));

  const totals = invoices.reduce(
    (acc, inv) => {
      for (const li of inv.invoice_line_items || []) {
        acc[li.category as "professional" | "government" | "platform"] = (acc[li.category as "professional" | "government" | "platform"] || 0) + Number(li.amount);
      }
      acc.total += Number(inv.total);
      if (inv.status === "paid") acc.paid += Number(inv.total);
      return acc;
    },
    { professional: 0, government: 0, platform: 0, total: 0, paid: 0 },
  );

  return { openMatters: matters.filter((m) => !["closed", "archived"].includes(m.stage)).length, totals };
}
