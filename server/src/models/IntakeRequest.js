import mongoose from "mongoose";

const intakeRequestSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    description: String, // treated as sensitive; withheld from advocate until conflict clear + consent
    voiceTranscriptId: String,
    situationId: { type: mongoose.Schema.Types.ObjectId, ref: "Situation" },
    routedPracticeAreaId: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeArea" },
    routingConfidence: Number,
    urgency: { type: String, enum: ["today", "48h", "week", "deadline"], required: true },
    city: String,
    state: String,
    forum: String,
    mode: { type: String, enum: ["video", "phone", "chat", "in_person"], required: true },
    language: { type: String, required: true },
    kind: { type: String, enum: ["instant", "scheduled", "urgent"], required: true },
    status: {
      type: String,
      enum: ["created", "searching", "advocate_reviewing", "matched", "connected", "completed", "none_available", "callback_scheduled", "declined"],
      default: "created",
    },
    consentGivenAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("IntakeRequest", intakeRequestSchema);
