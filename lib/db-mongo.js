// lib/db-mongo.js
// MongoDB with instant, persistent SQLite fallback if cloud cluster is unreachable

import connectDB from "./mongoose.js";
import ClassModel from "./models/Class.js";
import UserModel from "./models/User.js";
import StudentModel from "./models/Student.js";
import AttendanceModel from "./models/Attendance.js";
import * as sqliteDb from "./db";

let isAtlasAvailable = false; // default to false until proven online
let lastCheckTime = 0;
const RETRY_INTERVAL = 60000; // only attempt to ping Atlas once every 60 seconds

async function checkAtlasConnection() {
  const now = Date.now();
  if (!isAtlasAvailable && now - lastCheckTime < RETRY_INTERVAL) {
    return false;
  }
  lastCheckTime = now;
  try {
    await connectDB();
    isAtlasAvailable = true;
    return true;
  } catch {
    isAtlasAvailable = false;
    return false;
  }
}

// ─── Classes CRUD ─────────────────────────────────────────────────────────────

export async function getAllClasses() {
  if (await checkAtlasConnection()) {
    try {
      const docs = await ClassModel.find().sort({ name: 1 }).lean();
      return docs.map((d) => ({
        id: d._id,
        name: d.name,
        section: d.section,
        default_subject: d.default_subject,
        created_at: d.created_at,
      }));
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getAllClasses();
}

export async function createClass(name, section, defaultSubject) {
  if (await checkAtlasConnection()) {
    try {
      const id = `CLS_${Date.now()}`;
      const doc = await ClassModel.create({
        _id: id,
        name,
        section,
        default_subject: defaultSubject || "General",
      });
      try { sqliteDb.createClass(name, section, defaultSubject); } catch {}
      return {
        id: doc._id,
        name: doc.name,
        section: doc.section,
        default_subject: doc.default_subject,
        created_at: doc.created_at,
      };
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.createClass(name, section, defaultSubject);
}

export async function deleteClass(nameOrId) {
  if (await checkAtlasConnection()) {
    try {
      const res = await ClassModel.deleteOne({
        $or: [{ _id: nameOrId }, { name: nameOrId }],
      });
      try { sqliteDb.deleteClass(nameOrId); } catch {}
      return res.deletedCount > 0;
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.deleteClass(nameOrId);
}

// ─── User Auth & Teacher Management ──────────────────────────────────────────

export async function verifyUser(id, password) {
  if (await checkAtlasConnection()) {
    try {
      const user = await UserModel.findOne({
        _id: { $regex: new RegExp(`^${id}$`, "i") },
        password,
      }).lean();
      if (user) {
        return {
          id: user._id,
          name: user.name,
          role: user.role,
          assigned_class: user.assigned_class ?? null,
        };
      }
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.verifyUser(id, password);
}

export async function getUser(id) {
  if (await checkAtlasConnection()) {
    try {
      const user = await UserModel.findOne({
        _id: { $regex: new RegExp(`^${id}$`, "i") },
      }).lean();
      if (user) {
        return {
          id: user._id,
          name: user.name,
          role: user.role,
          assigned_class: user.assigned_class ?? null,
        };
      }
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getUser(id);
}

export async function getAllUsers() {
  if (await checkAtlasConnection()) {
    try {
      const users = await UserModel.find().sort({ role: 1, name: 1 }).lean();
      return users.map((u) => ({
        id: u._id,
        name: u.name,
        role: u.role,
        assigned_class: u.assigned_class ?? null,
        created_at: u.created_at,
      }));
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getAllUsers();
}

export async function getTeachers() {
  if (await checkAtlasConnection()) {
    try {
      const users = await UserModel.find({ role: "teacher" }).sort({ name: 1 }).lean();
      return users.map((u) => ({
        id: u._id,
        name: u.name,
        role: u.role,
        assigned_class: u.assigned_class ?? null,
        created_at: u.created_at,
      }));
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getTeachers();
}

export async function registerUser(id, name, password, role, assignedClass) {
  // Always register in local database first so it is instantly available with 0 delay
  sqliteDb.registerUser(id, name, password, role, assignedClass);

  if (await checkAtlasConnection()) {
    try {
      await UserModel.findByIdAndUpdate(
        id,
        { name, password, role, assigned_class: assignedClass || null },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    } catch {
      isAtlasAvailable = false;
    }
  }
}

export async function deleteUser(id) {
  const localSuccess = sqliteDb.deleteUser(id);

  if (await checkAtlasConnection()) {
    try {
      if (id.toLowerCase() === "admin") return false;
      await UserModel.deleteOne({ _id: id });
    } catch {
      isAtlasAvailable = false;
    }
  }
  return localSuccess;
}

// ─── Student CRUD ─────────────────────────────────────────────────────────────

export async function getStudent(id) {
  if (await checkAtlasConnection()) {
    try {
      const s = await StudentModel.findById(id).lean();
      if (s) {
        return {
          id: s._id,
          name: s.name,
          class_name: s.class_name,
          descriptors: s.descriptors,
          sample_count: s.sample_count,
          enrolled_at: s.enrolled_at,
          updated_at: s.updated_at,
        };
      }
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getStudent(id);
}

export async function getAllStudents(className) {
  if (await checkAtlasConnection()) {
    try {
      const filter = className && className !== "ALL" ? { class_name: className } : {};
      const docs = await StudentModel.find(filter).sort({ class_name: 1, name: 1 }).lean();
      return docs.map((s) => ({
        id: s._id,
        name: s.name,
        class_name: s.class_name,
        descriptors: s.descriptors,
        sample_count: s.sample_count,
        enrolled_at: s.enrolled_at,
        updated_at: s.updated_at,
      }));
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getAllStudents(className);
}

export async function upsertStudent(id, name, descriptors, className = "Grade 10 - Section A") {
  sqliteDb.upsertStudent(id, name, descriptors, className);

  if (await checkAtlasConnection()) {
    try {
      const existing = await StudentModel.findById(id).lean();
      if (existing) {
        const prev = JSON.parse(existing.descriptors || "[]");
        const merged = [...prev, ...descriptors].slice(-10);
        await StudentModel.findByIdAndUpdate(id, {
          name,
          class_name: className,
          descriptors: JSON.stringify(merged),
          sample_count: merged.length,
        });
      } else {
        await StudentModel.create({
          _id: id,
          name,
          class_name: className,
          descriptors: JSON.stringify(descriptors),
          sample_count: descriptors.length,
        });
      }
      await registerUser(id, name, "student123", "student", className);
    } catch {
      isAtlasAvailable = false;
    }
  }
}

export async function deleteStudent(id) {
  const localSuccess = sqliteDb.deleteStudent(id);

  if (await checkAtlasConnection()) {
    try {
      await StudentModel.deleteOne({ _id: id });
      await UserModel.deleteOne({ _id: id, role: "student" });
    } catch {
      isAtlasAvailable = false;
    }
  }
  return localSuccess;
}

// ─── Attendance CRUD ──────────────────────────────────────────────────────────

export async function recordAttendance(params) {
  sqliteDb.recordAttendance(params);

  if (await checkAtlasConnection()) {
    try {
      await AttendanceModel.create({
        student_id: params.studentId,
        student_name: params.studentName,
        class_name: params.className,
        subject: params.subject,
        date: params.date,
        status: params.status,
        method: params.method,
        confidence: params.confidence ?? null,
        timestamp: new Date(),
      });
    } catch {
      isAtlasAvailable = false;
    }
  }
}

export async function clearAttendance(date, className) {
  const count = sqliteDb.clearAttendance(date, className);

  if (await checkAtlasConnection()) {
    try {
      const filter = { date };
      if (className && className !== "ALL") filter.class_name = className;
      await AttendanceModel.deleteMany(filter);
    } catch {
      isAtlasAvailable = false;
    }
  }
  return count;
}

export async function getAttendance(date, className, studentId) {
  if (await checkAtlasConnection()) {
    try {
      const filter = {};
      if (date) filter.date = date;
      if (className && className !== "ALL") filter.class_name = className;
      if (studentId) filter.student_id = studentId;

      const docs = await AttendanceModel.find(filter)
        .sort({ timestamp: -1 })
        .limit(500)
        .lean();

      return docs.map((r) => ({
        pk: r._id.toString(),
        student_id: r.student_id,
        student_name: r.student_name,
        class_name: r.class_name,
        subject: r.subject,
        date: r.date,
        status: r.status,
        method: r.method,
        confidence: r.confidence ?? null,
        timestamp: r.timestamp,
      }));
    } catch {
      isAtlasAvailable = false;
    }
  }
  return sqliteDb.getAttendance(date, className, studentId);
}
