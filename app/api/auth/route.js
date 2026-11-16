import { NextResponse } from "next/server";
import { verifyUser, getAllUsers } from "../../../lib/db-mongo";

// POST /api/auth
export async function POST(req) {
  try {
    const { id, password } = await req.json();

    if (!id || !password) {
      return NextResponse.json(
        { error: "User ID and password are required" },
        { status: 400 }
      );
    }

    const user = await verifyUser(id.trim(), password.trim());

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials. Please check your ID and password." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user,
      message: `Welcome back, ${user.name}!`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/auth]", msg);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

// GET /api/auth — returns available demo accounts
export async function GET() {
  try {
    const users = await getAllUsers();
    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/auth]", msg);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
