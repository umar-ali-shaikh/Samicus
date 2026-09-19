import mongoose from "mongoose";

const practiceAreaSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  subSpecialisations: [String],
  typicalForums: [String],
  statuteTags: [String],
});

export default mongoose.model("PracticeArea", practiceAreaSchema);
