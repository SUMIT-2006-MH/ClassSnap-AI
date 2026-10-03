import { NextResponse } from "next/server";
import { upsertStudent } from "@/lib/db-mongo.js";

// POST /api/enroll
export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.studentId || !body.studentName || !body.descriptors?.length) {
      return NextResponse.json(
        { error: "studentId, studentName, and descriptors are required" },
        { status: 400 }
      );
    }

    if (body.descriptors.some((d) => d.length !== 128)) {
      return NextResponse.json(
        { error: "Each descriptor must be 128-dimensional" },
        { status: 400 }
      );
    }

    await upsertStudent(
      body.studentId.trim(),
      body.studentName.trim(),
      body.descriptors,
      body.className?.trim() || "Grade 10 - Section A"
    );

    return NextResponse.json({
      success: true,
      studentId: body.studentId,
      samplesStored: body.descriptors.length,
      className: body.className || "Grade 10 - Section A",
      message: `Enrolled ${body.studentName} with ${body.descriptors.length} face sample(s).`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/enroll]", msg);
    return NextResponse.json({ error: "Enrollment failed" }, { status: 500 });
  }
}
