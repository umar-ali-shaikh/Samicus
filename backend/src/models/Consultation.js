import mongoose from "mongoose";

const consultationSchema = new mongoose.Schema(
  {
    intakeId: { type: mongoose.Schema.Types.ObjectId, ref: "IntakeRequest", required: true },
    advocateId: { type: mongoose.Schema.Types.ObjectId, ref: "Advocate", required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    mode: { type: String, enum: ["video", "phone", "chat", "in_person"], required: true },
    scheduledStart: Date,
    durationMinutes: { type: Number, default: 30 },
    roomToken: String,
    state: {
      type: String,
      enum: ["scheduled", "reminder_sent", "in_progress", "completed", "notes_published", "rescheduled", "cancelled"],
      default: "scheduled",
    },
    recordingEnabled: { type: Boolean, default: false },
    notes: String,
    convertedMatterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter" },
    fees: {
      professionalFee: Number,
      platformFee: Number,
      gst: Number,
      total: Number,
    },
    paymentMethod: String,
    paidAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Consultation", consultationSchema);
