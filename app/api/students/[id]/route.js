import { NextResponse } from "next/server";
import { deleteStudent, getStudent } from "@/lib/db-mongo.js";

// GET /api/students/[id]
export async function GET(_req, { params }) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: student.id,
    name: student.name,
    descriptors: JSON.parse(student.descriptors || "[]"),
    sampleCount: student.sample_count,
  });
}

// DELETE /api/students/[id]
export async function DELETE(_req, { params }) {
  const { id } = await params;
  const deleted = await deleteStudent(id);
  if (!deleted) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, deletedId: id });
}
