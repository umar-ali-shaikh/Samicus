import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema(
  { key: String, label: String, placeholder: String, type: { type: String, default: "text" }, required: Boolean, wide: Boolean, help: String },
  { _id: false }
);

const baseSectionSchema = new mongoose.Schema(
  { key: String, heading: String, bodyTemplate: String },
  { _id: false }
);

const docTemplateSchema = new mongoose.Schema(
  {
    category: String,
    name: { type: String, required: true },
    jurisdiction: String,
    version: { type: Number, default: 1 },
    locale: { type: String, default: "en" },
    blurb: String,
    pages: Number,
    baseSections: [baseSectionSchema],
    fieldSchema: [fieldSchema],
    stampDutyNote: String,
    draftFee: { type: Number, default: 0 },
    reviewFee: { type: Number, default: 1499 },
    publishedAt: { type: Date, default: Date.now },
    retiredAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("DocTemplate", docTemplateSchema);
