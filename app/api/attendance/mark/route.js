import { NextResponse } from "next/server";
import { recordAttendance } from "@/lib/db-mongo.js";

// POST /api/attendance/mark
export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.studentId || !body.studentName || !body.className || !body.subject || !body.date || !body.status || !body.method) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await recordAttendance({
      studentId: body.studentId,
      studentName: body.studentName,
      className: body.className,
      subject: body.subject,
      date: body.date,
      status: body.status,
      method: body.method,
      confidence: body.confidence,
    });

    return NextResponse.json({
      success: true,
      message: `Attendance marked for ${body.studentName}: ${body.status}`,
    });
  } catch (err) {
    console.error("[POST /api/attendance/mark]", err);
    return NextResponse.json({ error: "Failed to mark attendance" }, { status: 500 });
  }
}
