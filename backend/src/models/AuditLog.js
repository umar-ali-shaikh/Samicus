import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorRole: String,
    action: { type: String, required: true },
    subjectType: String,
    subjectId: mongoose.Schema.Types.ObjectId,
    reason: String,
    outcome: { type: String, enum: ["recorded", "denied"], default: "recorded" },
    ip: String,
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model("AuditLog", auditLogSchema);
