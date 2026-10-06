import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../services/access.js";

const router = Router();

function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

router.get("/pack/categories", requireAuth, async (req, res) => {
  const { data: rulesets, error } = await getSupabase().from("pack_rulesets").select("category_id, category_name, version, effective_from, declarations").order("version", { ascending: false });
  if (error) throw error;
  const byCategory = new Map();
  for (const rs of rulesets) if (!byCategory.has(rs.category_id)) byCategory.set(rs.category_id, rs);
  res.json([...byCategory.values()].map((rs) => ({ categoryId: rs.category_id, categoryName: rs.category_name, currentVersion: rs.version, declarations: rs.declarations })));
});

router.get("/pack/rulesets/:categoryId", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase().from("pack_rulesets").select("*").eq("category_id", req.params.categoryId).order("version", { ascending: false }).limit(1);
  if (error) throw error;
  if (!data[0]) throw new HttpError(404, "No ruleset for that category");
  res.json(data[0]);
});

// --- Ruleset administration (compliance rules are curated by admins, never hard-coded) ---

const rulesetSchema = z.object({
  categoryId: z.string().trim().regex(/^[a-z0-9_]{2,30}$/),
  categoryName: z.string().trim().min(2).max(80),
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  declarations: z
    .array(
      z.object({
        key: z.string().trim().min(2).max(60),
        label: z.string().trim().max(100).optional(),
        ruleRef: z.string().trim().min(2).max(200),
        required: z.boolean().default(true),
        formatPattern: z.string().max(200).optional(),
      })
    )
    .min(1),
  claimRules: z
    .array(
      z.object({
        pattern: z.string().trim().min(2).max(200),
        verdict: z.enum(["defensible", "needs_substantiation", "high_risk"]),
        ruleRef: z.string().trim().max(200).optional(),
        substantiationRequired: z.boolean().default(false),
        saferPhrasing: z.string().trim().max(300).optional(),
        saferRationale: z.string().trim().max(500).optional(),
      })
    )
    .default([]),
});

function assertRegexes(i) {
  for (const p of [...i.declarations.map((d) => d.formatPattern), ...i.claimRules.map((c) => c.pattern)]) {
    if (!p) continue;
    try {
      new RegExp(p, "i");
    } catch {
      throw new HttpError(400, `Invalid pattern: ${p}`);
    }
  }
}

function diffDeclarations(oldDecls = [], newDecls = []) {
  const oldByKey = new Map(oldDecls.map((d) => [d.key, d]));
  const newByKey = new Map(newDecls.map((d) => [d.key, d]));
  const changes = [];
  for (const [key, d] of newByKey) {
    const o = oldByKey.get(key);
    if (!o) changes.push({ declarationKey: key, changeType: "added", summary: `New required declaration “${d.label || key}” (${d.ruleRef}).` });
    else if (o.formatPattern !== d.formatPattern || o.required !== d.required || o.ruleRef !== d.ruleRef)
      changes.push({ declarationKey: key, changeType: "changed", summary: `Rule for “${d.label || key}” changed (${d.ruleRef}).` });
  }
  for (const key of oldByKey.keys()) if (!newByKey.has(key)) changes.push({ declarationKey: key, changeType: "removed", summary: `Declaration “${key}” is no longer required.` });
  return changes;
}

router.put("/admin/pack-rulesets", requireAuth, requireRole("admin"), async (req, res) => {
  const supabase = getSupabase();
  const input = parse(rulesetSchema, req.body);
  assertRegexes(input);

  const { data: latest, error } = await supabase.from("pack_rulesets").select("*").eq("category_id", input.categoryId).order("version", { ascending: false }).limit(1);
  if (error) throw error;
  const previous = latest[0];
  const version = (previous?.version || 0) + 1;
  const effectiveFrom = input.effectiveFrom || new Date().toISOString();

  const { data: ruleset, error: insertError } = await supabase
    .from("pack_rulesets")
    .insert({ category_id: input.categoryId, category_name: input.categoryName, version, effective_from: effectiveFrom, declarations: input.declarations, claim_rules: input.claimRules })
    .select()
    .single();
  if (insertError) throw insertError;

  if (previous) {
    const changes = diffDeclarations(previous.declarations, input.declarations);
    if (changes.length > 0) {
      const { data: affected, error: affectedError } = await supabase
        .from("pack_scans")
        .update({ recheck_required: true, recheck_reason: `Ruleset v${version} changed: ${changes.map((c) => c.declarationKey).join(", ")}` })
        .eq("category_id", input.categoryId)
        .eq("ruleset_version", previous.version)
        .not("approved_at", "is", null)
        .select("id");
      if (affectedError) throw affectedError;
      const { error: diffError } = await supabase.from("ruleset_diffs").insert({
        category_id: input.categoryId, from_version: previous.version, to_version: version, effective_from: effectiveFrom, changes, affected_scan_ids: affected.map((a) => a.id),
      });
      if (diffError) throw diffError;
    }
  }
  res.status(201).json(ruleset);
});

// --- Scans ---

const scanSchema = z.object({
  accountId: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(60),
  productName: z.string().trim().max(160).optional(),
  categoryId: z.string().trim().min(2).max(30),
  declarations: z.record(z.string(), z.string().max(300)).default({}),
  claims: z.array(z.string().trim().min(2).max(300)).max(30).default([]),
});

// The inputs are what the user transcribes from the pack (there is no OCR in this build);
// they are evaluated against the pinned ruleset version.
router.post("/pack/scans", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const input = parse(scanSchema, req.body);
  const accountId = input.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId, ["owner", "admin", "member"]);

  const { data: rulesetRows, error: rulesetError } = await supabase.from("pack_rulesets").select("*").eq("category_id", input.categoryId).order("version", { ascending: false }).limit(1);
  if (rulesetError) throw rulesetError;
  const ruleset = rulesetRows[0];
  if (!ruleset) throw new HttpError(404, "No ruleset has been published for that category yet.");

  const declarationResults = (ruleset.declarations || []).map((rule) => {
    const provided = input.declarations[rule.key]?.trim();
    if (!provided) {
      return rule.required === false
        ? { key: rule.key, label: rule.label, status: "pass", ruleRef: rule.ruleRef, note: "Optional and not declared." }
        : { key: rule.key, label: rule.label, status: "non_compliant", ruleRef: rule.ruleRef, failureKind: "missing", note: "Not declared on the pack." };
    }
    if (rule.formatPattern && !new RegExp(rule.formatPattern, "i").test(provided)) {
      return { key: rule.key, label: rule.label, status: "incomplete", extractedValue: provided, ruleRef: rule.ruleRef, failureKind: "wrong_format", note: "Does not match the required format." };
    }
    return { key: rule.key, label: rule.label, status: "pass", extractedValue: provided, ruleRef: rule.ruleRef };
  });

  const claimResults = input.claims.map((claimText) => {
    const rule = (ruleset.claim_rules || []).find((r) => new RegExp(r.pattern, "i").test(claimText));
    return rule
      ? {
          text: claimText,
          verdict: rule.verdict,
          why: rule.substantiationRequired ? "Requires documented substantiation on file." : "Matches a known claim rule.",
          saferPhrasing: rule.saferPhrasing,
          saferRationale: rule.saferRationale,
          ruleRef: rule.ruleRef,
        }
      : { text: claimText, verdict: "needs_substantiation", why: "No rule in the current ruleset covers this claim — keep substantiation on file.", ruleRef: "" };
  });

  const anyFail = declarationResults.some((d) => d.status === "non_compliant") || claimResults.some((c) => c.verdict === "high_risk");
  const anyWarn = declarationResults.some((d) => d.status === "incomplete") || claimResults.some((c) => c.verdict === "needs_substantiation");

  const { data: scan, error } = await supabase
    .from("pack_scans")
    .insert({
      org_id: accountId,
      sku: input.sku,
      product_name: input.productName,
      category_id: input.categoryId,
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

async function loadOwnScan(user, id) {
  const { data: scan, error } = await getSupabase().from("pack_scans").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!scan) throw new HttpError(404, "Not found");
  await assertAccountMember(user.id, scan.org_id).catch(() => { throw new HttpError(404, "Not found"); });
  return scan;
}

router.get("/pack/scans/:id", requireAuth, async (req, res) => {
  res.json(await loadOwnScan(req.user, req.params.id));
});

router.post("/pack/scans/:id/approve", requireAuth, async (req, res) => {
  const scan = await loadOwnScan(req.user, req.params.id);
  await assertAccountMember(req.user.id, scan.org_id, ["owner", "admin"]);
  if (scan.status === "fail") throw new HttpError(409, "A failing pack cannot be approved. Correct the declarations and scan again.");
  const { data, error } = await getSupabase()
    .from("pack_scans")
    .update({ approved_by: req.user.full_name, approved_at: new Date().toISOString(), recheck_required: false, recheck_reason: null })
    .eq("id", scan.id)
    .select()
    .single();
  if (error) throw error;
  res.json(data);
});

router.get("/pack/drift", requireAuth, async (req, res) => {
  const accountIds = await memberAccountIds(req.user.id);
  const supabase = getSupabase();
  const { data: diffs, error } = await supabase.from("ruleset_diffs").select("*").order("effective_from", { ascending: false }).limit(20);
  if (error) throw error;
  const { data: mine, error: mineError } = accountIds.length
    ? await supabase.from("pack_scans").select("id, sku, product_name").in("org_id", accountIds)
    : { data: [], error: null };
  if (mineError) throw mineError;
  const mineById = new Map(mine.map((s) => [s.id, s]));
  res.json(
    diffs.map((d) => ({
      ...d,
      affected_scan_ids: undefined,
      affectedProducts: (d.affected_scan_ids || []).map((id) => mineById.get(id)).filter(Boolean),
    }))
  );
});

router.get("/pack/portfolio", requireAuth, async (req, res) => {
  const accountIds = await memberAccountIds(req.user.id);
  if (accountIds.length === 0) return res.json([]);
  let query = getSupabase().from("pack_scans").select("*").in("org_id", accountIds).order("created_at", { ascending: false }).limit(200);
  if (req.query.accountId) {
    await assertAccountMember(req.user.id, req.query.accountId);
    query = query.eq("org_id", req.query.accountId);
  }
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
});

export default router;
