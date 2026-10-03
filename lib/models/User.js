// lib/models/User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    _id: { type: String }, // e.g. "TCH101", "admin", "STU001"
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["admin", "teacher", "student"],
    },
    assigned_class: { type: String, default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    _id: false,
  }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
