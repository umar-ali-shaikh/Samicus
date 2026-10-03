import mongoose from "mongoose";

const STAGES = ["intake", "lawyer_matched", "consultation", "engagement_confirmed", "action_in_progress", "resolution"];

const matterSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    title: { type: String, required: true },
    practiceAreaId: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeArea" },
    forum: String,
    stage: { type: String, enum: [...STAGES, "closed", "archived"], default: "intake" },
    nextAction: String,
    openedAt: { type: Date, default: Date.now },
    engagedAt: Date,
    closedAt: Date,
    archiveRetentionUntil: Date,
  },
  { timestamps: true }
);

matterSchema.statics.STAGES = STAGES;

export default mongoose.model("Matter", matterSchema);
