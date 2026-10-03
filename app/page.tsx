"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  className: string;
  status: "PENDING" | "PRESENT" | "PRESENT_MANUAL" | "FAILED_VERIFICATION" | "ABSENT";
  confidence?: number;
  timestamp?: string;
  enrolled?: boolean;
}

interface EnrolledStudent {
  id: string;
  name: string;
  className: string;
  descriptors: number[][];
  sampleCount: number;
}

interface ClassItem {
  id: string;
  name: string;
  section: string;
  default_subject: string;
}

interface TeacherUser {
  id: string;
  name: string;
  role: "teacher";
  assigned_class?: string | null;
  created_at?: string;
}

interface UserSession {
  id: string;
  name: string;
  role: "admin" | "teacher";
  assigned_class?: string | null;
}

interface AttendanceRecord {
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

interface FaceApiModule {
  nets: {
    ssdMobilenetv1: { loadFromUri: (url: string) => Promise<void> };
    faceLandmark68Net: { loadFromUri: (url: string) => Promise<void> };
    faceRecognitionNet: { loadFromUri: (url: string) => Promise<void> };
  };
  detectSingleFace: (input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement) => SsdDetectionChain;
  LabeledFaceDescriptors: new (label: string, descriptors: Float32Array[]) => LabeledFaceDescriptors;
  FaceMatcher: new (inputs: LabeledFaceDescriptors | LabeledFaceDescriptors[], distanceThreshold?: number) => FaceMatcher;
  euclideanDistance: (a: number[] | Float32Array, b: number[] | Float32Array) => number;
}

interface SsdDetectionChain {
  withFaceLandmarks: () => SsdDetectionChain;
  withFaceDescriptor: () => Promise<{ descriptor: Float32Array; detection: { score: number } } | undefined>;
}

interface LabeledFaceDescriptors {
  label: string;
  descriptors: Float32Array[];
}

interface FaceMatcher {
  findBestMatch: (descriptor: Float32Array) => { label: string; distance: number };
}

const MODEL_URL = "/models";
const SIMILARITY_THRESHOLD = 0.55;
const DEFAULT_SIMILARITY_THRESHOLD = 0.80; // 80% threshold

export default function Home() {
  // Model state
  const [faceapi, setFaceapi] = useState<FaceApiModule | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginRoleTab, setLoginRoleTab] = useState<"teacher" | "admin">("teacher");
  const [isTeacherRegisterMode, setIsTeacherRegisterMode] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Teacher Registration Form State (Self-serve or in modal)
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherClass, setNewTeacherClass] = useState("Grade 10 - Section A");

  // Navigation Tabs based on Role
  const [activeTab, setActiveTab] = useState<string>("home");

  // Class Selection System
  const [classesList, setClassesList] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState("Grade 10 - Section A");
  const [selectedSubject, setSelectedSubject] = useState("Computer Science");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  // Attendance Register State
  const [students, setStudents] = useState<Student[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<{
    status: "idle" | "success" | "rejected" | "error";
    message: string;
    score?: number;
    threshold?: number;
  }>({ status: "idle", message: "Ready for camera capture." });

  // Autonomous Face Recognition & Auto-Attendance State
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [thresholdPercent, setThresholdPercent] = useState(78); // default 78% (within 75‑80% range)
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoScanStatus, setAutoScanStatus] = useState<string>(
    "Camera idle. Enable camera to begin autonomous facial recognition."
  );
  const [recognizedStudentInfo, setRecognizedStudentInfo] = useState<{
    student: EnrolledStudent | Student;
    confidence: number;
    time: string;
    alreadyMarked?: boolean;
  } | null>(null);
  const [trackedBox, setTrackedBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    videoWidth: number;
    videoHeight: number;
    label: string;
    match: boolean;
  } | null>(null);

  const recentlyMarkedRef = useRef<{ [studentId: string]: number }>({});
  const scanningRef = useRef(false);

  // In-Section Student Addition & Biometric Capture State
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addStudentId, setAddStudentId] = useState("");
  const [addStudentName, setAddStudentName] = useState("");
  const [addStudentClass, setAddStudentClass] = useState("Grade 10 - Section A");
  const [addStudentPassword, setAddStudentPassword] = useState("student123");
  const [addStudentSamples, setAddStudentSamples] = useState<string[]>([]);
  const [addStudentStatus, setAddStudentStatus] = useState<string | null>(null);
  const [addStudentLoading, setAddStudentLoading] = useState(false);

  // Admin Master State
  const [teachersList, setTeachersList] = useState<TeacherUser[]>([]);
  const [allStudentsList, setAllStudentsList] = useState<EnrolledStudent[]>([]);
  const [adminClassFilter, setAdminClassFilter] = useState("ALL");
  const [newAdminClassName, setNewAdminClassName] = useState("");
  const [newAdminClassSection, setNewAdminClassSection] = useState("");
  const [newAdminClassSubject, setNewAdminClassSubject] = useState("");
  const [adminClassMsg, setAdminClassMsg] = useState<string | null>(null);

  // Admin Add Teacher Form State
  const [adminTeacherId, setAdminTeacherId] = useState("");
  const [adminTeacherName, setAdminTeacherName] = useState("");
  const [adminTeacherPassword, setAdminTeacherPassword] = useState("teacher123");
  const [adminTeacherClass, setAdminTeacherClass] = useState("Grade 10 - Section A");
  const [adminTeacherMsg, setAdminTeacherMsg] = useState<string | null>(null);

  // Diagnostics State
  const [diagFileA, setDiagFileA] = useState<string | null>(null);
  const [diagFileB, setDiagFileB] = useState<string | null>(null);
  const [diagResult, setDiagResult] = useState<{
    distance: number;
    similarity: number;
    match: boolean;
  } | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  // Attendance Records
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  // Export State
  const [exportStatus, setExportStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [showExportPanel, setShowExportPanel] = useState(false);

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);

  // All Attendance Reports State (from Database)
  const [allDbReports, setAllDbReports] = useState<AttendanceRecord[]>([]);
  const [reportsFilterDate, setReportsFilterDate] = useState("");
  const [reportsFilterClass, setReportsFilterClass] = useState("ALL");
  const [reportsFilterStatus, setReportsFilterStatus] = useState("ALL");
  const [loadingReports, setLoadingReports] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const enrollCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);

  // ─── 1. Load face-api.js Models ─────────────────────────────────────────────

  useEffect(() => {
    const initFaceApi = async () => {
      try {
        const fa = await import("face-api.js");
        setFaceapi(fa as unknown as FaceApiModule);

        await Promise.all([
          fa.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        setModelsLoaded(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setModelLoadError(msg);
      }
    };
    initFaceApi();
  }, []);

  // ─── 2. Fetch Classes List ───────────────────────────────────────────────────

  const fetchClasses = useCallback(async () => {
    try {
      const res = await fetch("/api/classes");
      const data = await res.json();
      if (data.classes && data.classes.length > 0) {
        setClassesList(data.classes);
        if (!selectedClass) {
          setSelectedClass(data.classes[0].name);
        }
      }
    } catch (err) {
      console.error("Failed to fetch classes:", err);
    }
  }, [selectedClass]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // ─── 3. Fetch Teachers (Admin) ───────────────────────────────────────────────

  const fetchTeachers = useCallback(async () => {
    try {
      const res = await fetch("/api/teachers");
      const data = await res.json();
      setTeachersList(data.teachers || []);
    } catch (err) {
      console.error("Failed to fetch teachers:", err);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchTeachers();
    }
  }, [currentUser, fetchTeachers]);

  // ─── 4. Fetch Students for Selected Section / All Students ───────────────────

  const fetchClassStudents = useCallback(async () => {
    try {
      const url = selectedClass
        ? `/api/students?class=${encodeURIComponent(selectedClass)}`
        : "/api/students";
      const res = await fetch(url);
      const data = await res.json();
      const list: EnrolledStudent[] = data.students || [];

      // Map to attendance roster
      setStudents(
        list.map((s) => ({
          id: s.id,
          name: s.name,
          className: s.className,
          status: "ABSENT",
          enrolled: s.sampleCount > 0,
        }))
      );
      setCurrentIndex(0);
    } catch (err) {
      console.error("Failed to fetch students for class:", err);
    }
  }, [selectedClass]);

  const fetchAllStudents = useCallback(async () => {
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      setAllStudentsList(data.students || []);
    } catch (err) {
      console.error("Failed to fetch all students:", err);
    }
  }, []);

  useEffect(() => {
    fetchClassStudents();
    fetchAllStudents();
  }, [fetchClassStudents, fetchAllStudents]);

  // Fetch Attendance Records
  const fetchAttendanceRecords = useCallback(async () => {
    try {
      let url = `/api/attendance?date=${selectedDate}`;
      if (selectedClass && selectedClass !== "ALL") {
        url += `&class=${encodeURIComponent(selectedClass)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setAttendanceRecords(data.records || []);
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  }, [selectedDate, selectedClass, currentUser]);

  useEffect(() => {
    fetchAttendanceRecords();
  }, [fetchAttendanceRecords]);

  // Sync attendance records with students list
  useEffect(() => {
    if (attendanceRecords.length > 0 && students.length > 0) {
      setStudents((prev) =>
        prev.map((s) => {
          const rec = attendanceRecords.find(
            (r) => r.student_id.toLowerCase() === s.id.toLowerCase() && r.date === selectedDate
          );
          if (rec) {
            return {
              ...s,
              status: rec.status as Student["status"],
              confidence: rec.confidence ? Math.round(rec.confidence * 100) : undefined,
              timestamp: new Date(rec.timestamp).toLocaleTimeString(),
            };
          }
          return s;
        })
      );
    }
  }, [attendanceRecords, selectedDate]);

  // Audio chime feedback for successful biometric mark
  const playChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio context may be restricted by browser until interacted
    }
  }, []);

  // ─── Continuous Autonomous Face Recognition & Auto-Attendance Loop ───────────
  useEffect(() => {
    if (!cameraActive || !autoScanEnabled || !faceapi || !modelsLoaded) {
      setTrackedBox(null);
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      if (scanningRef.current || !videoRef.current || !faceapi) return;
      const v = videoRef.current;
      if (v.readyState < 2 || v.paused || v.ended) return;

      scanningRef.current = true;
      try {
        const fa = faceapi as unknown as typeof import("face-api.js");
        const detection = await fa
          .detectSingleFace(v)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!isMounted) return;

        if (!detection) {
          setTrackedBox(null);
          setAutoScanStatus("⚡ Looking for faces... Please look at the camera.");
          return;
        }

        const box = detection.detection.box;
        const liveDescriptor = detection.descriptor;
        const vWidth = v.videoWidth || 640;
        const vHeight = v.videoHeight || 480;

        // Candidates belonging to the selected class with registered biometric descriptors
        const candidates = allStudentsList.filter(
          (s) =>
            (selectedClass === "ALL" || s.className === selectedClass) &&
            s.descriptors &&
            s.descriptors.length > 0
        );

        if (candidates.length === 0) {
          setTrackedBox({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            videoWidth: vWidth,
            videoHeight: vHeight,
            label: "No Biometrics Registered in System",
            match: false,
          });
          setAutoScanStatus("Face detected, but no student biometrics are registered yet. Click '+ Add Student'.");
          return;
        }

        // Search best match across enrolled students
        let bestMatch: EnrolledStudent | null = null;
        let bestDist = 999;

        for (const cand of candidates) {
          for (const sample of cand.descriptors) {
            const dist = fa.euclideanDistance(Array.from(liveDescriptor), sample);
            if (dist < bestDist) {
              bestDist = dist;
              bestMatch = cand;
            }
          }
        }

        // Calibrated confidence percentage:
        // ArcFace 128-d embeddings have raw cosine between ~0.50 (random person) and 1.0 (exact match).
        // Calibrating to [0%, 100%] human-interpretable range prevents false positives between different people.
        const rawCosine = Math.max(0, 1 - (bestDist * bestDist) / 2);
        const calibratedScore = Math.max(0, Math.min(1, (rawCosine - 0.50) / 0.50));
        const confidencePct = Math.round(calibratedScore * 1000) / 10;
        const isMatch = confidencePct >= thresholdPercent && bestDist <= 0.58;

        if (isMatch && bestMatch) {
          setTrackedBox({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            videoWidth: vWidth,
            videoHeight: vHeight,
            label: `${bestMatch.name} (${confidencePct}%)`,
            match: true,
          });

          const now = Date.now();
          const lastMarked = recentlyMarkedRef.current[bestMatch.id] || 0;
          const alreadyPresent = students.some(
            (s) => s.id.toLowerCase() === bestMatch!.id.toLowerCase() && s.status.startsWith("PRESENT")
          );

          if (alreadyPresent || now - lastMarked < 6000) {
            setAutoScanStatus(`✓ ${bestMatch.name} is already marked PRESENT today.`);
            setRecognizedStudentInfo({
              student: bestMatch,
              confidence: confidencePct,
              time: new Date().toLocaleTimeString(),
              alreadyMarked: true,
            });
          } else {
            // AUTOMATICALLY MARK ATTENDANCE!
            recentlyMarkedRef.current[bestMatch.id] = now;
            if (soundEnabled) playChime();

            setAutoScanStatus(`✓ Recognized: ${bestMatch.name} (${confidencePct}%) — Attendance Marked!`);
            setRecognizedStudentInfo({
              student: bestMatch,
              confidence: confidencePct,
              time: new Date().toLocaleTimeString(),
              alreadyMarked: false,
            });

            // Optimistically update students register list
            setStudents((prev) =>
              prev.map((s) =>
                s.id.toLowerCase() === bestMatch!.id.toLowerCase()
                  ? {
                      ...s,
                      status: "PRESENT",
                      confidence: Math.round(confidencePct),
                      timestamp: new Date().toLocaleTimeString(),
                    }
                  : s
              )
            );

            // POST to attendance API
            fetch("/api/attendance/mark", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                studentId: bestMatch.id,
                studentName: bestMatch.name,
                className: bestMatch.className || selectedClass,
                subject: selectedSubject,
                date: selectedDate,
                status: "PRESENT",
                method: "AUTO",
                confidence: Math.round(confidencePct) / 100,
              }),
            })
              .then(() => fetchAttendanceRecords())
              .catch((e) => console.error("Auto attendance mark failed:", e));
          }
        } else {
          // Below threshold / unknown face
          setTrackedBox({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            videoWidth: vWidth,
            videoHeight: vHeight,
            label: bestMatch
              ? `${bestMatch.name} (${confidencePct}%) < ${thresholdPercent}%`
              : `Unrecognized Face (${confidencePct}%)`,
            match: false,
          });
          setAutoScanStatus(
            `Face in frame. Confidence ${confidencePct}% is below required ${thresholdPercent}% threshold.`
          );
        }
      } catch (err) {
        console.error("Auto scan tick error:", err);
      } finally {
        scanningRef.current = false;
      }
    }, 450);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [
    cameraActive,
    autoScanEnabled,
    faceapi,
    modelsLoaded,
    allStudentsList,
    thresholdPercent,
    selectedClass,
    selectedSubject,
    selectedDate,
    students,
    soundEnabled,
    playChime,
    fetchAttendanceRecords,
  ]);

  // Fetch All Database Attendance Reports
  const fetchAllDbReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      let url = "/api/attendance?";
      const params: string[] = [];
      if (reportsFilterDate) params.push(`date=${encodeURIComponent(reportsFilterDate)}`);
      if (reportsFilterClass && reportsFilterClass !== "ALL") {
        params.push(`class=${encodeURIComponent(reportsFilterClass)}`);
      }
      url += params.join("&");
      const res = await fetch(url);
      const data = await res.json();
      setAllDbReports(data.records || []);
    } catch (err) {
      console.error("Failed to fetch all attendance reports:", err);
    } finally {
      setLoadingReports(false);
    }
  }, [reportsFilterDate, reportsFilterClass]);

  useEffect(() => {
    if (activeTab === "reports" || activeTab === "home") {
      fetchAllDbReports();
    }
  }, [activeTab, fetchAllDbReports]);

  // Tab management on role change
  useEffect(() => {
    if (currentUser?.role === "admin") {
      if (
        activeTab !== "home" &&
        !activeTab.startsWith("admin_") &&
        activeTab !== "attendance" &&
        activeTab !== "reports" &&
        activeTab !== "diagnostics"
      ) {
        setActiveTab("home");
      }
    } else if (currentUser?.role === "teacher") {
      if (activeTab.startsWith("admin_")) {
        setActiveTab("home");
      }
    }
  }, [currentUser, activeTab]);

  // ─── 5. Main Attendance Camera Feed ──────────────────────────────────────────

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (cameraActive) {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          setVerificationFeedback({
            status: "error",
            message: "Camera permission denied or camera device unavailable.",
          });
          setCameraActive(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraActive]);

  // ─── 6. Enrollment Camera Feed (for Adding Students) ─────────────────────────

  const startEnrollCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      enrollStreamRef.current = s;
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = s;
      }
    } catch (err) {
      console.error("Enrollment camera error:", err);
    }
  };

  const stopEnrollCamera = () => {
    if (enrollStreamRef.current) {
      enrollStreamRef.current.getTracks().forEach((t) => t.stop());
      enrollStreamRef.current = null;
    }
    if (enrollVideoRef.current) {
      enrollVideoRef.current.srcObject = null;
    }
  };

  const captureEnrollSample = () => {
    if (!enrollVideoRef.current || !enrollCanvasRef.current) return;
    const v = enrollVideoRef.current;
    const c = enrollCanvasRef.current;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    setAddStudentSamples((prev) => [...prev, dataUrl]);
  };

  const currentStudent = students[currentIndex];

  // ─── 7. Face Verification (face-api.js) Manual / Specific Student ─────────────

  const handleVerifyCurrentStudent = async () => {
    if (!currentStudent || !faceapi || !videoRef.current) return;
    setVerifying(true);
    setVerificationFeedback({
      status: "idle",
      message: `Scanning face for ${currentStudent.name}...`,
    });

    try {
      const fa = faceapi as unknown as typeof import("face-api.js");

      const detection = await fa
        .detectSingleFace(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setVerificationFeedback({
          status: "error",
          message: "No clear face detected. Please face the camera directly.",
        });
        setVerifying(false);
        return;
      }

      const liveDescriptor = detection.descriptor;

      // Find registered student profile from all students list
      const profile = allStudentsList.find(
        (p) => p.id.toLowerCase() === currentStudent.id.toLowerCase()
      );

      if (!profile || profile.descriptors.length === 0) {
        setVerificationFeedback({
          status: "error",
          message: `${currentStudent.name} (${currentStudent.id}) has no face samples. Click '+ Add Student' to register biometrics.`,
        });
        setVerifying(false);
        return;
      }

      let minDistance = 999;
      for (const sample of profile.descriptors) {
        const dist = fa.euclideanDistance(Array.from(liveDescriptor), sample);
        if (dist < minDistance) minDistance = dist;
      }

      const rawCosine = Math.max(0, 1 - (minDistance * minDistance) / 2);
      const calibratedScore = Math.max(0, Math.min(1, (rawCosine - 0.50) / 0.50));
      const confidencePct = Math.round(calibratedScore * 1000) / 10;
      const isMatch = confidencePct >= thresholdPercent && minDistance <= 0.58;

      if (isMatch) {
        await fetch("/api/attendance/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: currentStudent.id,
            studentName: currentStudent.name,
            className: selectedClass,
            subject: selectedSubject,
            date: selectedDate,
            status: "PRESENT",
            method: "AUTO",
            confidence: Math.round(confidencePct) / 100,
          }),
        });

        if (soundEnabled) playChime();

        setStudents((prev) =>
          prev.map((s, idx) =>
            idx === currentIndex
              ? {
                  ...s,
                  status: "PRESENT",
                  confidence: Math.round(confidencePct),
                  timestamp: new Date().toLocaleTimeString(),
                }
              : s
          )
        );

        setVerificationFeedback({
          status: "success",
          message: `Verified: ${currentStudent.name} is PRESENT! (${confidencePct}% match)`,
          score: calibratedScore,
          threshold: thresholdPercent / 100,
        });

        fetchAttendanceRecords();
      } else {
        setStudents((prev) =>
          prev.map((s, idx) =>
            idx === currentIndex ? { ...s, status: "FAILED_VERIFICATION" } : s
          )
        );

        setVerificationFeedback({
          status: "rejected",
          message: `Confidence (${confidencePct}%) for ${currentStudent.name} is below ${thresholdPercent}% threshold.`,
          score: calibratedScore,
          threshold: thresholdPercent / 100,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerificationFeedback({
        status: "error",
        message: `Face verification error: ${msg}`,
      });
    } finally {
      setVerifying(false);
    }
  };

  // ─── 8. Teacher Manual Attendance Override ───────────────────────────────────

  const handleMarkManually = async () => {
    if (!currentStudent) return;
    try {
      await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: currentStudent.id,
          studentName: currentStudent.name,
          className: selectedClass,
          subject: selectedSubject,
          date: selectedDate,
          status: "PRESENT_MANUAL",
          method: "MANUAL",
          confidence: 1.0,
        }),
      });

      setStudents((prev) =>
        prev.map((s, idx) =>
          idx === currentIndex
            ? {
                ...s,
                status: "PRESENT_MANUAL",
                confidence: 100,
                timestamp: new Date().toLocaleTimeString(),
              }
            : s
        )
      );

      setVerificationFeedback({
        status: "idle",
        message: `Marked ${currentStudent.name} manually by Teacher.`,
      });

      fetchAttendanceRecords();

      if (currentIndex < students.length - 1) {
        setCurrentIndex((i) => i + 1);
      }
    } catch {
      alert("Error marking attendance manually.");
    }
  };

  // ─── 9. Add Student to Current Section (Teacher & Admin) ─────────────────────

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStudentId || !addStudentName || addStudentSamples.length === 0 || !faceapi) {
      alert("Please provide Student ID, Name, and capture at least 1 face biometric snapshot.");
      return;
    }

    setAddStudentLoading(true);
    setAddStudentStatus("Extracting 128-d FaceNet biometric descriptors...");

    try {
      const fa = faceapi as unknown as typeof import("face-api.js");
      const descriptors: number[][] = [];

      for (let i = 0; i < addStudentSamples.length; i++) {
        const img = new window.Image();
        img.src = addStudentSamples[i];
        await new Promise((resolve) => (img.onload = resolve));

        const detection = await fa
          .detectSingleFace(img)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          descriptors.push(Array.from(detection.descriptor));
        }
      }

      if (descriptors.length === 0) {
        setAddStudentStatus("Error: Could not detect clear faces in the samples. Ensure good lighting and try again.");
        setAddStudentLoading(false);
        return;
      }

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: addStudentId.trim().toUpperCase(),
          studentName: addStudentName.trim(),
          className: addStudentClass,
          descriptors,
          password: addStudentPassword || "student123",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add student.");

      setAddStudentStatus(`✓ Enrolled ${addStudentName} into ${addStudentClass} with ${descriptors.length} face sample(s)!`);
      setAddStudentSamples([]);
      setAddStudentId("");
      setAddStudentName("");

      stopEnrollCamera();
      fetchClassStudents();
      fetchAllStudents();

      setTimeout(() => {
        setShowAddStudentModal(false);
        setAddStudentStatus(null);
        setAddStudentLoading(false);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddStudentStatus(`Error: ${msg}`);
      setAddStudentLoading(false);
    }
  };

  // ─── 10. Admin: Teacher Registration & Removal ──────────────────────────────

  const handleAdminAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTeacherId || !adminTeacherName || !adminTeacherPassword) return;

    try {
      const res = await fetch("/api/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: adminTeacherId.trim().toUpperCase(),
          name: adminTeacherName.trim(),
          password: adminTeacherPassword.trim(),
          assignedClass: adminTeacherClass,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register teacher");

      setAdminTeacherMsg(`✓ Teacher ${adminTeacherName} registered successfully!`);
      setAdminTeacherId("");
      setAdminTeacherName("");
      setAdminTeacherPassword("teacher123");
      fetchTeachers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminTeacherMsg(`Error: ${msg}`);
    }
  };

  const handleRemoveTeacher = async (teacherId: string, teacherName: string) => {
    if (!confirm(`Are you sure you want to remove Teacher ${teacherName} (${teacherId})?`)) return;
    try {
      const res = await fetch(`/api/teachers?id=${encodeURIComponent(teacherId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove teacher");
      fetchTeachers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error: ${msg}`);
    }
  };

  // ─── 11. Admin & Teacher: Remove Student ─────────────────────────────────────

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Remove student ${studentName} (${studentId}) from the system?`)) return;
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete student");
      fetchClassStudents();
      fetchAllStudents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error: ${msg}`);
    }
  };

  const handleResetAttendance = async () => {
    if (!confirm(`Reset today's attendance for ${selectedClass}? All students will be marked Absent.`)) return;
    try {
      await fetch(`/api/attendance?date=${selectedDate}&class=${encodeURIComponent(selectedClass)}`, {
        method: "DELETE",
      });
      recentlyMarkedRef.current = {};
      fetchClassStudents();
      fetchAttendanceRecords();
    } catch (err) {
      console.error("Failed to reset attendance:", err);
    }
  };

  // ─── 12. Admin: Class Management (Create / Remove) ───────────────────────────

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminClassName || !newAdminClassSection) return;

    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAdminClassName.trim(),
          section: newAdminClassSection.trim(),
          defaultSubject: newAdminClassSubject.trim() || "General",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create class.");

      setAdminClassMsg(`✓ Class '${newAdminClassName}' created successfully!`);
      setNewAdminClassName("");
      setNewAdminClassSection("");
      setNewAdminClassSubject("");
      fetchClasses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminClassMsg(`Error: ${msg}`);
    }
  };

  const handleRemoveClass = async (classId: string, className: string) => {
    if (!confirm(`Delete class ${className}?`)) return;
    try {
      const res = await fetch(`/api/classes?id=${encodeURIComponent(classId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete class");
      fetchClasses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error: ${msg}`);
    }
  };

  // ─── 13. Attendance Export Handlers ─────────────────────────────────────────

  /** Download an Excel file directly in the browser (no server call) */
  const handleExportLocal = async () => {
    if (students.length === 0) return;
    setExportStatus({ type: "loading", message: "Generating Excel file…" });
    try {
      const XLSX = await import("xlsx");
      const sheetRows = students.map((s, i) => ({
        "#": i + 1,
        "Student ID": s.id,
        "Name": s.name,
        "Class": s.className || selectedClass,
        "Subject": selectedSubject || "N/A",
        "Date": selectedDate,
        "Status": s.status,
        "Confidence (%)":
          s.status.startsWith("PRESENT") && s.confidence != null
            ? `${s.confidence.toFixed(1)}%`
            : "—",
        "Timestamp": s.timestamp || "—",
      }));

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      // Auto-width columns
      const colWidths = Object.keys(sheetRows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...sheetRows.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
      }));
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");

      const safeName = `${selectedClass}_${selectedDate}`.replace(/[^a-zA-Z0-9_\-]/g, "_");
      XLSX.writeFile(wb, `Attendance_${safeName}.xlsx`);
      setExportStatus({ type: "success", message: "✅ Excel file downloaded to your computer." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportStatus({ type: "error", message: `❌ Export failed: ${msg}` });
    }
  };

  /** Save attendance report as .xlsx on the server (data/exports/) */
  const handleExportServer = async () => {
    if (students.length === 0) return;
    setExportStatus({ type: "loading", message: "Saving to server database…" });
    try {
      const res = await fetch("/api/attendance/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: students,
          className: selectedClass,
          subject: selectedSubject,
          date: selectedDate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Server export failed");
      setExportStatus({
        type: "success",
        message: `☁️ Saved to server: ${data.fileName}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportStatus({ type: "error", message: `❌ Server save failed: ${msg}` });
    }
  };

  // ─── 14. Diagnostics Comparison ─────────────────────────────────────────────

  const handleRunDiagnostic = async () => {
    if (!diagFileA || !diagFileB || !faceapi) {
      alert("Please upload both Image A and Image B.");
      return;
    }

    setDiagRunning(true);
    setDiagError(null);
    setDiagResult(null);

    try {
      const fa = faceapi as unknown as typeof import("face-api.js");

      const loadImage = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      const [imgA, imgB] = await Promise.all([loadImage(diagFileA), loadImage(diagFileB)]);
      const [detA, detB] = await Promise.all([
        fa.detectSingleFace(imgA).withFaceLandmarks().withFaceDescriptor(),
        fa.detectSingleFace(imgB).withFaceLandmarks().withFaceDescriptor(),
      ]);

      if (!detA || !detB) {
        setDiagError("Could not detect face in one or both images.");
        setDiagRunning(false);
        return;
      }

      const dist = fa.euclideanDistance(Array.from(detA.descriptor), Array.from(detB.descriptor));
      const similarity = Math.max(0, 1 - dist);
      const match = dist <= SIMILARITY_THRESHOLD;

      setDiagResult({
        distance: Math.round(dist * 1000) / 1000,
        similarity: Math.round(similarity * 1000) / 10,
        match,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagError(`Diagnostic error: ${msg}`);
    } finally {
      setDiagRunning(false);
    }
  };

  // ─── 14. Login & Self-Register Teacher Handler ───────────────────────────────

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    // If teacher is self-registering
    if (loginRoleTab === "teacher" && isTeacherRegisterMode) {
      if (!loginId || !newTeacherName || !loginPassword) {
        setLoginError("Please fill in Teacher ID, Full Name, and Password.");
        return;
      }

      try {
        const res = await fetch("/api/teachers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: loginId.trim().toUpperCase(),
            name: newTeacherName.trim(),
            password: loginPassword.trim(),
            assignedClass: newTeacherClass,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setLoginError(data.error || "Registration failed");
          return;
        }

        setCurrentUser({
          id: loginId.trim().toUpperCase(),
          name: newTeacherName.trim(),
          role: "teacher",
          assigned_class: newTeacherClass,
        });
        setSelectedClass(newTeacherClass);
        setActiveTab("home");
        setShowLoginModal(false);
        setIsTeacherRegisterMode(false);
        setLoginId("");
        setLoginPassword("");
        setNewTeacherName("");
        return;
      } catch {
        setLoginError("Registration network error.");
        return;
      }
    }

    // Standard Sign In
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loginId, password: loginPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed");
        return;
      }

      if (data.user.role === "student") {
        setLoginError("Student login is disabled. This portal is for Teachers and Administrators only.");
        return;
      }

      if (data.user.role !== loginRoleTab) {
        setLoginError(
          `This account is registered as '${data.user.role.toUpperCase()}', not '${loginRoleTab.toUpperCase()}'. Please select the matching tab.`
        );
        return;
      }

      setCurrentUser(data.user);
      if (data.user.assigned_class) {
        setSelectedClass(data.user.assigned_class);
      }
      setActiveTab("home");
      setShowLoginModal(false);
      setLoginId("");
      setLoginPassword("");
    } catch {
      setLoginError("Could not reach authentication server.");
    }
  };

  const handleQuickDemoLogin = (
    role: "admin" | "teacher",
    id: string,
    name: string,
    assignedClass?: string
  ) => {
    setCurrentUser({ id, name, role, assigned_class: assignedClass });
    if (assignedClass) setSelectedClass(assignedClass);
    setActiveTab("home");
    setShowLoginModal(false);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      <canvas ref={canvasRef} className="hidden" />

      {modelLoadError && (
        <div className="bg-rose-950 border-b border-rose-800 text-rose-200 px-6 py-2 text-xs flex justify-between">
          <span>Failed to load models: {modelLoadError}</span>
          <span>Please run &apos;npm run download-models&apos;</span>
        </div>
      )}

      {/* ─── Top Header (Matching Screenshots) ─────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div 
          onClick={() => { if (currentUser) setActiveTab("home"); }}
          className={`flex items-center space-x-3 ${currentUser ? "cursor-pointer" : ""}`}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-extrabold text-white text-base shadow-lg shadow-cyan-500/20 tracking-wider">
            CS
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              ClassSnap AI
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {modelsLoaded ? "● AI Biometrics Ready" : "○ Initializing Models..."}
              </span>
            </h1>
            <p className="text-xs text-slate-400">Identity-Specific Face Attendance System</p>
          </div>
        </div>

        {/* Right Section: Only Profile and Logout Buttons when Logged In */}
        <div className="flex items-center space-x-3">
          {currentUser ? (
            <div className="flex items-center gap-2">
              {/* Profile Button */}
              <button
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
                title="View Profile Details"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    currentUser.role === "admin" ? "bg-purple-400" : "bg-cyan-400"
                  }`}
                />
                <span>👤 {currentUser.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                    currentUser.role === "admin"
                      ? "bg-purple-950 text-purple-300 border border-purple-800"
                      : "bg-cyan-950 text-cyan-300 border border-cyan-800"
                  }`}
                >
                  {currentUser.role}
                </span>
              </button>

              {/* Logout Button */}
              <button
                onClick={() => {
                  setCurrentUser(null);
                  setCameraActive(false);
                  setActiveTab("home");
                }}
                className="flex items-center gap-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                title="Sign out of portal"
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-lg bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 font-medium">
                👨‍🏫 Teacher &amp; Admin Sign In
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ─── Main Viewport ──────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col justify-center">
        {!currentUser ? (
          <div className="flex items-center justify-center py-8">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-cyan-500/20">
                  CS
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">ClassSnap AI Portal</h2>
                <p className="text-xs text-slate-400 mt-1">Please sign in as Teacher or Admin to continue</p>
              </div>

              {/* 2-Role Switcher Tabs: Teacher & Admin only */}
              <div className="flex p-1 bg-slate-800 rounded-lg border border-slate-700 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setLoginRoleTab("teacher");
                    setIsTeacherRegisterMode(false);
                    setLoginError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                    loginRoleTab === "teacher"
                      ? "bg-cyan-500 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  👨‍🏫 Teacher Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginRoleTab("admin");
                    setIsTeacherRegisterMode(false);
                    setLoginError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                    loginRoleTab === "admin"
                      ? "bg-purple-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  👑 Admin Login
                </button>
              </div>

              {/* Teacher Sign In vs Self-Registration Toggle */}
              {loginRoleTab === "teacher" && (
                <div className="flex justify-between items-center mb-3 px-1 text-xs">
                  <span className="text-slate-400">
                    {isTeacherRegisterMode ? "New Teacher Registration" : "Teacher Sign In"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTeacherRegisterMode(!isTeacherRegisterMode);
                      setLoginError(null);
                    }}
                    className="text-cyan-400 hover:underline font-bold"
                  >
                    {isTeacherRegisterMode ? "← Back to Login" : "+ Register as New Teacher"}
                  </button>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    {loginRoleTab === "admin" ? "Admin Username / ID *" : "Teacher ID *"}
                  </label>
                  <input
                    type="text"
                    placeholder={loginRoleTab === "admin" ? "e.g. admin" : "e.g. TCH101"}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                {/* Extra field if Teacher is registering */}
                {loginRoleTab === "teacher" && isTeacherRegisterMode && (
                  <>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-semibold">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Prof. Sharma"
                        value={newTeacherName}
                        onChange={(e) => setNewTeacherName(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-semibold">
                        Default Assigned Section
                      </label>
                      <select
                        value={newTeacherClass}
                        onChange={(e) => setNewTeacherClass(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                      >
                        {classesList.map((c) => (
                          <option key={c.id} value={c.name} className="bg-slate-900 text-white">
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">Password *</label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                {loginError && (
                  <div className="p-2.5 bg-rose-950/50 border border-rose-500 rounded text-rose-300 text-xs">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className={`w-full py-2.5 text-white font-bold text-xs uppercase rounded-lg shadow-md transition mt-2 ${
                    loginRoleTab === "admin"
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500"
                      : "bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400"
                  }`}
                >
                  {isTeacherRegisterMode
                    ? "Register & Enter Teacher Portal"
                    : `Sign In as ${loginRoleTab === "admin" ? "Admin" : "Teacher"}`}
                </button>
              </form>

              {/* Quick Demo Credentials */}
              <div className="mt-5 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-2 font-medium">
                  ⚡ Quick Demo Access:
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickDemoLogin("teacher", "TCH101", "Prof. Sharma", "Grade 10 - Section A")
                    }
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-left border border-slate-700 transition"
                  >
                    <span className="font-bold text-cyan-400 block">👨‍🏫 Teacher</span>
                    Prof. Sharma
                    <span className="text-[10px] text-slate-400 block font-mono">ID: TCH101 · Pass: teacher123</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDemoLogin("admin", "admin", "Administrator")}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-left border border-slate-700 transition"
                  >
                    <span className="font-bold text-purple-400 block">👑 Administrator</span>
                    Admin
                    <span className="text-[10px] text-slate-400 block font-mono">ID: admin · Pass: admin123</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            {/* Back to Home Breadcrumb when in other views */}
            {activeTab !== "home" && (
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <button
                  onClick={() => setActiveTab("home")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
                >
                  <span>←</span> Back to Dashboard Home
                </button>
                <span className="text-xs text-slate-400 capitalize">
                  Viewing: <strong className="text-white">{activeTab.replace("admin_", "Manage ").replace("_", " ")}</strong>
                </span>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 0. HOME PAGE / DASHBOARD (Visible right after logging in)                  */}
            {/* ========================================================================= */}
            {activeTab === "home" && (
              <div className="space-y-6">
                {/* Welcome Banner */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold uppercase">
                          {currentUser.role} Portal
                        </span>
                        <span className="text-xs text-slate-500">·</span>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        Welcome back, <span className="text-cyan-400">{currentUser.name}</span>!
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
                        {currentUser.role === "admin"
                          ? "You have full administrator access. Manage teachers, students, classrooms, and inspect live attendance records."
                          : `Classroom Teacher assigned to ${currentUser.assigned_class || "General Section"}. Take live attendance or review reports.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setActiveTab("attendance")}
                        className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 text-white font-bold text-xs uppercase tracking-wide rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2"
                      >
                        <span>📷</span> Start Live Attendance
                      </button>
                      <button
                        onClick={() => setActiveTab("reports")}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs uppercase tracking-wide rounded-xl transition flex items-center gap-2"
                      >
                        <span>📊</span> View All Reports
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
                    <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
                      <span className="text-[11px] text-slate-400 font-medium block">Total Students</span>
                      <span className="text-xl font-extrabold text-white mt-1 block">{allStudentsList.length}</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
                      <span className="text-[11px] text-slate-400 font-medium block">Active Classes</span>
                      <span className="text-xl font-extrabold text-cyan-400 mt-1 block">{classesList.length}</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
                      <span className="text-[11px] text-slate-400 font-medium block">Teachers</span>
                      <span className="text-xl font-extrabold text-purple-400 mt-1 block">{teachersList.length || 2}</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
                      <span className="text-[11px] text-slate-400 font-medium block">Database Records</span>
                      <span className="text-xl font-extrabold text-emerald-400 mt-1 block">{allDbReports.length}</span>
                    </div>
                  </div>
                </div>

                {/* Feature Tiles Grid (Moved from Navbar) */}
                <div>
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Quick Navigation &amp; Features</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Feature 1: Take Attendance */}
                    <div
                      onClick={() => setActiveTab("attendance")}
                      className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 cursor-pointer transition shadow-md hover:shadow-cyan-500/10 flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                          📷
                        </div>
                        <h4 className="text-base font-bold text-white group-hover:text-cyan-300 transition">Take Attendance</h4>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          Launch the camera with autonomous facial recognition, threshold calibration, and instant register updates.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-cyan-400">
                        <span>Open Scanner</span>
                        <span>→</span>
                      </div>
                    </div>

                    {/* Feature 2: Attendance Reports (NEW) */}
                    <div
                      onClick={() => setActiveTab("reports")}
                      className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 cursor-pointer transition shadow-md hover:shadow-emerald-500/10 flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                          📊
                        </div>
                        <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition">Attendance Reports</h4>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          Inspect all historic attendance reports stored in the MongoDB database. Filter by class, date, and status.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-emerald-400">
                        <span>View Reports Database</span>
                        <span>→</span>
                      </div>
                    </div>

                    {/* Feature 3: Dev Diagnostics */}
                    <div
                      onClick={() => setActiveTab("diagnostics")}
                      className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer transition shadow-md hover:shadow-indigo-500/10 flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                          🔬
                        </div>
                        <h4 className="text-base font-bold text-white group-hover:text-indigo-300 transition">Biometric Diagnostics</h4>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          Dev 1:1 image comparator to test face descriptors, Euclidean distance, cosine similarity, and thresholding.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-indigo-400">
                        <span>Launch Diagnostics</span>
                        <span>→</span>
                      </div>
                    </div>

                    {/* Admin Only Feature Tiles */}
                    {currentUser.role === "admin" && (
                      <>
                        <div
                          onClick={() => setActiveTab("admin_teachers")}
                          className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 cursor-pointer transition shadow-md hover:shadow-purple-500/10 flex flex-col justify-between"
                        >
                          <div>
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                              👨‍🏫
                            </div>
                            <h4 className="text-base font-bold text-white group-hover:text-purple-300 transition">Manage Teachers</h4>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                              Register new teachers, update assigned sections, and view teacher rosters.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-purple-400">
                            <span>Open Teachers Roster</span>
                            <span>→</span>
                          </div>
                        </div>

                        <div
                          onClick={() => setActiveTab("admin_students")}
                          className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 cursor-pointer transition shadow-md hover:shadow-purple-500/10 flex flex-col justify-between"
                        >
                          <div>
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                              👥
                            </div>
                            <h4 className="text-base font-bold text-white group-hover:text-purple-300 transition">Manage Students</h4>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                              View all registered students across classes, filter sections, or enroll new face samples.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-purple-400">
                            <span>Open Students Directory</span>
                            <span>→</span>
                          </div>
                        </div>

                        <div
                          onClick={() => setActiveTab("admin_classes")}
                          className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 cursor-pointer transition shadow-md hover:shadow-purple-500/10 flex flex-col justify-between"
                        >
                          <div>
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                              🏫
                            </div>
                            <h4 className="text-base font-bold text-white group-hover:text-purple-300 transition">Manage Classes</h4>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                              Create new classes, sections, and default subjects for the school academic directory.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-purple-400">
                            <span>Manage Classes &amp; Sections</span>
                            <span>→</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 1. ATTENDANCE REPORTS (Database Viewer)                                    */}
            {/* ========================================================================= */}
            {activeTab === "reports" && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>📊</span> Database Attendance Reports
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      All attendance submissions stored in MongoDB Atlas database.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchAllDbReports}
                      disabled={loadingReports}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg transition disabled:opacity-50"
                    >
                      {loadingReports ? "Refreshing..." : "🔄 Refresh Data"}
                    </button>
                    <button
                      onClick={() => setActiveTab("attendance")}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition"
                    >
                      + Take Attendance
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Filter by Date</label>
                    <input
                      type="date"
                      value={reportsFilterDate}
                      onChange={(e) => setReportsFilterDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Filter by Class</label>
                    <select
                      value={reportsFilterClass}
                      onChange={(e) => setReportsFilterClass(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="ALL">All Classes</option>
                      {classesList.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Filter by Status</label>
                    <select
                      value={reportsFilterStatus}
                      onChange={(e) => setReportsFilterStatus(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PRESENT">Present (AI)</option>
                      <option value="PRESENT_MANUAL">Present (Manual)</option>
                      <option value="FAILED_VERIFICATION">Mismatch</option>
                    </select>
                  </div>
                </div>

                {/* Table of Database Reports */}
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  {(() => {
                    const filtered = allDbReports.filter((r) => {
                      if (reportsFilterStatus !== "ALL" && r.status !== reportsFilterStatus) return false;
                      return true;
                    });

                    if (loadingReports) {
                      return (
                        <div className="text-center py-12 text-slate-400 text-xs animate-pulse">
                          Loading attendance reports from database...
                        </div>
                      );
                    }

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-12 text-slate-500 text-xs">
                          No attendance records found matching the filters.
                        </div>
                      );
                    }

                    return (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Student Name</th>
                            <th className="py-2.5 px-3">Student ID</th>
                            <th className="py-2.5 px-3">Class</th>
                            <th className="py-2.5 px-3">Subject</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Method</th>
                            <th className="py-2.5 px-3">Confidence</th>
                            <th className="py-2.5 px-3">Recorded At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {filtered.map((record, i) => (
                            <tr key={record.pk || i} className="hover:bg-slate-800/40 transition">
                              <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                              <td className="py-2 px-3 font-semibold text-slate-200">{record.student_name}</td>
                              <td className="py-2 px-3 font-mono text-slate-400">{record.student_id}</td>
                              <td className="py-2 px-3 text-slate-300">{record.class_name}</td>
                              <td className="py-2 px-3 text-slate-400">{record.subject}</td>
                              <td className="py-2 px-3 text-slate-400 font-mono">{record.date}</td>
                              <td className="py-2 px-3">
                                {record.status === "PRESENT" && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] border border-emerald-500/30">
                                    Present (AI)
                                  </span>
                                )}
                                {record.status === "PRESENT_MANUAL" && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold text-[11px] border border-amber-500/30">
                                    Manual
                                  </span>
                                )}
                                {record.status === "FAILED_VERIFICATION" && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold text-[11px] border border-rose-500/30">
                                    Mismatch
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-400">{record.method}</td>
                              <td className="py-2 px-3 text-slate-300 font-mono">
                                {record.confidence != null ? `${Math.round(record.confidence * 100)}%` : "—"}
                              </td>
                              <td className="py-2 px-3 text-slate-500 text-[11px]">
                                {new Date(record.timestamp).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 2. ATTENDANCE WORKFLOW: Class Selection + Inline Add Student              */}
            {/* ========================================================================= */}
        {activeTab === "attendance" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Columns: Camera Feed & Verification Panel */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              {/* Class Selection System Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm">
                <div>
                  <span className="text-xs text-slate-400 block mb-1 font-medium">
                    🏫 Active Section:
                  </span>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-sm font-semibold text-cyan-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    {classesList.map((c) => (
                      <option key={c.id} value={c.name} className="text-white bg-slate-900">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block mb-1 font-medium">Subject:</span>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option>Computer Science</option>
                    <option>Mathematics</option>
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Economics</option>
                    <option>English</option>
                  </select>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block mb-1 font-medium">Session Date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Camera Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        cameraActive ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
                      }`}
                    />
                    <span className="text-xs font-medium text-slate-300">
                      {cameraActive ? "Live Offline Camera Active" : "Camera Idle"}
                    </span>
                  </div>

                  <button
                    onClick={() => setCameraActive(!cameraActive)}
                    className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    {cameraActive ? "Stop Camera" : "Start Camera"}
                  </button>
                </div>

                {/* Viewport */}
                <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                  {cameraActive ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover mirror"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-500">
                      <p className="text-sm font-medium">Camera is currently paused.</p>
                      <button
                        onClick={() => setCameraActive(true)}
                        className="mt-3 px-4 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-lg hover:bg-cyan-500 shadow-md transition"
                      >
                        Enable Camera Feed
                      </button>
                    </div>
                  )}

                  {cameraActive && (
                    <>
                      {/* Live Face Bounding Box & Target HUD */}
                      {trackedBox ? (
                        <div
                          style={{
                            position: "absolute",
                            left: `${Math.max(
                              0,
                              ((trackedBox.videoWidth - trackedBox.x - trackedBox.width) /
                                trackedBox.videoWidth) *
                                100
                            )}%`,
                            top: `${Math.max(0, (trackedBox.y / trackedBox.videoHeight) * 100)}%`,
                            width: `${Math.min(
                              100,
                              (trackedBox.width / trackedBox.videoWidth) * 100
                            )}%`,
                            height: `${Math.min(
                              100,
                              (trackedBox.height / trackedBox.videoHeight) * 100
                            )}%`,
                          }}
                          className={`pointer-events-none rounded-2xl transition-all duration-100 ${
                            trackedBox.match
                              ? "border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_30px_rgba(52,211,153,0.7)]"
                              : "border-2 border-amber-400/90 bg-amber-500/15"
                          }`}
                        >
                          <div
                            className={`absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-0.5 rounded-full text-[11px] font-extrabold shadow-lg ${
                              trackedBox.match
                                ? "bg-emerald-400 text-slate-950 shadow-emerald-500/50"
                                : "bg-amber-400 text-slate-950"
                            }`}
                          >
                            {trackedBox.match ? "✓ " : ""}
                            {trackedBox.label}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="relative w-48 h-60 border-2 border-dashed border-cyan-400/50 rounded-3xl overflow-hidden flex items-center justify-center">
                            <div className="w-full h-0.5 bg-cyan-400/80 shadow-[0_0_15px_#22d3ee] animate-pulse" />
                          </div>
                        </div>
                      )}

                      {/* Top Overlay HUD Pill */}
                      <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-full px-3 py-1 text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span className="text-emerald-300 font-semibold">
                          Autonomous AI Active
                        </span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-300 font-mono">
                          Thresh: {thresholdPercent}%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* ─── Autonomous Biometric Attendance HUD Card ─────────────────── */}
                <div className="w-full mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-3">
                  {/* Scanner Control & Threshold Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span
                          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                            cameraActive && autoScanEnabled
                              ? "bg-emerald-400 opacity-75"
                              : "bg-slate-500 opacity-0"
                          }`}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-3 w-3 ${
                            cameraActive && autoScanEnabled ? "bg-emerald-500" : "bg-slate-600"
                          }`}
                        />
                      </span>
                      <span className="text-xs font-bold text-white tracking-wide">
                        {cameraActive && autoScanEnabled
                          ? "⚡ AUTONOMOUS SCANNER: LIVE"
                          : "AUTONOMOUS SCANNER: PAUSED"}
                      </span>
                    </div>

                    {/* Threshold Presets & Quick Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Threshold Selector (75% to 80%) */}
                      <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
                        <span className="text-[11px] text-slate-400 px-1 font-semibold">
                          Confidence Thresh:
                        </span>
                        {[75, 78, 80, 85].map((t) => (
                          <button
                            key={t}
                            onClick={() => setThresholdPercent(t)}
                            className={`px-2 py-0.5 rounded text-xs font-bold transition ${
                              thresholdPercent === t
                                ? "bg-cyan-500 text-white shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {t}%
                          </button>
                        ))}
                      </div>

                      {/* Sound Chime Toggle */}
                      <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          soundEnabled
                            ? "bg-slate-800 border-slate-700 text-cyan-300"
                            : "bg-slate-800/50 border-slate-700 text-slate-500"
                        }`}
                        title="Toggle sound chime on recognition"
                      >
                        {soundEnabled ? "🔔 Chime ON" : "🔕 Muted"}
                      </button>

                      {/* Auto-Scan Toggle */}
                      <button
                        onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          autoScanEnabled
                            ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40"
                            : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {autoScanEnabled ? "Auto-Scan ON" : "Paused"}
                      </button>
                    </div>
                  </div>

                  {/* Realtime Detection Banner / Recognition Card */}
                  {recognizedStudentInfo ? (
                    <div
                      className={`p-3.5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-all ${
                        recognizedStudentInfo.alreadyMarked
                          ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                          : "bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-bold text-emerald-300 text-lg flex-shrink-0">
                          ✓
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-extrabold text-base text-white">
                              {recognizedStudentInfo.student.name}
                            </h3>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              ID: {recognizedStudentInfo.student.id}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                              {recognizedStudentInfo.confidence}% Match
                            </span>
                          </div>
                          <p className="text-xs text-emerald-300/90 mt-0.5">
                            {recognizedStudentInfo.alreadyMarked
                              ? "Student has already been marked PRESENT today."
                              : `Attendance recorded automatically at ${recognizedStudentInfo.time}!`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <span className="text-xs px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-extrabold tracking-wide uppercase">
                          Present (AI)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/80 flex items-center justify-between text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 animate-pulse text-sm">●</span>
                        <span>{autoScanStatus}</span>
                      </div>
                      <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">
                        Min Thresh: {thresholdPercent}% (75-80%)
                      </span>
                    </div>
                  )}

                  {/* Manual Override Option if teacher clicks a student in the list */}
                  {currentStudent && (
                    <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">
                        Selected in roster:{" "}
                        <strong className="text-slate-200">{currentStudent.name}</strong> (
                        {currentStudent.id})
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleVerifyCurrentStudent}
                          disabled={!cameraActive || verifying}
                          className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-semibold text-xs transition"
                        >
                          Force Verify This Student
                        </button>
                        {(currentUser?.role === "teacher" || currentUser?.role === "admin") && (
                          <button
                            onClick={handleMarkManually}
                            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition"
                          >
                            Mark Manually
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Section Live Register + Inline Add Student Button */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="font-bold text-slate-200 text-sm">Live Attendance Register</h3>
                    <p className="text-[11px] text-cyan-400 font-semibold">{selectedClass}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">
                      {students.filter((s) => s.status.startsWith("PRESENT")).length} / {students.length} Present
                    </span>
                    {/* INLINE ADD STUDENT BUTTON IN THE SECTION */}
                    {(currentUser?.role === "teacher" || currentUser?.role === "admin") && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleResetAttendance}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded-lg border border-slate-700 transition"
                          title="Reset today's attendance for this class"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => {
                            setAddStudentClass(selectedClass);
                            setAddStudentSamples([]);
                            setShowAddStudentModal(true);
                            startEnrollCamera();
                          }}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold rounded-lg shadow-sm transition"
                          title="Add student to this section"
                        >
                          + Add Student
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-y-auto max-h-[460px] space-y-2 pr-1">
                  {students.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      No students enrolled in {selectedClass} yet.
                      <button
                        onClick={() => {
                          setAddStudentClass(selectedClass);
                          setAddStudentSamples([]);
                          setShowAddStudentModal(true);
                          startEnrollCamera();
                        }}
                        className="block mx-auto mt-2 text-cyan-400 hover:underline font-bold"
                      >
                        + Add First Student to this Section
                      </button>
                    </div>
                  ) : (
                    students.map((student, idx) => (
                      <div
                        key={student.id}
                        onClick={() => setCurrentIndex(idx)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          idx === currentIndex
                            ? "bg-slate-800 border-cyan-500/60 shadow"
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-200">{student.name}</span>
                            {idx === currentIndex && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded font-semibold">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">ID: {student.id}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {student.status === "PRESENT" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                              Present (AI)
                            </span>
                          )}
                          {student.status === "PRESENT_MANUAL" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30">
                              Present (Manual)
                            </span>
                          )}
                          {student.status === "FAILED_VERIFICATION" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/30">
                              Mismatch
                            </span>
                          )}
                          {student.status === "PENDING" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                              Pending
                            </span>
                          )}
                          {student.status === "ABSENT" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                              Absent
                            </span>
                          )}

                          {/* Quick delete student button */}
                          {(currentUser?.role === "teacher" || currentUser?.role === "admin") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveStudent(student.id, student.name);
                              }}
                              className="text-slate-500 hover:text-red-400 text-xs px-1"
                              title="Delete Student"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ── Export Attendance Report Panel ──────────────────────── */}
              {(currentUser?.role === "teacher" || currentUser?.role === "admin") &&
                students.length > 0 && (
                  <div className="mt-4 border border-slate-700/60 bg-slate-950/60 rounded-xl overflow-hidden">
                    {/* Toggle header */}
                    <button
                      onClick={() => {
                        setShowExportPanel((p) => !p);
                        setExportStatus({ type: "idle", message: "" });
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800/60 transition"
                    >
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <span>📊</span> Export Attendance Report
                      </span>
                      <span className="text-slate-500 text-xs">{showExportPanel ? "▲" : "▼"}</span>
                    </button>

                    {showExportPanel && (
                      <div className="px-4 pb-4 pt-1 space-y-3">
                        <p className="text-[11px] text-slate-400">
                          Choose how to save today&apos;s attendance for{" "}
                          <span className="text-cyan-400 font-semibold">{selectedClass}</span> on{" "}
                          <span className="text-cyan-400 font-semibold">{selectedDate}</span>.
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          {/* Local Download */}
                          <button
                            onClick={handleExportLocal}
                            disabled={exportStatus.type === "loading"}
                            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition disabled:opacity-50"
                          >
                            <span className="text-xl">⬇️</span>
                            <span className="text-[11px] font-bold text-center leading-tight">
                              Download Excel<br />
                              <span className="font-normal text-emerald-400/70">(Local Storage)</span>
                            </span>
                          </button>

                          {/* Server / Online Save */}
                          <button
                            onClick={handleExportServer}
                            disabled={exportStatus.type === "loading"}
                            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition disabled:opacity-50"
                          >
                            <span className="text-xl">☁️</span>
                            <span className="text-[11px] font-bold text-center leading-tight">
                              Save to Server<br />
                              <span className="font-normal text-cyan-400/70">(Online Database)</span>
                            </span>
                          </button>
                        </div>

                        {/* Status message */}
                        {exportStatus.type !== "idle" && (
                          <div
                            className={`p-2.5 rounded-lg text-[11px] font-semibold border ${
                              exportStatus.type === "loading"
                                ? "bg-slate-800 border-slate-700 text-slate-300 animate-pulse"
                                : exportStatus.type === "success"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : "bg-red-500/10 border-red-500/30 text-red-300"
                            }`}
                          >
                            {exportStatus.message}
                          </div>
                        )}

                        {/* Summary row */}
                        <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1 pt-1">
                          <span>
                            Total:{" "}
                            <span className="text-slate-300 font-semibold">{students.length}</span>
                          </span>
                          <span>
                            Present:{" "}
                            <span className="text-emerald-400 font-semibold">
                              {students.filter((s) => s.status.startsWith("PRESENT")).length}
                            </span>
                          </span>
                          <span>
                            Absent:{" "}
                            <span className="text-rose-400 font-semibold">
                              {students.filter((s) => s.status === "ABSENT").length}
                            </span>
                          </span>
                          <span>
                            Pending:{" "}
                            <span className="text-slate-400 font-semibold">
                              {students.filter((s) => s.status === "PENDING").length}
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Database: Local SQLite (Offline)</span>
                <span>Model: face-api.js (128-d)</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. ADMIN MASTER TAB: MANAGE TEACHERS (Add, View, Remove)                  */}
        {/* ========================================================================= */}
        {activeTab === "admin_teachers" && currentUser?.role === "admin" && (
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Form to Register / Add Teacher */}
            <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-fit">
              <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                👨‍🏫 Register New Teacher
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Add teacher credentials and assign default classroom section.
              </p>

              <form onSubmit={handleAdminAddTeacher} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Teacher ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TCH103"
                    value={adminTeacherId}
                    onChange={(e) => setAdminTeacherId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Teacher Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Rajiv Menon"
                    value={adminTeacherName}
                    onChange={(e) => setAdminTeacherName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Assigned Section
                  </label>
                  <select
                    value={adminTeacherClass}
                    onChange={(e) => setAdminTeacherClass(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    {classesList.map((c) => (
                      <option key={c.id} value={c.name} className="bg-slate-900 text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Password *
                  </label>
                  <input
                    type="text"
                    value={adminTeacherPassword}
                    onChange={(e) => setAdminTeacherPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                {adminTeacherMsg && (
                  <div className="p-2.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300 text-xs">
                    {adminTeacherMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold text-xs uppercase rounded-lg shadow-md transition"
                >
                  Register Teacher
                </button>
              </form>
            </div>

            {/* Registered Teachers List with Remove Capability */}
            <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-bold text-white mb-1 flex items-center justify-between">
                <span>Active Teachers ({teachersList.length})</span>
                <span className="text-xs text-purple-400 font-mono">Admin Authorization</span>
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Teachers currently permitted to run attendance and enroll students.
              </p>

              <div className="space-y-3">
                {teachersList.map((t) => (
                  <div
                    key={t.id}
                    className="p-3.5 bg-slate-800/60 border border-slate-700 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{t.name}</h4>
                      <p className="text-xs text-slate-400">
                        ID: <span className="font-mono text-cyan-400">{t.id}</span> · Assigned:{" "}
                        <span className="text-slate-300">{t.assigned_class || "All Sections"}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => handleRemoveTeacher(t.id, t.name)}
                      className="px-2.5 py-1 bg-red-950/50 hover:bg-red-900/80 text-red-300 border border-red-800/60 text-xs font-semibold rounded-lg transition"
                    >
                      Remove Teacher
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. ADMIN MASTER TAB: MANAGE STUDENTS (Across All Sections)                */}
        {/* ========================================================================= */}
        {activeTab === "admin_students" && currentUser?.role === "admin" && (
          <div className="max-w-5xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  👥 Global Student Registry ({allStudentsList.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Admin Master Control: View, filter, add, or delete any student in the entire school.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={adminClassFilter}
                  onChange={(e) => setAdminClassFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  <option value="ALL">Show All Sections</option>
                  {classesList.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setAddStudentClass(adminClassFilter === "ALL" ? "Grade 10 - Section A" : adminClassFilter);
                    setAddStudentSamples([]);
                    setShowAddStudentModal(true);
                    startEnrollCamera();
                  }}
                  className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white text-xs font-bold rounded-lg shadow"
                >
                  + Add New Student
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {allStudentsList
                .filter((s) => adminClassFilter === "ALL" || s.className === adminClassFilter)
                .map((student) => (
                  <div
                    key={student.id}
                    className="p-3 bg-slate-800/50 border border-slate-700/80 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <strong className="text-slate-100 font-bold text-sm block">{student.name}</strong>
                      <span className="text-slate-400">
                        ID: <span className="font-mono text-cyan-400">{student.id}</span> · Section:{" "}
                        <span className="text-purple-300 font-medium">{student.className}</span> · Face Samples:{" "}
                        <span className="text-emerald-400 font-semibold">{student.sampleCount}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          student.sampleCount > 0
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : "bg-amber-950 text-amber-300 border border-amber-800"
                        }`}
                      >
                        {student.sampleCount > 0 ? "Biometrics Enrolled" : "Needs Face Enrollment"}
                      </span>
                      <button
                        onClick={() => handleRemoveStudent(student.id, student.name)}
                        className="px-2.5 py-1 bg-red-950/50 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. ADMIN MASTER TAB: MANAGE CLASSES                                       */}
        {/* ========================================================================= */}
        {activeTab === "admin_classes" && currentUser?.role === "admin" && (
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-fit">
              <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                🏫 Add Class Section
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Define new grades, class sections, and subjects.
              </p>

              <form onSubmit={handleCreateClass} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Class Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Grade 9 - Section C"
                    value={newAdminClassName}
                    onChange={(e) => setNewAdminClassName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Section Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Section C"
                    value={newAdminClassSection}
                    onChange={(e) => setNewAdminClassSection(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-semibold">
                    Default Course Subject
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Science"
                    value={newAdminClassSubject}
                    onChange={(e) => setNewAdminClassSubject(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                {adminClassMsg && (
                  <div className="p-2.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300 text-xs">
                    {adminClassMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold text-xs uppercase rounded-lg shadow-md transition"
                >
                  Create Class Section
                </button>
              </form>
            </div>

            <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-bold text-white mb-1 flex items-center justify-between">
                <span>Configured Classes ({classesList.length})</span>
                <span className="text-xs text-purple-400 font-mono">Admin Store</span>
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Available sections teachers can select from.
              </p>

              <div className="space-y-3">
                {classesList.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 bg-slate-800/60 border border-slate-700/80 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{c.name}</h4>
                      <p className="text-xs text-slate-400">
                        {c.section} · Subject: <span className="text-cyan-400">{c.default_subject}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedClass(c.name);
                          setActiveTab("attendance");
                        }}
                        className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 text-xs font-semibold rounded-lg"
                      >
                        Open Roster
                      </button>
                      <button
                        onClick={() => handleRemoveClass(c.id, c.name)}
                        className="px-2 py-1 bg-red-950/50 hover:bg-red-900 text-red-300 border border-red-800/60 text-xs font-semibold rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. DEV DIAGNOSTICS (Image 4)                                              */}
        {/* ========================================================================= */}
        {activeTab === "diagnostics" && (
          <div className="max-w-3xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white">Dev Diagnostic 1:1 Identity Comparator</h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase">
                Testing Mode Only
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Upload two consented test images to inspect face detection, embedding vectors, distance, and threshold logic.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="border border-slate-800 bg-slate-950 p-4 rounded-xl flex flex-col">
                <span className="text-xs font-semibold text-slate-300 mb-2">
                  Image A: Registered Student Template
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const r = new FileReader();
                      r.onload = () => setDiagFileA(r.result as string);
                      r.readAsDataURL(f);
                    }
                  }}
                  className="text-xs text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                />
                {diagFileA && (
                  <div className="mt-3 aspect-video bg-black rounded overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={diagFileA} alt="Image A" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="border border-slate-800 bg-slate-950 p-4 rounded-xl flex flex-col">
                <span className="text-xs font-semibold text-slate-300 mb-2">
                  Image B: Live / Test Face Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const r = new FileReader();
                      r.onload = () => setDiagFileB(r.result as string);
                      r.readAsDataURL(f);
                    }
                  }}
                  className="text-xs text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                />
                {diagFileB && (
                  <div className="mt-3 aspect-video bg-black rounded overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={diagFileB} alt="Image B" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleRunDiagnostic}
              disabled={!diagFileA || !diagFileB || diagRunning}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow disabled:opacity-50"
            >
              {diagRunning ? "Analyzing Neural Vectors..." : "Run Diagnostic Identity Comparison"}
            </button>

            {diagError && (
              <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-500 text-rose-300 text-xs">
                {diagError}
              </div>
            )}

            {diagResult && (
              <div
                className={`mt-4 p-4 rounded-xl border ${
                  diagResult.match
                    ? "bg-emerald-950/40 border-emerald-500 text-emerald-300"
                    : "bg-rose-950/40 border-rose-500 text-rose-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">
                    {diagResult.match ? "✓ Matches Same Identity" : "✗ Biometric Identity Mismatch"}
                  </span>
                  <span className="font-mono text-xs">
                    Similarity: {diagResult.similarity}% | Distance: {diagResult.distance}
                  </span>
                </div>
                <p className="text-xs opacity-80">
                  Euclidean distance: {diagResult.distance} (Strict match threshold: ≤ {SIMILARITY_THRESHOLD})
                </p>
              </div>
            )}
          </div>
        )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* INLINE MODAL: ADD STUDENT TO CURRENT SECTION (Teacher & Admin)           */}
      {/* ========================================================================= */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                stopEnrollCamera();
                setShowAddStudentModal(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-base"
            >
              ✕
            </button>

            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              ➕ Add Student to Section
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Enrolling into section: <span className="text-cyan-400 font-bold">{addStudentClass}</span>
            </p>

            <form onSubmit={handleAddStudentSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Student ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. STU009"
                    value={addStudentId}
                    onChange={(e) => setAddStudentId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ananya Sen"
                    value={addStudentName}
                    onChange={(e) => setAddStudentName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              {currentUser?.role === "admin" && (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Change Section
                  </label>
                  <select
                    value={addStudentClass}
                    onChange={(e) => setAddStudentClass(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    {classesList.map((c) => (
                      <option key={c.id} value={c.name} className="bg-slate-900 text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Camera Face Snapshot Viewport */}
              <div className="border border-slate-800 bg-slate-950 rounded-xl p-3 flex flex-col items-center">
                <canvas ref={enrollCanvasRef} className="hidden" />
                <div className="w-full aspect-video bg-black rounded-lg overflow-hidden relative mb-2 flex items-center justify-center">
                  <video
                    ref={enrollVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                    style={{ transform: "scaleX(-1)" }}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={captureEnrollSample}
                    className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold rounded-lg text-white shadow"
                  >
                    📸 Capture Face Sample ({addStudentSamples.length})
                  </button>
                </div>
              </div>

              {/* Sample Previews */}
              {addStudentSamples.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Captured Samples ({addStudentSamples.length}):
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {addStudentSamples.map((src, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="sample" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAddStudentSamples((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {addStudentStatus && (
                <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
                  {addStudentStatus}
                </div>
              )}

              <button
                type="submit"
                disabled={addStudentSamples.length === 0 || addStudentLoading}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 text-white font-bold text-xs uppercase rounded-lg shadow-lg disabled:opacity-50 transition"
              >
                {addStudentLoading ? "Processing Biometrics..." : `Save Student to ${addStudentClass}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Profile Details Modal ────────────────────────────────────── */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowProfileModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-base"
            >
              ✕
            </button>
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-800">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-xl font-bold text-white shadow-lg">
                {currentUser.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{currentUser.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold uppercase">
                  {currentUser.role}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">User ID</span>
                <span className="font-mono font-bold text-white">{currentUser.id}</span>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Assigned Section</span>
                <span className="font-semibold text-cyan-400">
                  {currentUser.assigned_class || "All Sections (Admin)"}
                </span>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Role Authority</span>
                <span className="font-semibold text-purple-400 capitalize">
                  {currentUser.role === "admin" ? "Master Admin Rights" : "Classroom Attendance"}
                </span>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Active Database</span>
                <span className="font-mono text-emerald-400">MongoDB Atlas (Cloud)</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
