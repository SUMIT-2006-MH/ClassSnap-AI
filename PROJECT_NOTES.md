# ClassSnap AI — Project Documentation & Analysis Notes

> **Project Name**: ClassSnap AI  
> **Source Scanned**: `C:\Users\sumit\OneDrive\Desktop\ClassSnap AI`  
> **Generated**: November 15, 2026  

---

## 1. Executive Summary & Important Notes

* **Concept**: **ClassSnap AI** is a full-stack, AI-powered automated classroom attendance and facial verification system.
* **Architecture**: Decoupled full-stack architecture featuring a **Next.js 16 (React 19)** frontend and a **FastAPI (Python)** backend with an embedded **SQLite** database.
* **Computer Vision & AI**: Employs an **ArcFace (MobileFaceNet)** deep learning model running offline via **ONNX Runtime** and **OpenCV** to extract 512-dimensional facial feature embeddings.
* **Verification Algorithm**: Compares extracted facial embeddings against enrolled student profiles using **Cosine Similarity** with a strict default threshold of `0.55` (minimizing False Acceptance Rate to < 0.01%).
* **Key Functionalities**:
  * **Student Face Enrollment**: Captures multiple face sample images and averages embeddings to build a reliable profile.
  * **Automated Attendance Verification**: Compares live camera snapshots against expected roster students to automatically mark attendance.
  * **Manual Fallback**: Teachers can manually mark attendance if verification fails or camera issues occur.
  * **Real-time Diagnostics**: Developer tool to compare two image samples side-by-side and view similarity scores.

---

## 2. Folder Breakdown (Purpose of Each Directory)

```
ClassSnap AI/
├── .vscode/               # VS Code IDE workspace configuration
└── classsnap-ai/          # Core application repository
    ├── app/               # Next.js frontend (App Router UI)
    ├── backend/           # Python FastAPI backend & AI engine
    │   └── models/        # Storage directory for ONNX model weights
    ├── public/            # Static assets (SVGs, icons)
    ├── .next/             # Next.js build cache (auto-generated)
    └── node_modules/      # Node.js dependencies (auto-generated)
```

### Detailed Folder Functions:

| Folder Path | Short Description & Work |
| :--- | :--- |
| **`.vscode/`** | Stores workspace-level IDE settings (e.g. editor formatting, python path). |
| **`classsnap-ai/app/`** | **Frontend Client**: Built with Next.js 16 App Router and Tailwind CSS. Contains `page.tsx` (the entire interactive single-page app with live webcam integration, attendance dashboard, enrollment flow, and diagnostic panels) and `layout.tsx` (HTML root wrapper and fonts). |
| **`classsnap-ai/backend/`** | **API & Computer Vision Engine**: FastAPI backend handling REST endpoints, SQLite database management, ONNX model loading, image preprocessing, face embedding extraction, and cosine similarity matching. |
| **`classsnap-ai/backend/models/`** | **Model Weights Storage**: Dedicated folder for local neural network weights (`arcface.onnx`). Loaded by ONNX Runtime during inference. |
| **`classsnap-ai/public/`** | **Static Frontend Assets**: Stores web icons and branding SVGs (`next.svg`, `globe.svg`, `file.svg`, `vercel.svg`, `window.svg`). |
| **`classsnap-ai/.next/`** | *(Generated)* Next.js compiler output, server chunks, and client bundles. |
| **`classsnap-ai/node_modules/`** | *(Generated)* External JavaScript/TypeScript npm packages and dependencies. |

---

## 3. Key Source Files Overview

* **`backend/main.py`**: Entry point for the FastAPI server. Exposes `/api/enroll`, `/api/verify`, `/api/attendance/mark`, `/api/attendance`, and `/api/dev/compare`.
* **`backend/utils.py`**: Core AI logic. Handles OpenCV image loading, BGR-to-RGB conversion, ArcFace preprocessing (112x112 resize & normalization), ONNX session inference, embedding normalization, and cosine similarity calculation.
* **`backend/db.py`**: SQLite database adapter (`classsnap.db`). Manages student profile tables, stored embeddings (JSON strings), and attendance audit records.
* **`backend/download_model.py`**: Automated utility script to download the ArcFace ONNX model from Hugging Face.
* **`backend/test_verification.py`**: Pytest test suite validating embedding generation, threshold calculations, and database CRUD operations.
* **`app/page.tsx`**: React client component implementing real-time webcam streaming (HTML5 Canvas & Video), multi-step enrollment, and attendance roster table.

---

## 4. Languages Used & Percentage Breakdown

### A. Source Code Only (100% of Programming Code)

| Language | Lines of Code (LOC) | Code Ratio (LOC) | File Size (Bytes) | Code Ratio (Bytes) | Primary Usage |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Python** | 1,099 | **55.20%** | 37,467 B | **50.38%** | Backend API, AI inference, DB, test suite |
| **TypeScript** | 848 | **42.59%** | 35,951 B | **48.34%** | Next.js frontend pages, layout & typing |
| **CSS** | 26 | **1.31%** | 488 B | **0.66%** | Tailwind CSS styling rules |
| **JavaScript** | 18 | **0.90%** | 465 B | **0.63%** | ESLint configuration (`.mjs`) |
| **Total** | **1,991** | **100.00%** | **74,371 B** | **100.00%** | — |

---

### B. Entire Project (All Text, Config & Documentation - 100% Total)

| File Type / Extension | Lines | % of Total Lines | Primary Files |
| :--- | :---: | :---: | :--- |
| **Python** (`.py`) | 1,099 | **51.07%** | `main.py`, `utils.py`, `db.py`, `test_verification.py` |
| **TypeScript** (`.ts`, `.tsx`) | 848 | **39.41%** | `page.tsx`, `layout.tsx`, `next.config.ts` |
| **JSON** (`.json`) | 60 | **2.79%** | `package.json`, `tsconfig.json` |
| **Markdown** (`.md`) | 45 | **2.09%** | `README.md`, `AGENTS.md` |
| **Git / Config** (`.gitignore`) | 41 | **1.91%** | `.gitignore` |
| **CSS** (`.css`) | 26 | **1.21%** | `globals.css` |
| **JavaScript** (`.mjs`) | 18 | **0.84%** | `eslint.config.mjs` |
| **Plain Text** (`.txt`) | 10 | **0.46%** | `requirements.txt` |
| **SVG Vectors** (`.svg`) | 5 | **0.23%** | `next.svg`, `globe.svg`, `file.svg`, etc. |
| **Total** | **2,152** | **100.00%** | — |

---

## 5. Quick Start & Execution Guide

### 1. Backend Setup (FastAPI & ONNX Runtime)
```bash
cd "C:\Users\sumit\OneDrive\Desktop\ClassSnap AI\classsnap-ai\backend"

# Install Python requirements
pip install -r requirements.txt

# Download ArcFace ONNX weights into backend/models/
python download_model.py

# Start FastAPI server (runs on http://127.0.0.1:8000)
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup (Next.js)
```bash
cd "C:\Users\sumit\OneDrive\Desktop\ClassSnap AI\classsnap-ai"

# Install packages
npm install

# Start Next.js development server (runs on http://localhost:3000)
npm run dev
```
