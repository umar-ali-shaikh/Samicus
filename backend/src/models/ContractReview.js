import mongoose from "mongoose";

const findingSchema = new mongoose.Schema(
  {
    clauseType: String,
    clauseRef: String,
    extractedText: String,
    libraryEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "ClauseLibrary" },
    favors: { type: String, enum: ["drafter", "counterparty", "balanced"] },
    deviationNote: String,
    recommendedAsk: String,
    authorityCitation: String,
  },
  { _id: true }
);

const contractReviewSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    contractType: String,
    counterpartyName: String,
    clausesIdentified: Number,
    findings: [findingSchema],
    redlineKey: String,
    advocateReviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", default: null },
    status: { type: String, enum: ["scanning", "done"], default: "scanning" },
  },
  { timestamps: true }
);

export default mongoose.model("ContractReview", contractReviewSchema);
