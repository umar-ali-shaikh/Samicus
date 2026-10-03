import mongoose from "mongoose";

const scoreBreakdownSchema = new mongoose.Schema(
  {
    practiceArea: Number,
    subSpecialisation: Number,
    jurisdiction: Number,
    forum: Number,
    language: Number,
    mode: Number,
    availability: Number,
    relevantExperience: Number,
  },
  { _id: false }
);

const matchResultSchema = new mongoose.Schema(
  {
    intakeId: { type: mongoose.Schema.Types.ObjectId, ref: "IntakeRequest", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    rank: Number,
    scoreBreakdown: scoreBreakdownSchema,
    totalScore: Number,
    whyMatched: String,
    estimatedResponseSeconds: Number,
    quotedFee: Number,
  },
  { timestamps: true }
);

export default mongoose.model("MatchResult", matchResultSchema);
