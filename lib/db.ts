import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "classsnap.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      section TEXT NOT NULL,
      default_subject TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
      assigned_class TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL DEFAULT 'Grade 10 - Section A',
      descriptors TEXT NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 1,
      enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      pk INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT','PRESENT_MANUAL','FAILED_VERIFICATION')),
      method TEXT NOT NULL CHECK(method IN ('AUTO','MANUAL')),
      confidence REAL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_class ON attendance(class_name);
  `);

  // Safely check if class_name column exists in students (for existing DB migration)
  try {
    const studentCols = db.prepare("PRAGMA table_info(students)").all() as { name: string }[];
    if (!studentCols.some((c) => c.name === "class_name")) {
      db.exec("ALTER TABLE students ADD COLUMN class_name TEXT DEFAULT 'Grade 10 - Section A'");
    }
    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userCols.some((c) => c.name === "assigned_class")) {
      db.exec("ALTER TABLE users ADD COLUMN assigned_class TEXT");
    }
  } catch (e) {
    console.error("Migration check error:", e);
  }

  // Seed default classes if empty
  const classCount = db.prepare("SELECT count(*) as cnt FROM classes").get() as { cnt: number };
  if (classCount.cnt === 0) {
    const insertClass = db.prepare(
      "INSERT OR IGNORE INTO classes (id, name, section, default_subject) VALUES (?, ?, ?, ?)"
    );
    insertClass.run("CLS_10A", "Grade 10 - Section A", "Section A", "Computer Science");
    insertClass.run("CLS_10B", "Grade 10 - Section B", "Section B", "Mathematics");
    insertClass.run("CLS_11A", "Grade 11 - Science", "Section A", "Physics");
    insertClass.run("CLS_12A", "Grade 12 - Commerce", "Section A", "Economics");
  }

  // Seed default users if empty
  const userCount = db.prepare("SELECT count(*) as cnt FROM users").get() as { cnt: number };
  if (userCount.cnt === 0) {
    const insertUser = db.prepare(
      "INSERT OR IGNORE INTO users (id, name, password, role, assigned_class) VALUES (?, ?, ?, ?, ?)"
    );

    // 1. Admin account
    insertUser.run("admin", "Administrator", "admin123", "admin", null);

    // 2. Teacher accounts
    insertUser.run("TCH101", "Prof. Sharma", "teacher123", "teacher", "Grade 10 - Section A");
    insertUser.run("TCH102", "Dr. Ananya Rao", "teacher123", "teacher", "Grade 10 - Section B");

    // 3. Student accounts
    insertUser.run("STU001", "Rahul Sharma", "student123", "student", "Grade 10 - Section A");
    insertUser.run("STU002", "Amit Verma", "student123", "student", "Grade 10 - Section A");
    insertUser.run("STU003", "Pooja Patel", "student123", "student", "Grade 10 - Section A");
    insertUser.run("STU004", "Sneha Reddy", "student123", "student", "Grade 10 - Section A");
    insertUser.run("STU005", "Karan Malhotra", "student123", "student", "Grade 10 - Section B");
    insertUser.run("STU006", "Riya Sen", "student123", "student", "Grade 10 - Section B");
    insertUser.run("STU007", "Aryan Joshi", "student123", "student", "Grade 11 - Science");
    insertUser.run("STU008", "Meera Nair", "student123", "student", "Grade 12 - Commerce");
  }

  // Seed default students if empty
  const studentCount = db.prepare("SELECT count(*) as cnt FROM students").get() as { cnt: number };
  if (studentCount.cnt === 0) {
    const insertStudent = db.prepare(
      "INSERT OR IGNORE INTO students (id, name, class_name, descriptors, sample_count) VALUES (?, ?, ?, ?, ?)"
    );
    insertStudent.run("STU001", "Rahul Sharma", "Grade 10 - Section A", "[]", 0);
    insertStudent.run("STU002", "Amit Verma", "Grade 10 - Section A", "[]", 0);
    insertStudent.run("STU003", "Pooja Patel", "Grade 10 - Section A", "[]", 0);
    insertStudent.run("STU004", "Sneha Reddy", "Grade 10 - Section A", "[]", 0);
    insertStudent.run("STU005", "Karan Malhotra", "Grade 10 - Section B", "[]", 0);
    insertStudent.run("STU006", "Riya Sen", "Grade 10 - Section B", "[]", 0);
    insertStudent.run("STU007", "Aryan Joshi", "Grade 11 - Science", "[]", 0);
    insertStudent.run("STU008", "Meera Nair", "Grade 12 - Commerce", "[]", 0);
  }
}

// ─── Classes CRUD ─────────────────────────────────────────────────────────────

export interface ClassRow {
  id: string;
  name: string;
  section: string;
  default_subject: string;
  created_at: string;
}

export function getAllClasses(): ClassRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM classes ORDER BY name").all() as ClassRow[];
}

export function createClass(name: string, section: string, defaultSubject: string): ClassRow {
  const db = getDb();
  const id = `CLS_${Date.now()}`;
  db.prepare("INSERT INTO classes (id, name, section, default_subject) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    section,
    defaultSubject
  );
  return { id, name, section, default_subject: defaultSubject, created_at: new Date().toISOString() };
}

export function deleteClass(nameOrId: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM classes WHERE id = ? OR name = ?").run(nameOrId, nameOrId);
  return res.changes > 0;
}

// ─── User Authentication & Teacher Management ────────────────────────────────

export interface UserRow {
  id: string;
  name: string;
  role: "admin" | "teacher" | "student";
  assigned_class?: string | null;
  created_at?: string;
}

export function verifyUser(id: string, password: string): UserRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, name, role, assigned_class FROM users WHERE LOWER(id) = LOWER(?) AND password = ?")
    .get(id, password) as UserRow | undefined;
  return row || null;
}

export function getUser(id: string): UserRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, name, role, assigned_class FROM users WHERE LOWER(id) = LOWER(?)")
    .get(id) as UserRow | undefined;
  return row || null;
}

export function getAllUsers(): UserRow[] {
  const db = getDb();
  return db.prepare("SELECT id, name, role, assigned_class, created_at FROM users ORDER BY role, name").all() as UserRow[];
}

export function getTeachers(): UserRow[] {
  const db = getDb();
  return db
    .prepare("SELECT id, name, role, assigned_class, created_at FROM users WHERE role = 'teacher' ORDER BY name")
    .all() as UserRow[];
}

export function registerUser(
  id: string,
  name: string,
  password: string,
  role: "admin" | "teacher" | "student",
  assignedClass?: string | null
): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO users (id, name, password, role, assigned_class) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, password, role, assignedClass || null);
}

export function deleteUser(id: string): boolean {
  const db = getDb();
  // Prevent deleting master admin
  if (id.toLowerCase() === "admin") return false;
  const res = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return res.changes > 0;
}

// ─── Student CRUD ─────────────────────────────────────────────────────────────

export interface StudentRow {
  id: string;
  name: string;
  class_name: string;
  descriptors: string; // JSON: number[][]
  sample_count: number;
  enrolled_at: string;
  updated_at: string;
}

export function getStudent(id: string): StudentRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM students WHERE id = ?").get(id) as StudentRow | undefined;
}

export function getAllStudents(className?: string): StudentRow[] {
  const db = getDb();
  if (className && className !== "ALL") {
    return db
      .prepare("SELECT * FROM students WHERE class_name = ? ORDER BY name")
      .all(className) as StudentRow[];
  }
  return db.prepare("SELECT * FROM students ORDER BY class_name, name").all() as StudentRow[];
}

export function upsertStudent(
  id: string,
  name: string,
  descriptors: number[][],
  className: string = "Grade 10 - Section A"
): void {
  const db = getDb();
  const existing = getStudent(id);
  if (existing) {
    const prev: number[][] = JSON.parse(existing.descriptors);
    const merged = [...prev, ...descriptors].slice(-10);
    db.prepare(`
      UPDATE students
      SET name = ?, class_name = ?, descriptors = ?, sample_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, className, JSON.stringify(merged), merged.length, id);
  } else {
    db.prepare(`
      INSERT INTO students (id, name, class_name, descriptors, sample_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, className, JSON.stringify(descriptors), descriptors.length);
  }

  // Automatically register student user account if it doesn't exist
  registerUser(id, name, "student123", "student", className);
}

export function deleteStudent(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM students WHERE id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(id);
  return result.changes > 0;
}

// ─── Attendance CRUD ──────────────────────────────────────────────────────────

export interface AttendanceRow {
  pk: number;
  student_id: string;
  student_name: string;
  class_name: string;
  subject: string;
  date: string;
  status: string;
  method: string;
  confidence: number | null;
  timestamp: string;
}

export function recordAttendance(params: {
  studentId: string;
  studentName: string;
  className: string;
  subject: string;
  date: string;
  status: "PRESENT" | "PRESENT_MANUAL" | "FAILED_VERIFICATION";
  method: "AUTO" | "MANUAL";
  confidence?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO attendance (student_id, student_name, class_name, subject, date, status, method, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.studentId,
    params.studentName,
    params.className,
    params.subject,
    params.date,
    params.status,
    params.method,
    params.confidence ?? null
  );
}

export function clearAttendance(date: string, className?: string): number {
  const db = getDb();
  if (className && className !== "ALL") {
    const res = db.prepare("DELETE FROM attendance WHERE date = ? AND class_name = ?").run(date, className);
    return res.changes;
  }
  const res = db.prepare("DELETE FROM attendance WHERE date = ?").run(date);
  return res.changes;
}

export function getAttendance(date?: string, className?: string, studentId?: string): AttendanceRow[] {
  const db = getDb();
  let query = "SELECT * FROM attendance WHERE 1=1";
  const params: string[] = [];

  if (date) {
    query += " AND date = ?";
    params.push(date);
  }
  if (className && className !== "ALL") {
    query += " AND class_name = ?";
    params.push(className);
  }
  if (studentId) {
    query += " AND student_id = ?";
    params.push(studentId);
  }

  query += " ORDER BY timestamp DESC LIMIT 500";
  return db.prepare(query).all(...params) as AttendanceRow[];
}
