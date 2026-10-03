import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
  category: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  professionalFee: { type: Number, required: true },
  governmentFee: { type: Number, default: 0 },
  timelineDays: Number,
  includes: [String],
  requiredDocuments: [String],
  deliverables: [String],
  defaultAdvocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate" },
});

const serviceOrderSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    status: { type: String, enum: ["started", "in_progress", "delivered", "abandoned"], default: "started" },
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter" },
  },
  { timestamps: true }
);

export const Service = mongoose.model("Service", serviceSchema);
export const ServiceOrder = mongoose.model("ServiceOrder", serviceOrderSchema);
