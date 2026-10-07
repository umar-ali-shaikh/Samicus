/**
 * Matters domain router. Ported from routes/matters.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import {
  matterPatchSchema,
  taskSchema,
  hearingSchema,
  accessGrantSchema,
  feeProposalSchema,
  invoiceSchema,
  matterDto,
  matterListItemDto,
  myTaskDto,
  matterDetailDto,
  taskDto,
  hearingDto,
  accessGrantDto,
  feeProposalDto,
  invoiceCreateResultDto,
  invoiceDto,
  legalSpendDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

// Matters the caller can see: their accounts' matters, matters they are engaged on as the
// advocate, and matters explicitly shared with them through an access grant.
router.get("/matters", requireAuth, async (req, res) => {
  const matters = await service.listMyMatters(req.user!.id);
  res.json(matters.map((m) => matterListItemDto.parse(m)));
});

// Open to-dos for the signed-in user across all their matters (client tasks for clients,
// advocate tasks for the engaged advocate).
router.get("/tasks/mine", requireAuth, async (req, res) => {
  const tasks = await service.listMyTasks(req.user!.id);
  res.json(tasks.map((t) => myTaskDto.parse(t)));
});

router.get("/matters/:id", requireAuth, async (req, res) => {
  const detail = await service.getMatterDetail(req.user!, req.params.id as string);
  res.json(matterDetailDto.parse(detail));
});

router.patch("/matters/:id", requireAuth, async (req, res) => {
  const input = parse(matterPatchSchema, req.body);
  const matter = await service.patchMatter(req.user!, req.params.id as string, input);
  res.json(matterDto.parse(matter));
});

router.post("/matters/:id/tasks", requireAuth, async (req, res) => {
  const input = parse(taskSchema, req.body);
  const task = await service.addTask(req.user!, req.params.id as string, input);
  res.status(201).json(taskDto.parse(task));
});

router.post("/matters/:id/tasks/:tid/complete", requireAuth, async (req, res) => {
  const completed = req.body?.completed !== false;
  const task = await service.completeTask(req.user!, req.params.id as string, req.params.tid as string, completed);
  res.json(taskDto.parse(task));
});

router.post("/matters/:id/hearings", requireAuth, async (req, res) => {
  const input = parse(hearingSchema, req.body);
  const hearing = await service.addHearing(req.user!, req.params.id as string, input);
  res.status(201).json(hearingDto.parse(hearing));
});

// --- Access grants (client side shares a matter with someone outside the account) ---

router.post("/matters/:id/access", requireAuth, async (req, res) => {
  const input = parse(accessGrantSchema, req.body);
  const grant = await service.grantAccess(req.user!, req.params.id as string, input);
  res.status(201).json(accessGrantDto.parse(grant));
});

router.delete("/matters/:id/access/:gid", requireAuth, async (req, res) => {
  await service.revokeAccess(req.user!, req.params.id as string, req.params.gid as string);
  res.status(204).end();
});

// --- Fees: proposal -> acceptance -> invoices ---

router.post("/matters/:id/fee-proposals", requireAuth, async (req, res) => {
  const input = parse(feeProposalSchema, req.body);
  const proposal = await service.sendFeeProposal(req.user!, req.params.id as string, input);
  res.status(201).json(feeProposalDto.parse(proposal));
});

router.post("/matters/:id/fee-proposals/:pid/accept", requireAuth, async (req, res) => {
  const proposal = await service.acceptFeeProposal(req.user!, req.params.id as string, req.params.pid as string);
  res.json(feeProposalDto.parse(proposal));
});

router.post("/matters/:id/invoices", requireAuth, async (req, res) => {
  const input = parse(invoiceSchema, req.body);
  const invoice = await service.raiseInvoice(req.user!, req.params.id as string, input);
  res.status(201).json(invoiceCreateResultDto.parse(invoice));
});

router.post("/matters/:id/invoices/:iid/settle-offline", requireAuth, async (req, res) => {
  const invoice = await service.settleInvoiceOffline(req.user!, req.params.id as string, req.params.iid as string);
  res.json(invoiceDto.parse(invoice));
});

router.get("/accounts/:id/legal-spend", requireAuth, async (req, res) => {
  const spend = await service.getLegalSpend(req.user!, req.params.id as string);
  res.json(legalSpendDto.parse(spend));
});

export default router;
