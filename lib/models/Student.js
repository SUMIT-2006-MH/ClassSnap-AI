// lib/models/Student.js
import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
  {
    _id: { type: String }, // e.g. "STU001"
    name: { type: String, required: true, trim: true },
    class_name: {
      type: String,
      required: true,
      default: "Grade 10 - Section A",
    },
    // Face descriptors stored as array of 128-d arrays (kept as JSON string for compat)
    descriptors: { type: String, required: true, default: "[]" },
    sample_count: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "enrolled_at", updatedAt: "updated_at" },
    _id: false,
  }
);

export default mongoose.models.Student || mongoose.model("Student", StudentSchema);
