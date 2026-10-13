/**
 * Pack-compliance domain contracts. Ported from routes/pack.js's inline rulesetSchema/
 * scanSchema and its handlers' response shapes. "PackCheck is compliance QA on what you
 * declare from a pack -- not legal representation" (see Pack.jsx's subtitle, preserved verbatim
 * on the new page).
 */
import { z } from "zod";

export const DECLARATION_STATUSES = ["pass", "non_compliant", "incomplete"] as const;
export const CLAIM_VERDICTS = ["defensible", "needs_substantiation", "high_risk"] as const;
export const SCAN_STATUSES = ["scanning", "pass", "warn", "fail"] as const;

const declarationRuleSchema = z.object({
  key: z.string().trim().min(2).max(60),
  label: z.string().trim().max(100).optional(),
  ruleRef: z.string().trim().min(2).max(200),
  required: z.boolean().default(true),
  formatPattern: z.string().max(200).optional(),
});

const claimRuleSchema = z.object({
  pattern: z.string().trim().min(2).max(200),
  verdict: z.enum(CLAIM_VERDICTS),
  ruleRef: z.string().trim().max(200).optional(),
  substantiationRequired: z.boolean().default(false),
  saferPhrasing: z.string().trim().max(300).optional(),
  saferRationale: z.string().trim().max(500).optional(),
});

export const putRulesetSchema = z.object({
  categoryId: z.string().trim().regex(/^[a-z0-9_]{2,30}$/),
  categoryName: z.string().trim().min(2).max(80),
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  declarations: z.array(declarationRuleSchema).min(1),
  claimRules: z.array(claimRuleSchema).default([]),
});
export type PutRulesetInput = z.infer<typeof putRulesetSchema>;

export const createScanSchema = z.object({
  accountId: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(60),
  productName: z.string().trim().max(160).optional(),
  categoryId: z.string().trim().min(2).max(30),
  declarations: z.record(z.string(), z.string().max(300)).default({}),
  claims: z.array(z.string().trim().min(2).max(300)).max(30).default([]),
});
export type CreateScanInput = z.infer<typeof createScanSchema>;

const declarationRuleDto = z
  .object({ key: z.string(), label: z.string().optional(), ruleRef: z.string(), required: z.boolean(), formatPattern: z.string().optional() })
  .strict();

export const packCategoryDto = z
  .object({ categoryId: z.string(), categoryName: z.string().nullable(), currentVersion: z.number(), declarations: z.array(declarationRuleDto) })
  .strict();
export type PackCategoryDto = z.infer<typeof packCategoryDto>;

const claimRuleDto = z
  .object({
    pattern: z.string(),
    verdict: z.enum(CLAIM_VERDICTS),
    ruleRef: z.string().optional(),
    substantiationRequired: z.boolean(),
    saferPhrasing: z.string().optional(),
    saferRationale: z.string().optional(),
  })
  .strict();

export const packRulesetDto = z
  .object({
    id: z.string(),
    category_id: z.string(),
    category_name: z.string().nullable(),
    version: z.number(),
    effective_from: z.string().nullable(),
    effective_to: z.string().nullable(),
    declarations: z.array(declarationRuleDto),
    claim_rules: z.array(claimRuleDto),
    created_at: z.string(),
  })
  .strict();
export type PackRulesetDto = z.infer<typeof packRulesetDto>;

export const declarationResultDto = z
  .object({
    key: z.string(),
    label: z.string().optional(),
    status: z.enum(DECLARATION_STATUSES),
    extractedValue: z.string().optional(),
    ruleRef: z.string(),
    failureKind: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
export type DeclarationResultDto = z.infer<typeof declarationResultDto>;

export const claimResultDto = z
  .object({
    text: z.string(),
    verdict: z.enum(CLAIM_VERDICTS),
    why: z.string(),
    saferPhrasing: z.string().optional(),
    saferRationale: z.string().optional(),
    ruleRef: z.string(),
  })
  .strict();
export type ClaimResultDto = z.infer<typeof claimResultDto>;

export const packScanDto = z
  .object({
    id: z.string(),
    org_id: z.string(),
    sku: z.string(),
    product_name: z.string().nullable(),
    category_id: z.string().nullable(),
    ruleset_version: z.number().nullable(),
    declaration_results: z.array(declarationResultDto),
    claim_results: z.array(claimResultDto),
    status: z.enum(SCAN_STATUSES),
    approved_by: z.string().nullable(),
    approved_at: z.string().nullable(),
    recheck_required: z.boolean(),
    recheck_reason: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type PackScanDto = z.infer<typeof packScanDto>;

const rulesetDiffChangeDto = z.object({ declarationKey: z.string(), changeType: z.enum(["added", "changed", "removed"]), summary: z.string() }).strict();

export const rulesetDiffDto = z
  .object({
    id: z.string(),
    category_id: z.string().nullable(),
    from_version: z.number().nullable(),
    to_version: z.number().nullable(),
    effective_from: z.string().nullable(),
    changes: z.array(rulesetDiffChangeDto),
    affectedProducts: z.array(z.object({ id: z.string(), sku: z.string(), product_name: z.string().nullable() }).strict()),
  })
  .strict();
export type RulesetDiffDto = z.infer<typeof rulesetDiffDto>;
