import mongoose from "mongoose";

const researchQuerySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
    text: { type: String, required: true },
    locale: { type: String, default: "en" },
    sourcesEnabled: [String],
    retrievedChunkIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "CorpusChunk" }],
    scores: [Number],
    threshold: { type: Number, default: 0.62 },
    outcome: { type: String, enum: ["answered", "partial", "not_found"], required: true },
    modelVersion: { type: String, default: "fixture-1" },
    promptVersion: { type: String, default: "v1" },
    latencyMs: Number,
  },
  { timestamps: true }
);

const segmentSchema = new mongoose.Schema(
  { text: String, chunkId: { type: mongoose.Schema.Types.ObjectId, ref: "CorpusChunk", required: true } },
  { _id: false }
);

const researchAnswerSchema = new mongoose.Schema(
  {
    queryId: { type: mongoose.Schema.Types.ObjectId, ref: "ResearchQuery", required: true },
    segments: [segmentSchema],
    caveatText: String,
    unsupportedSpanCount: { type: Number, default: 0 },
    reviewedByAdvocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", default: null },
    helpful: { type: Boolean, default: null },
  },
  { timestamps: true }
);

export const ResearchQuery = mongoose.model("ResearchQuery", researchQuerySchema);
export const ResearchAnswer = mongoose.model("ResearchAnswer", researchAnswerSchema);
