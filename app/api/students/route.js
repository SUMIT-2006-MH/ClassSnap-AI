import { NextResponse } from "next/server";
import { getAllStudents, upsertStudent } from "../../../lib/db-mongo";

// GET /api/students?class=Grade+10+-+Section+A
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const className = searchParams.get("class") ?? undefined;
    const students = await getAllStudents(className);
    const result = (students || []).map((s) => ({
      id: s.id,
      name: s.name,
      className: s.class_name,
      descriptors: JSON.parse(s.descriptors || "[]"),
      sampleCount: s.sample_count,
      enrolledAt: s.enrolled_at,
    }));
    return NextResponse.json({ students: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/students]", msg);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

// POST /api/students (Student Registration & Biometric Enrollment)
export async function POST(req) {
  try {
    const body = await req.json();
    const { studentId, studentName, className, descriptors } = body;

    if (!studentId || !studentName || !descriptors?.length) {
      return NextResponse.json(
        { error: "Student ID, Name, and face sample descriptors are required." },
        { status: 400 }
      );
    }

    await upsertStudent(
      studentId.trim(),
      studentName.trim(),
      descriptors,
      className?.trim() || "Grade 10 - Section A"
    );

    return NextResponse.json({
      success: true,
      studentId,
      studentName,
      className: className || "Grade 10 - Section A",
      sampleCount: descriptors.length,
      message: `Successfully registered student ${studentName} (${studentId}) in ${className || "Grade 10 - Section A"}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/students]", msg);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
