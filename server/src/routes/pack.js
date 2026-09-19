import { Router } from "express";
import { PackRuleset, PackScan, RulesetDiff } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/pack/categories", async (req, res) => {
  const rulesets = await PackRuleset.find().sort({ version: -1 });
  const byCategory = new Map();
  for (const rs of rulesets) if (!byCategory.has(rs.categoryId)) byCategory.set(rs.categoryId, rs);
  res.json([...byCategory.values()].map((rs) => ({ categoryId: rs.categoryId, categoryName: rs.categoryName, currentVersion: rs.version })));
});

router.get("/pack/rulesets/:categoryId", async (req, res) => {
  const { asOf } = req.query;
  const query = { categoryId: req.params.categoryId };
  if (asOf) query.effectiveFrom = { $lte: new Date(asOf) };
  const ruleset = await PackRuleset.findOne(query).sort({ effectiveFrom: -1 });
  if (!ruleset) return res.status(404).json({ error: "No ruleset for that category/date" });
  res.json(ruleset);
});

// No real OCR in this build (per the "stub integrations" decision) — accepts structured
// declaration/claim input as if OCR had already run, and evaluates it against the pinned ruleset.
router.post("/pack/scans", requireAuth, async (req, res) => {
  const { orgId, sku, productName, categoryId, declarations, claims } = req.body;
  const ruleset = await PackRuleset.findOne({ categoryId }).sort({ version: -1 });
  if (!ruleset) return res.status(404).json({ error: "No ruleset for that category" });

  const declarationResults = (ruleset.declarations || []).map((rule) => {
    const provided = declarations?.[rule.key];
    if (!provided) return { key: rule.key, status: "non_compliant", ruleRef: rule.ruleRef, failureKind: "missing", note: "Not found on pack." };
    if (rule.formatPattern && !new RegExp(rule.formatPattern).test(provided)) {
      return { key: rule.key, status: "incomplete", extractedValue: provided, ruleRef: rule.ruleRef, failureKind: "wrong_format" };
    }
    return { key: rule.key, status: "pass", extractedValue: provided, ruleRef: rule.ruleRef };
  });

  const claimResults = (claims || []).map((claimText) => {
    const rule = (ruleset.claimRules || []).find((r) => new RegExp(r.pattern, "i").test(claimText));
    return rule
      ? { text: claimText, verdict: rule.verdict, why: rule.substantiationRequired ? "Requires documented substantiation on file." : "Matches an accepted claim pattern.", saferPhrasing: rule.saferPhrasing, ruleRef: rule.ruleRef }
      : { text: claimText, verdict: "needs_substantiation", why: "No matching pre-cleared claim pattern found.", ruleRef: "" };
  });

  const anyFail = declarationResults.some((d) => d.status === "non_compliant") || claimResults.some((c) => c.verdict === "high_risk");
  const anyWarn = declarationResults.some((d) => d.status === "incomplete") || claimResults.some((c) => c.verdict === "needs_substantiation");

  const scan = await PackScan.create({
    orgId,
    sku,
    productName,
    categoryId,
    rulesetVersion: ruleset.version,
    declarationResults,
    claimResults,
    status: anyFail ? "fail" : anyWarn ? "warn" : "pass",
  });
  res.status(201).json(scan);
});

router.get("/pack/scans/:id", requireAuth, async (req, res) => {
  const scan = await PackScan.findById(req.params.id);
  if (!scan) return res.status(404).json({ error: "Not found" });
  res.json(scan);
});

router.post("/pack/scans/:id/approve", requireAuth, async (req, res) => {
  const scan = await PackScan.findByIdAndUpdate(req.params.id, { approvedBy: req.user.fullName, approvedAt: new Date() }, { new: true });
  res.json(scan);
});

router.get("/pack/drift", requireAuth, async (req, res) => {
  res.json(await RulesetDiff.find().sort({ effectiveFrom: -1 }));
});

router.get("/pack/portfolio", requireAuth, async (req, res) => {
  const { orgId } = req.query;
  const scans = await PackScan.find(orgId ? { orgId } : {}).sort({ createdAt: -1 });
  res.json(scans);
});

export default router;
