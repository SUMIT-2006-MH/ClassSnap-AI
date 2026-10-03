import { NextResponse } from "next/server";
import { getAttendance, clearAttendance } from "@/lib/db-mongo.js";

// GET /api/attendance?date=YYYY-MM-DD&class=Grade+10+-+Section+A&student_id=STU001
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? undefined;
    const className = searchParams.get("class") ?? undefined;
    const studentId = searchParams.get("student_id") ?? undefined;
    const records = await getAttendance(date, className, studentId);
    return NextResponse.json({ records });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/attendance]", msg);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

// DELETE /api/attendance?date=YYYY-MM-DD&class=Grade+10+-+Section+A
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const className = searchParams.get("class") ?? undefined;

    if (!date) {
      return NextResponse.json({ error: "Date parameter is required to reset attendance" }, { status: 400 });
    }

    const deletedCount = await clearAttendance(date, className);
    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/attendance]", msg);
    return NextResponse.json({ error: "Failed to reset attendance" }, { status: 500 });
  }
}
