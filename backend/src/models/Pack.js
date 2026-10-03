import mongoose from "mongoose";

const declarationRuleSchema = new mongoose.Schema(
  { key: String, ruleRef: String, required: Boolean, formatPattern: String, bilingualRequired: Boolean, minFontMmByPanelArea: mongoose.Schema.Types.Mixed },
  { _id: false }
);

const claimRuleSchema = new mongoose.Schema(
  { pattern: String, verdict: String, ruleRef: String, substantiationRequired: Boolean, saferPhrasing: String, saferRationale: String },
  { _id: false }
);

const packRulesetSchema = new mongoose.Schema(
  {
    categoryId: { type: String, required: true },
    categoryName: String,
    version: { type: Number, required: true },
    effectiveFrom: Date,
    effectiveTo: Date,
    declarations: [declarationRuleSchema],
    claimRules: [claimRuleSchema],
  },
  { timestamps: true }
);

const declarationResultSchema = new mongoose.Schema(
  {
    key: String,
    status: { type: String, enum: ["pass", "incomplete", "non_compliant"], required: true },
    extractedValue: String,
    ruleRef: String,
    failureKind: { type: String, enum: ["missing", "wrong_format", "misspelled", "not_bilingual", null], default: null },
    note: String,
  },
  { _id: false }
);

const claimResultSchema = new mongoose.Schema(
  { text: String, verdict: { type: String, enum: ["defensible", "needs_substantiation", "high_risk"] }, why: String, saferPhrasing: String, ruleRef: String },
  { _id: false }
);

const packScanSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    sku: { type: String, required: true },
    productName: String,
    artworkKey: String,
    artworkVersion: Number,
    categoryId: String,
    rulesetVersion: Number,
    declarationResults: [declarationResultSchema],
    claimResults: [claimResultSchema],
    status: { type: String, enum: ["scanning", "pass", "warn", "fail"], default: "scanning" },
    approvedBy: String,
    approvedAt: Date,
    recheckRequired: { type: Boolean, default: false },
    recheckReason: String,
  },
  { timestamps: true }
);

const rulesetDiffSchema = new mongoose.Schema(
  {
    categoryId: String,
    fromVersion: Number,
    toVersion: Number,
    effectiveFrom: Date,
    changes: [{ declarationKey: String, changeType: String, summary: String }],
    affectedScanIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PackScan" }],
    notifiedAt: Date,
  },
  { timestamps: true }
);

export const PackRuleset = mongoose.model("PackRuleset", packRulesetSchema);
export const PackScan = mongoose.model("PackScan", packScanSchema);
export const RulesetDiff = mongoose.model("RulesetDiff", rulesetDiffSchema);
