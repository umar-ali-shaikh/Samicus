import mongoose from "mongoose";

const timelineEventSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    type: String,
    title: { type: String, required: true },
    body: String,
    actorType: { type: String, enum: ["user", "advocate", "system", "platform"], required: true },
    actorId: mongoose.Schema.Types.ObjectId,
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Append-only per the data-model doc: no updates/deletes exposed via the API layer.

export default mongoose.model("TimelineEvent", timelineEventSchema);
