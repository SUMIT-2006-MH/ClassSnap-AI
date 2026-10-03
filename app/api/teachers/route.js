import { NextResponse } from "next/server";
import { getTeachers, registerUser, deleteUser } from "@/lib/db-mongo.js";

// GET /api/teachers — list all teachers
export async function GET() {
  try {
    const teachers = await getTeachers();
    return NextResponse.json({ teachers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/teachers]", msg);
    return NextResponse.json({ error: "Failed to fetch teachers" }, { status: 500 });
  }
}

// POST /api/teachers — register/add a new teacher
export async function POST(req) {
  try {
    const { id, name, password, assignedClass } = await req.json();

    if (!id || !name || !password) {
      return NextResponse.json(
        { error: "Teacher ID, Name, and Password are required" },
        { status: 400 }
      );
    }

    await registerUser(
      id.trim().toUpperCase(),
      name.trim(),
      password.trim(),
      "teacher",
      assignedClass?.trim() || null
    );

    return NextResponse.json({
      success: true,
      message: `Teacher ${name} (${id.toUpperCase()}) registered successfully!`,
      teacher: {
        id: id.trim().toUpperCase(),
        name: name.trim(),
        role: "teacher",
        assigned_class: assignedClass?.trim() || null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/teachers]", msg);
    return NextResponse.json({ error: "Failed to register teacher" }, { status: 500 });
  }
}

// DELETE /api/teachers?id=TCH101 — remove a teacher
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Teacher ID is required" }, { status: 400 });
    }

    const success = await deleteUser(id.trim());
    if (!success) {
      return NextResponse.json(
        { error: "Teacher not found or cannot delete master administrator" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Teacher ${id} removed successfully.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/teachers]", msg);
    return NextResponse.json({ error: "Failed to remove teacher" }, { status: 500 });
  }
}
