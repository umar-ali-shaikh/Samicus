import mongoose from "mongoose";

const jurisdictionSchema = new mongoose.Schema(
  { state: String, forum: String },
  { _id: false }
);

const advocateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    barCouncil: { type: String, required: true },
    enrolmentNumber: { type: String, required: true },
    enrolmentYear: Number,
    verificationStatus: {
      type: String,
      enum: ["submitted", "documents_requested", "under_review", "verified", "rejected"],
      default: "submitted",
    },
    practiceAreas: [{ type: mongoose.Schema.Types.ObjectId, ref: "PracticeArea" }],
    subSpecialisations: [String],
    jurisdictions: [jurisdictionSchema],
    languages: [String],
    yearsOfPractice: Number,
    education: [String],
    relevantExperience: [String],
    consultationModes: [{ type: String, enum: ["video", "phone", "chat", "in_person"] }],
    instantFee: Number,
    scheduledFee: Number,
    availabilityState: { type: String, enum: ["available", "busy", "offline"], default: "offline" },
    acceptsUrgent: { type: Boolean, default: false },
    chamberAddress: String,
    city: String,
    keywords: [String],
  },
  { timestamps: true }
);

// Verification is a gate: only verified advocates are ever listable/searchable.
advocateSchema.index({ verificationStatus: 1 });

export default mongoose.model("Advocate", advocateSchema);
