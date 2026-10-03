import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    label: { type: String, required: true },
    ownerType: { type: String, enum: ["client", "advocate"], default: "client" },
    dueAt: Date,
    isStatutoryDeadline: { type: Boolean, default: false },
    completedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);
