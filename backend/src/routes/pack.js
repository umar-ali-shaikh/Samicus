import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/pack/categories", async (req, res) => {
  const { data: rulesets, error } = await getSupabase().from("pack_rulesets").select("*").order("version", { ascending: false });
  if (error) throw error;
  const byCategory = new Map();
  for (const rs of rulesets) if (!byCategory.has(rs.category_id)) byCategory.set(rs.category_id, rs);
  res.json([...byCategory.values()].map((rs) => ({ categoryId: rs.category_id, categoryName: rs.category_name, currentVersion: rs.version })));
});

router.get("/pack/rulesets/:categoryId", async (req, res) => {
  const { asOf } = req.query;
  let query = getSupabase().from("pack_rulesets").select("*").eq("category_id", req.params.categoryId);
  if (asOf) query = query.lte("effective_from", new Date(asOf).toISOString());
  query = query.order("effective_from", { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  const ruleset = data[0];
  if (!ruleset) return res.status(404).json({ error: "No ruleset for that category/date" });
  res.json(ruleset);
});

// No real OCR in this build (per the "stub integrations" decision) — accepts structured
// declaration/claim input as if OCR had already run, and evaluates it against the pinned ruleset.
router.post("/pack/scans", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { orgId, sku, productName, categoryId, declarations, claims } = req.body;
  const { data: rulesetRows, error: rulesetError } = await supabase
    .from("pack_rulesets")
    .select("*")
    .eq("category_id", categoryId)
    .order("version", { ascending: false })
    .limit(1);
  if (rulesetError) throw rulesetError;
  const ruleset = rulesetRows[0];
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
    const rule = (ruleset.claim_rules || []).find((r) => new RegExp(r.pattern, "i").test(claimText));
    return rule
      ? {
          text: claimText,
          verdict: rule.verdict,
          why: rule.substantiationRequired ? "Requires documented substantiation on file." : "Matches an accepted claim pattern.",
          saferPhrasing: rule.saferPhrasing,
          ruleRef: rule.ruleRef,
        }
      : { text: claimText, verdict: "needs_substantiation", why: "No matching pre-cleared claim pattern found.", ruleRef: "" };
  });

  const anyFail = declarationResults.some((d) => d.status === "non_compliant") || claimResults.some((c) => c.verdict === "high_risk");
  const anyWarn = declarationResults.some((d) => d.status === "incomplete") || claimResults.some((c) => c.verdict === "needs_substantiation");

  const { data: scan, error } = await supabase
    .from("pack_scans")
    .insert({
      org_id: orgId,
      sku,
      product_name: productName,
      category_id: categoryId,
      ruleset_version: ruleset.version,
      declaration_results: declarationResults,
      claim_results: claimResults,
      status: anyFail ? "fail" : anyWarn ? "warn" : "pass",
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(scan);
});

router.get("/pack/scans/:id", requireAuth, async (req, res) => {
  const { data: scan, error } = await getSupabase().from("pack_scans").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!scan) return res.status(404).json({ error: "Not found" });
  res.json(scan);
});

router.post("/pack/scans/:id/approve", requireAuth, async (req, res) => {
  const { data: scan, error } = await getSupabase()
    .from("pack_scans")
    .update({ approved_by: req.user.full_name, approved_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw error;
  res.json(scan);
});

router.get("/pack/drift", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase().from("ruleset_diffs").select("*").order("effective_from", { ascending: false });
  if (error) throw error;
  res.json(data);
});

router.get("/pack/portfolio", requireAuth, async (req, res) => {
  const { orgId } = req.query;
  let query = getSupabase().from("pack_scans").select("*").order("created_at", { ascending: false });
  if (orgId) query = query.eq("org_id", orgId);
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
});

export default router;
