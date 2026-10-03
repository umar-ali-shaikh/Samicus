import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["individual", "family", "business"], required: true },
    displayName: { type: String, required: true },
    gstin: String,
    cin: String,
    billingAddress: String,
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
    seatLimit: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.model("Account", accountSchema);
