import mongoose from "mongoose";

const clauseLibrarySchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "DocTemplate", required: true },
    title: { type: String, required: true },
    bodyTemplate: { type: String, required: true }, // "{{field}}" tokens, rendered server-side
    rationaleNote: String,
    disposition: { type: String, enum: ["recommended", "optional", "review_advised"], default: "optional" },
    riskSide: { type: String, enum: ["client", "counterparty", "mutual"], default: "mutual" },
    favors: { type: String, enum: ["drafter", "counterparty", "balanced"], default: "balanced" },
    conflictsWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClauseLibrary" }],
    requiresFields: [String],
    authoredBy: String,
    approvedBy: String,
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.model("ClauseLibrary", clauseLibrarySchema);
