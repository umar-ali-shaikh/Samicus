import mongoose from "mongoose";

const lineItemSchema = new mongoose.Schema(
  {
    label: String,
    amount: Number,
    category: { type: String, enum: ["professional", "government", "platform"], required: true },
    taxRate: { type: Number, default: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "Matter", required: true },
    lineItems: [lineItemSchema],
    total: { type: Number, required: true },
    dueAt: Date,
    status: { type: String, enum: ["draft", "due", "paid", "overdue"], default: "due" },
  },
  { timestamps: true }
);

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    method: { type: String, enum: ["upi", "card", "net_banking"], required: true },
    gatewayRef: String,
    escrowState: { type: String, enum: ["held", "released", "refunded"], default: "held" },
    releasedAt: Date,
  },
  { timestamps: true }
);

export const Invoice = mongoose.model("Invoice", invoiceSchema);
export const Payment = mongoose.model("Payment", paymentSchema);
