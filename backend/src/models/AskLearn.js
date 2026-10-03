import mongoose from "mongoose";

const publicQuestionSchema = new mongoose.Schema(
  {
    authorAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, select: false },
    body: { type: String, required: true },
    practiceArea: String,
    city: String,
    status: { type: String, enum: ["pending_moderation", "published", "rejected"], default: "pending_moderation" },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const publicAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "PublicQuestion", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    body: { type: String, required: true },
    publishedAt: Date,
    helpfulCount: { type: Number, default: 0 },
    moderationState: { type: String, enum: ["pending", "published", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

const guideSchema = new mongoose.Schema({
  tag: String,
  title: { type: String, required: true },
  body: String,
  locale: { type: String, default: "en" },
  readMinutes: Number,
  reviewedByAdvocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate" },
  reviewedAt: Date,
  relatedSituationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Situation" }],
  relatedTemplateIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "DocTemplate" }],
});

const firmSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: String,
  practiceAreas: [String],
  advocateIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Advocate" }],
  benchStrength: Number,
  empanelmentNote: String,
  startingFee: Number,
  verificationStatus: { type: String, enum: ["verified", "unverified"], default: "unverified" },
});

export const PublicQuestion = mongoose.model("PublicQuestion", publicQuestionSchema);
export const PublicAnswer = mongoose.model("PublicAnswer", publicAnswerSchema);
export const Guide = mongoose.model("Guide", guideSchema);
export const Firm = mongoose.model("Firm", firmSchema);
