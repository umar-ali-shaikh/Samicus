import mongoose from "mongoose";

const situationSchema = new mongoose.Schema(
  {
    labelEn: { type: String, required: true },
    labelHi: { type: String, required: true },
    mappedPracticeAreaId: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeArea", required: true },
    urgencyDefault: { type: String, enum: ["today", "48h", "week", "deadline"], default: "week" },
    routingNote: String,
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.model("Situation", situationSchema);
