/**
 * Business logic for the pack-compliance domain. Ported from routes/pack.js -- same behaviour,
 * including the declaration-format checking, the claim-rule matching, the pass/warn/fail
 * rollup, and the ruleset-version diffing that flags previously-approved scans for recheck.
 */
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../../services/access.js";
import type {
  ClaimResultDto,
  CreateScanInput,
  DeclarationResultDto,
  PackCategoryDto,
  PackRulesetDto,
  PackScanDto,
  PutRulesetInput,
  RulesetDiffDto,
} from "@vidhira/contracts";
import * as repo from "./repository.js";
import type { ClaimRule, DeclarationRule, RulesetDiffChange, RulesetRow, ScanRow } from "./repository.js";

function toRulesetDto(row: RulesetRow): PackRulesetDto {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    version: row.version,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    declarations: row.declarations,
    claim_rules: row.claim_rules,
    created_at: row.created_at,
  };
}

function toScanDto(row: ScanRow): PackScanDto {
  return {
    id: row.id,
    org_id: row.org_id,
    sku: row.sku,
    product_name: row.product_name,
    category_id: row.category_id,
    ruleset_version: row.ruleset_version,
    declaration_results: row.declaration_results as DeclarationResultDto[],
    claim_results: row.claim_results as ClaimResultDto[],
    status: row.status,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    recheck_required: row.recheck_required,
    recheck_reason: row.recheck_reason,
    created_at: row.created_at,
  };
}

export async function listCategories(): Promise<PackCategoryDto[]> {
  const rulesets = await repo.listLatestRulesetPerCategory();
  return rulesets.map((rs) => ({ categoryId: rs.category_id, categoryName: rs.category_name, currentVersion: rs.version, declarations: rs.declarations }));
}

export async function getRuleset(categoryId: string): Promise<PackRulesetDto> {
  const ruleset = await repo.getLatestRuleset(categoryId);
  if (!ruleset) throw new HttpError(404, "No ruleset for that category");
  return toRulesetDto(ruleset);
}

function assertRegexes(input: PutRulesetInput): void {
  for (const p of [...input.declarations.map((d) => d.formatPattern), ...input.claimRules.map((c) => c.pattern)]) {
    if (!p) continue;
    try {
      new RegExp(p, "i");
    } catch {
      throw new HttpError(400, `Invalid pattern: ${p}`);
    }
  }
}

function diffDeclarations(oldDecls: DeclarationRule[] = [], newDecls: DeclarationRule[] = []): RulesetDiffChange[] {
  const oldByKey = new Map(oldDecls.map((d) => [d.key, d]));
  const newByKey = new Map(newDecls.map((d) => [d.key, d]));
  const changes: RulesetDiffChange[] = [];
  for (const [key, d] of newByKey) {
    const o = oldByKey.get(key);
    if (!o) changes.push({ declarationKey: key, changeType: "added", summary: `New required declaration "${d.label || key}" (${d.ruleRef}).` });
    else if (o.formatPattern !== d.formatPattern || o.required !== d.required || o.ruleRef !== d.ruleRef)
      changes.push({ declarationKey: key, changeType: "changed", summary: `Rule for "${d.label || key}" changed (${d.ruleRef}).` });
  }
  for (const key of oldByKey.keys()) if (!newByKey.has(key)) changes.push({ declarationKey: key, changeType: "removed", summary: `Declaration "${key}" is no longer required.` });
  return changes;
}

export async function putRuleset(input: PutRulesetInput): Promise<PackRulesetDto> {
  assertRegexes(input);
  const previous = await repo.getLatestRuleset(input.categoryId);
  const version = (previous?.version || 0) + 1;
  const effectiveFrom = input.effectiveFrom || new Date().toISOString();

  const ruleset = await repo.insertRuleset({
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    version,
    effectiveFrom,
    declarations: input.declarations,
    claimRules: input.claimRules,
  });

  if (previous) {
    const changes = diffDeclarations(previous.declarations, input.declarations);
    if (changes.length > 0) {
      const affectedIds = await repo.flagScansForRecheck(input.categoryId, previous.version, `Ruleset v${version} changed: ${changes.map((c) => c.declarationKey).join(", ")}`);
      await repo.insertRulesetDiff({ categoryId: input.categoryId, fromVersion: previous.version, toVersion: version, effectiveFrom, changes, affectedScanIds: affectedIds });
    }
  }
  return toRulesetDto(ruleset);
}

function checkDeclarations(rules: DeclarationRule[], provided: Record<string, string>): DeclarationResultDto[] {
  return rules.map((rule) => {
    const value = provided[rule.key]?.trim();
    if (!value) {
      return rule.required === false
        ? { key: rule.key, label: rule.label, status: "pass" as const, ruleRef: rule.ruleRef, note: "Optional and not declared." }
        : { key: rule.key, label: rule.label, status: "non_compliant" as const, ruleRef: rule.ruleRef, failureKind: "missing", note: "Not declared on the pack." };
    }
    if (rule.formatPattern && !new RegExp(rule.formatPattern, "i").test(value)) {
      return { key: rule.key, label: rule.label, status: "incomplete" as const, extractedValue: value, ruleRef: rule.ruleRef, failureKind: "wrong_format", note: "Does not match the required format." };
    }
    return { key: rule.key, label: rule.label, status: "pass" as const, extractedValue: value, ruleRef: rule.ruleRef };
  });
}

function checkClaims(rules: ClaimRule[], claims: string[]): ClaimResultDto[] {
  return claims.map((claimText) => {
    const rule = rules.find((r) => new RegExp(r.pattern, "i").test(claimText));
    return rule
      ? {
          text: claimText,
          verdict: rule.verdict,
          why: rule.substantiationRequired ? "Requires documented substantiation on file." : "Matches a known claim rule.",
          saferPhrasing: rule.saferPhrasing,
          saferRationale: rule.saferRationale,
          ruleRef: rule.ruleRef ?? "",
        }
      : { text: claimText, verdict: "needs_substantiation" as const, why: "No rule in the current ruleset covers this claim — keep substantiation on file.", ruleRef: "" };
  });
}

export async function createScan(user: { id: string }, input: CreateScanInput): Promise<PackScanDto> {
  const accountId = input.accountId || (await defaultAccountId(user.id));
  await assertAccountMember(user.id, accountId, ["owner", "admin", "member"]);

  const ruleset = await repo.getLatestRuleset(input.categoryId);
  if (!ruleset) throw new HttpError(404, "No ruleset has been published for that category yet.");

  const declarationResults = checkDeclarations(ruleset.declarations, input.declarations);
  const claimResults = checkClaims(ruleset.claim_rules, input.claims);
  const anyFail = declarationResults.some((d) => d.status === "non_compliant") || claimResults.some((c) => c.verdict === "high_risk");
  const anyWarn = declarationResults.some((d) => d.status === "incomplete") || claimResults.some((c) => c.verdict === "needs_substantiation");

  const scan = await repo.insertScan({
    accountId: accountId as string,
    sku: input.sku,
    productName: input.productName,
    categoryId: input.categoryId,
    rulesetVersion: ruleset.version,
    declarationResults,
    claimResults,
    status: anyFail ? "fail" : anyWarn ? "warn" : "pass",
  });
  return toScanDto(scan);
}

async function loadOwnScan(user: { id: string }, id: string): Promise<ScanRow> {
  const scan = await repo.getScanById(id);
  if (!scan) throw new HttpError(404, "Not found");
  try {
    await assertAccountMember(user.id, scan.org_id);
  } catch {
    throw new HttpError(404, "Not found");
  }
  return scan;
}

export async function getScan(user: { id: string }, id: string): Promise<PackScanDto> {
  return toScanDto(await loadOwnScan(user, id));
}

export async function approveScan(user: { id: string; full_name: string }, id: string): Promise<PackScanDto> {
  const scan = await loadOwnScan(user, id);
  await assertAccountMember(user.id, scan.org_id, ["owner", "admin"]);
  if (scan.status === "fail") throw new HttpError(409, "A failing pack cannot be approved. Correct the declarations and scan again.");
  return toScanDto(await repo.approveScan(scan.id, user.full_name));
}

export async function getDrift(user: { id: string }): Promise<RulesetDiffDto[]> {
  const accountIds = await memberAccountIds(user.id);
  const diffs = await repo.listRecentRulesetDiffs();
  const mine = await repo.listScanSkusForAccounts(accountIds);
  const mineById = new Map(mine.map((s) => [s.id, s]));
  return diffs.map((d) => ({
    id: d.id,
    category_id: d.category_id,
    from_version: d.from_version,
    to_version: d.to_version,
    effective_from: d.effective_from,
    changes: d.changes,
    affectedProducts: (d.affected_scan_ids || []).map((id) => mineById.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s)),
  }));
}

export async function getPortfolio(user: { id: string }, accountIdFilter?: string): Promise<PackScanDto[]> {
  const accountIds = await memberAccountIds(user.id);
  if (accountIds.length === 0) return [];
  if (accountIdFilter) await assertAccountMember(user.id, accountIdFilter);
  const scans = await repo.listScansForAccounts(accountIds, accountIdFilter);
  return scans.map(toScanDto);
}
