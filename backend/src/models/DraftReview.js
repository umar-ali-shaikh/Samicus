import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  { clauseId: { type: mongoose.Schema.Types.ObjectId, ref: "ClauseLibrary" }, severity: String, body: String },
  { _id: false }
);

const draftReviewSchema = new mongoose.Schema(
  {
    draftId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentDraft", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    fee: { type: Number, default: 1499 },
    slaHours: { type: Number, default: 24 },
    markedUpDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    comments: [commentSchema],
    status: { type: String, enum: ["pending", "in_progress", "returned"], default: "pending" },
    submittedAt: { type: Date, default: Date.now },
    returnedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("DraftReview", draftReviewSchema);
