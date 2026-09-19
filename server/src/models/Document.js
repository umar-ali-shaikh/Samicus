import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", default: null },
    filename: { type: String, required: true },
    mime: String,
    sizeBytes: Number,
    kind: { type: String, enum: ["Notices", "Agreements", "Evidence", "Invoices", "Other"], default: "Other" },
    storageKey: String,
    encryptionKeyId: { type: String, default: "dev-key-1" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "Advocate" }],
    virusScanStatus: { type: String, enum: ["pending", "clean", "infected"], default: "clean" },
  },
  { timestamps: true }
);

export default mongoose.model("Document", documentSchema);
