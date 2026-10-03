import mongoose from "mongoose";

const customClauseSchema = new mongoose.Schema({ title: String, body: String }, { _id: false });

const documentDraftSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "DocTemplate", required: true },
    templateVersion: { type: Number, required: true },
    fieldValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    selectedClauseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClauseLibrary" }],
    customClauses: [customClauseSchema],
    status: { type: String, enum: ["draft", "sent_for_review", "reviewed", "rendered"], default: "draft" },
    renderKeys: { docx: String, pdf: String },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "DraftReview", default: null },
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default mongoose.model("DocumentDraft", documentDraftSchema);
