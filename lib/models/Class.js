// lib/models/Class.js
import mongoose from "mongoose";

const ClassSchema = new mongoose.Schema(
  {
    _id: { type: String }, // e.g. "CLS_10A"
    name: { type: String, required: true, unique: true, trim: true },
    section: { type: String, required: true, trim: true },
    default_subject: { type: String, required: true, default: "General" },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    _id: false, // we supply our own string _id
  }
);

// Prevent model recompilation during hot reload
export default mongoose.models.Class || mongoose.model("Class", ClassSchema);
