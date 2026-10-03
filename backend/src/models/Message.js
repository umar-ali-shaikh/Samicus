import mongoose from "mongoose";

const messageThreadSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "MessageThread", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    body: { type: String, required: true },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }],
    sentAt: { type: Date, default: Date.now },
    readAt: Date,
  },
  { timestamps: false }
);

export const MessageThread = mongoose.model("MessageThread", messageThreadSchema);
export const Message = mongoose.model("Message", messageSchema);
