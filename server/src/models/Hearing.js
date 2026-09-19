import mongoose from "mongoose";

const hearingSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    forum: String,
    courtHall: String,
    listedAt: { type: Date, required: true },
    purpose: String,
    outcomeNote: String,
  },
  { timestamps: true }
);

export default mongoose.model("Hearing", hearingSchema);
