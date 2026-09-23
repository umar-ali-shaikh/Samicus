import mongoose from "mongoose";

// One document per browser session (client-generated sessionId, stored in
// localStorage) so a page refresh can rehydrate the conversation instead of losing it.
// `result` is stored as-is (Mixed) — it's the same JSON shape answerLegalQuestion()
// already returns to the client, so there's nothing to normalize on the way in or out.
const turnSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, _id: false }
);

const legalAssistantSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    turns: [turnSchema],
  },
  { timestamps: true }
);

export default mongoose.model("LegalAssistantSession", legalAssistantSessionSchema);
