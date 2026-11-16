// lib/models/Attendance.js
import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema(
  {
    student_id: { type: String, required: true, index: true },
    student_name: { type: String, required: true },
    class_name: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    date: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    status: {
      type: String,
      required: true,
      enum: ["PRESENT", "PRESENT_MANUAL", "FAILED_VERIFICATION", "ABSENT"],
    },
    method: {
      type: String,
      required: true,
      enum: ["AUTO", "MANUAL"],
    },
    confidence: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  {
    // Auto-generate numeric-like pk via virtuals (for API compat we expose _id as pk)
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual "pk" that maps to MongoDB _id (for backward compatibility with existing API responses)
AttendanceSchema.virtual("pk").get(function () {
  return this._id.toString();
});

export default mongoose.models.Attendance ||
  mongoose.model("Attendance", AttendanceSchema);
