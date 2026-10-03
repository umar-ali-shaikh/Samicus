import mongoose from "mongoose";

const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  audience: { type: String, enum: ["individual", "family", "business"], required: true },
  priceMonthly: { type: Number, default: 0 },
  entitlements: {
    consultations: Number,
    documentReviews: Number,
    seats: Number,
  },
});

const subscriptionSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    renewsAt: Date,
    usageCounters: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Plan = mongoose.model("Plan", planSchema);
export const Subscription = mongoose.model("Subscription", subscriptionSchema);
