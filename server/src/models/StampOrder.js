import mongoose from "mongoose";

const stampOrderSchema = new mongoose.Schema(
  {
    draftId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentDraft", required: true },
    state: String,
    instrumentType: String,
    dutyAmount: Number,
    registrationRequired: { type: Boolean, default: false },
    providerRef: String,
    certificateKey: String,
    status: { type: String, enum: ["quoted", "paid", "issued"], default: "quoted" },
  },
  { timestamps: true }
);

export default mongoose.model("StampOrder", stampOrderSchema);
