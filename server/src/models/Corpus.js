import mongoose from "mongoose";

const corpusDocumentSchema = new mongoose.Schema({
  source: { type: String, enum: ["bare_act", "supreme_court", "high_court", "rules", "ccpa", "asci"], required: true },
  citation: { type: String, required: true },
  title: { type: String, required: true },
  court: String,
  decidedOn: Date,
  actName: String,
  sectionNumber: String,
  amendmentAsOf: Date,
  canonicalUrl: String,
  rawText: String,
  treatment: String, // e.g. "GOOD LAW", "IN FORCE", "OVERRULED"
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: "CorpusDocument", default: null },
  indexedAt: { type: Date, default: Date.now },
});

const corpusChunkSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: "CorpusDocument", required: true },
  ordinal: Number,
  text: { type: String, required: true },
  charRange: [Number],
  sectionLabel: String,
  paragraphClass: {
    type: String,
    enum: ["provision", "facts", "issues", "petitioner_arguments", "respondent_arguments", "reasoning", "holding", "directions"],
    required: true,
  },
  paraNumber: String,
  deepLink: String,
  headnoteFlag: { type: Boolean, default: false },
  tokenCount: Number,
  keywords: [String], // dev-mode retrieval substitute for a real vector index
});

export const CorpusDocument = mongoose.model("CorpusDocument", corpusDocumentSchema);
export const CorpusChunk = mongoose.model("CorpusChunk", corpusChunkSchema);
