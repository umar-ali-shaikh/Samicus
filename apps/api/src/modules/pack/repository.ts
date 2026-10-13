/**
 * DB access for the pack-compliance domain. Ported from routes/pack.js's inline Supabase
 * calls -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

export interface DeclarationRule {
  key: string;
  label?: string;
  ruleRef: string;
  required: boolean;
  formatPattern?: string;
}

export interface ClaimRule {
  pattern: string;
  verdict: "defensible" | "needs_substantiation" | "high_risk";
  ruleRef?: string;
  substantiationRequired: boolean;
  saferPhrasing?: string;
  saferRationale?: string;
}

export interface RulesetRow {
  id: string;
  category_id: string;
  category_name: string | null;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  declarations: DeclarationRule[];
  claim_rules: ClaimRule[];
  created_at: string;
}

export async function listLatestRulesetPerCategory(): Promise<RulesetRow[]> {
  const { data, error } = await getSupabase().from("pack_rulesets").select("*").order("version", { ascending: false });
  if (error) throw error;
  const byCategory = new Map<string, RulesetRow>();
  for (const rs of data as RulesetRow[]) if (!byCategory.has(rs.category_id)) byCategory.set(rs.category_id, rs);
  return [...byCategory.values()];
}

export async function getLatestRuleset(categoryId: string): Promise<RulesetRow | null> {
  const { data, error } = await getSupabase().from("pack_rulesets").select("*").eq("category_id", categoryId).order("version", { ascending: false }).limit(1);
  if (error) throw error;
  return (data as RulesetRow[])[0] ?? null;
}

export async function insertRuleset(input: {
  categoryId: string;
  categoryName: string;
  version: number;
  effectiveFrom: string;
  declarations: DeclarationRule[];
  claimRules: ClaimRule[];
}): Promise<RulesetRow> {
  const { data, error } = await getSupabase()
    .from("pack_rulesets")
    .insert({
      category_id: input.categoryId,
      category_name: input.categoryName,
      version: input.version,
      effective_from: input.effectiveFrom,
      effective_to: null,
      declarations: input.declarations,
      claim_rules: input.claimRules,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RulesetRow;
}

export interface RulesetDiffChange {
  declarationKey: string;
  changeType: "added" | "changed" | "removed";
  summary: string;
}

export async function flagScansForRecheck(categoryId: string, previousVersion: number, reason: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("pack_scans")
    .update({ recheck_required: true, recheck_reason: reason })
    .eq("category_id", categoryId)
    .eq("ruleset_version", previousVersion)
    .not("approved_at", "is", null)
    .select("id");
  if (error) throw error;
  return (data as Array<{ id: string }>).map((a) => a.id);
}

export async function insertRulesetDiff(input: {
  categoryId: string;
  fromVersion: number;
  toVersion: number;
  effectiveFrom: string;
  changes: RulesetDiffChange[];
  affectedScanIds: string[];
}): Promise<void> {
  const { error } = await getSupabase().from("ruleset_diffs").insert({
    category_id: input.categoryId,
    from_version: input.fromVersion,
    to_version: input.toVersion,
    effective_from: input.effectiveFrom,
    changes: input.changes,
    affected_scan_ids: input.affectedScanIds,
  });
  if (error) throw error;
}

export interface ScanRow {
  id: string;
  org_id: string;
  sku: string;
  product_name: string | null;
  category_id: string | null;
  ruleset_version: number | null;
  declaration_results: unknown[];
  claim_results: unknown[];
  status: "scanning" | "pass" | "warn" | "fail";
  approved_by: string | null;
  approved_at: string | null;
  recheck_required: boolean;
  recheck_reason: string | null;
  created_at: string;
}

export async function insertScan(input: {
  accountId: string;
  sku: string;
  productName?: string;
  categoryId: string;
  rulesetVersion: number;
  declarationResults: unknown[];
  claimResults: unknown[];
  status: ScanRow["status"];
}): Promise<ScanRow> {
  const { data, error } = await getSupabase()
    .from("pack_scans")
    .insert({
      org_id: input.accountId,
      sku: input.sku,
      product_name: input.productName ?? null,
      category_id: input.categoryId,
      ruleset_version: input.rulesetVersion,
      declaration_results: input.declarationResults,
      claim_results: input.claimResults,
      status: input.status,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ScanRow;
}

export async function getScanById(id: string): Promise<ScanRow | null> {
  const { data, error } = await getSupabase().from("pack_scans").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ScanRow | null;
}

export async function approveScan(id: string, approvedBy: string): Promise<ScanRow> {
  const { data, error } = await getSupabase()
    .from("pack_scans")
    .update({ approved_by: approvedBy, approved_at: new Date().toISOString(), recheck_required: false, recheck_reason: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ScanRow;
}

export interface RulesetDiffRow {
  id: string;
  category_id: string | null;
  from_version: number | null;
  to_version: number | null;
  effective_from: string | null;
  changes: RulesetDiffChange[];
  affected_scan_ids: string[];
}

export async function listRecentRulesetDiffs(limit = 20): Promise<RulesetDiffRow[]> {
  const { data, error } = await getSupabase().from("ruleset_diffs").select("*").order("effective_from", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as RulesetDiffRow[];
}

// Deliberately filtered by the CALLER's own accountIds (org_id), not by the diff's
// affected_scan_ids -- a scan belonging to another account must never surface here even if its
// id happens to be in some diff's affected list (see service.ts's getDrift).
export async function listScanSkusForAccounts(accountIds: string[]): Promise<Array<{ id: string; sku: string; product_name: string | null }>> {
  if (accountIds.length === 0) return [];
  const { data, error } = await getSupabase().from("pack_scans").select("id, sku, product_name").in("org_id", accountIds);
  if (error) throw error;
  return data as Array<{ id: string; sku: string; product_name: string | null }>;
}

export async function listScansForAccounts(accountIds: string[], accountIdFilter?: string): Promise<ScanRow[]> {
  if (accountIds.length === 0) return [];
  let query = getSupabase().from("pack_scans").select("*").in("org_id", accountIds).order("created_at", { ascending: false }).limit(200);
  if (accountIdFilter) query = query.eq("org_id", accountIdFilter);
  const { data, error } = await query;
  if (error) throw error;
  return data as ScanRow[];
}
