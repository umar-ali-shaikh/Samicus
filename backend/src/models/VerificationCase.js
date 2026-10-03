import mongoose from "mongoose";

const checkSchema = new mongoose.Schema(
  { type: String, status: { type: String, enum: ["pass", "fail", "pending"], default: "pending" }, evidenceKey: String },
  { _id: false }
);

const verificationCaseSchema = new mongoose.Schema(
  {
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    checks: [checkSchema],
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decision: { type: String, enum: ["pending", "approved", "sent_back"], default: "pending" },
    decidedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("VerificationCase", verificationCaseSchema);
