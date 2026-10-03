import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    email: String,
    fullName: { type: String, required: true },
    preferredLanguage: { type: String, enum: ["en", "hi"], default: "en" },
    city: String,
    state: String,
    kycStatus: { type: String, enum: ["unverified", "pending", "verified"], default: "unverified" },
    role: { type: String, enum: ["client", "advocate", "admin", "founder"], default: "client" },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
