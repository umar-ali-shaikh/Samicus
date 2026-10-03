import mongoose from "mongoose";

const accountMemberSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "admin", "member", "finance", "viewer"], required: true },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
  },
  { timestamps: true }
);

accountMemberSchema.index({ accountId: 1, userId: 1 }, { unique: true });

export default mongoose.model("AccountMember", accountMemberSchema);
