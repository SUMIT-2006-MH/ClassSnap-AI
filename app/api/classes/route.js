import { NextResponse } from "next/server";
import { getAllClasses, createClass, deleteClass } from "../../../lib/db-mongo";

// GET /api/classes — list all classes
export async function GET() {
  try {
    const classes = await getAllClasses();
    return NextResponse.json({ classes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/classes]", msg);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

// POST /api/classes — create a new class (Admin)
export async function POST(req) {
  try {
    const { name, section, defaultSubject } = await req.json();
    if (!name || !section) {
      return NextResponse.json(
        { error: "Class name and section are required" },
        { status: 400 }
      );
    }
    const newClass = await createClass(name.trim(), section.trim(), defaultSubject?.trim() || "General");
    return NextResponse.json({ success: true, class: newClass });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/classes]", msg);
    return NextResponse.json({ error: "Failed to create class" }, { status: 500 });
  }
}

// DELETE /api/classes?id=CLS_10A
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Class ID or Name is required" }, { status: 400 });
    }
    const success = await deleteClass(id);
    return NextResponse.json({ success, message: "Class deleted successfully" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/classes]", msg);
    return NextResponse.json({ error: "Failed to delete class" }, { status: 500 });
  }
}
