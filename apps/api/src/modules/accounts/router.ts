/**
 * Accounts domain router. Ported from routes/accounts.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3 (Router -> Validation -> Policy ->
 * Service). Response DTOs are Zod-parsed (.strict()) before being sent, so an accidental extra
 * field in a mapper is a hard 500, never a silent leak.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAccountAccess } from "./policy.js";
import { HttpError } from "../../services/access.js";
import { createAccountSchema, addMemberSchema, accountDto, accountMemberDto, planDto } from "@vidhira/contracts";
import * as service from "./service.js";

const router = Router();

router.get("/accounts", requireAuth, async (req, res) => {
  const accounts = await service.listMyAccounts(req.user!.id);
  res.json(accounts.map((a) => accountDto.parse(a)));
});

router.post("/accounts", requireAuth, async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const account = await service.createAccount(req.user!.id, parsed.data);
  res.status(201).json(accountDto.parse(account));
});

router.get("/plans", async (_req, res) => {
  const plans = await service.listPlans();
  res.json(plans.map((p) => planDto.parse(p)));
});

router.post("/accounts/:id/members", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  const member = await service.addMember(req.params.id as string, parsed.data);
  res.status(201).json(accountMemberDto.parse(member));
});

router.get("/accounts/:id/members", requireAuth, requireAccountAccess(), async (req, res) => {
  const members = await service.listMembers(req.params.id as string);
  res.json(members.map((m) => accountMemberDto.parse(m)));
});

router.delete("/accounts/:id/members/:mid", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  await service.removeMember(req.params.id as string, req.params.mid as string);
  res.status(204).end();
});

export default router;
