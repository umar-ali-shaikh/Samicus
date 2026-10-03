import mongoose from "mongoose";

const conflictCheckSchema = new mongoose.Schema(
  {
    intakeId: { type: mongoose.Schema.Types.ObjectId, ref: "IntakeRequest", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    status: { type: String, enum: ["pending", "clear", "conflict"], default: "pending" },
    checkedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("ConflictCheck", conflictCheckSchema);
