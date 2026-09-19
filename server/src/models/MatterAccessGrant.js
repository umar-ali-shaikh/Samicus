import mongoose from "mongoose";

const matterAccessGrantSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subjectType: { type: String, enum: ["user", "advocate"], required: true },
    subjectName: String,
    subjectRole: String,
    scope: [{ type: String, enum: ["documents", "messages", "tasks", "fees"] }],
    grantedAt: { type: Date, default: Date.now },
    revokedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("MatterAccessGrant", matterAccessGrantSchema);
