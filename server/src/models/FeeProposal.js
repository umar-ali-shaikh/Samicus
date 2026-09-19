import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  { label: String, amount: Number, trigger: String },
  { _id: false }
);

const feeProposalSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    scopeText: String,
    milestones: [milestoneSchema],
    statutoryEstimate: String,
    exclusions: [String],
    validUntil: Date,
    acceptedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("FeeProposal", feeProposalSchema);
