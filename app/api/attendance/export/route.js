import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";

// ─── POST: Save attendance report as .xlsx on the server ─────────────────────

export async function POST(req) {
  try {
    const body = await req.json();
    const { records, className, subject, date } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ success: false, error: "Invalid records" }, { status: 400 });
    }

    // Build export directory
    const exportDir = path.join(process.cwd(), "data", "exports");
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // Build worksheet rows
    const sheetRows = records.map((s, i) => ({
      "#": i + 1,
      "Student ID": s.id,
      "Name": s.name,
      "Class": s.className || className,
      "Subject": subject || "N/A",
      "Date": date || new Date().toISOString().split("T")[0],
      "Status": s.status,
      "Confidence (%)":
        s.status && s.status.startsWith("PRESENT") && s.confidence != null
          ? `${Number(s.confidence).toFixed(1)}%`
          : "—",
      "Timestamp": s.timestamp || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);

    // Auto-width columns
    const colWidths = Object.keys(sheetRows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...sheetRows.map((r) => String(r[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    // Safe filename
    const sanitized = `${className}_${date}`.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const fileName = `attendance_${sanitized}.xlsx`;
    const filePath = path.join(exportDir, fileName);

    // Use native fs with binary buffer rather than XLSX.writeFile (which uses internal fs binding inside Webpack)
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({
      success: true,
      fileName,
      path: filePath,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/attendance/export] Error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── GET: List all saved export files ────────────────────────────────────────

export async function GET() {
  try {
    const exportDir = path.join(process.cwd(), "data", "exports");
    if (!fs.existsSync(exportDir)) {
      return NextResponse.json({ files: [] });
    }
    const files = fs
      .readdirSync(exportDir)
      .filter((f) => f.endsWith(".xlsx"))
      .map((f) => {
        const stat = fs.statSync(path.join(exportDir, f));
        return { name: f, size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ files });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ files: [], error: msg });
  }
}
