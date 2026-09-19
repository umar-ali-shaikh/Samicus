import mongoose from "mongoose";

// Pre-aggregated snapshot for one Command Centre tab. Real deployments would populate
// these via a scheduled aggregation job; for this build they are seeded directly.
const analyticsSnapshotSchema = new mongoose.Schema(
  {
    tab: { type: String, required: true, unique: true },
    period: { type: String, default: "last_30_days" },
    refreshedAt: { type: Date, default: Date.now },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const corporateAccountHealthSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
  name: String,
  plan: String,
  seats: Number,
  revenue12mo: Number,
  renewalDate: Date,
  score: { type: Number, min: 0, max: 100, required: true },
  band: { type: String, enum: ["healthy", "watch", "at_risk"], required: true },
  metrics: {
    users: Number,
    contractsUploaded: Number,
    draftsGenerated: Number,
    packScans: Number,
    openMatters: Number,
    pendingApprovals: Number,
    complianceAlerts: Number,
    subscriptionUsedPct: Number,
  },
  riskNarrative: String,
});

const advocatePerformanceRowSchema = new mongoose.Schema({
  advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
  period: { type: String, default: "last_30_days" },
  received: Number,
  accepted: Number,
  declined: Number,
  responseMinutes: Number,
  completed: Number,
  converted: Number,
  feesBilled: Number,
  csat: Number,
});

const knowledgeGapSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  askedCount: Number,
  missing: String,
  suggestedSource: String,
  priority: { type: String, enum: ["index_first", "high", "medium"], default: "medium" },
});

const complaintSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, unique: true },
    title: String,
    category: { type: String, enum: ["deliverable_delay", "compliance_coverage", "supply_gap", "citation_accuracy", "payment"] },
    status: { type: String, enum: ["open", "escalated", "resolved"], default: "open" },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    serviceInvolved: String,
    owner: String,
    rootCause: String,
    correctiveAction: String,
    refundAmount: Number,
    linkedRecordType: { type: String, enum: ["matter", "consultation", "pack_scan", "research_query", "payment"] },
    linkedRecordId: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true }
);

const adminAccessGrantSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    reason: { type: String, default: "" },
    outcome: { type: String, enum: ["recorded", "denied"], required: true },
  },
  { timestamps: true }
);

export const AnalyticsSnapshot = mongoose.model("AnalyticsSnapshot", analyticsSnapshotSchema);
export const CorporateAccountHealth = mongoose.model("CorporateAccountHealth", corporateAccountHealthSchema);
export const AdvocatePerformanceRow = mongoose.model("AdvocatePerformanceRow", advocatePerformanceRowSchema);
export const KnowledgeGap = mongoose.model("KnowledgeGap", knowledgeGapSchema);
export const Complaint = mongoose.model("Complaint", complaintSchema);
export const AdminAccessGrant = mongoose.model("AdminAccessGrant", adminAccessGrantSchema);
