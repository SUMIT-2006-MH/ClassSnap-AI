# ClassSnap AI 2.0

AI-powered classroom attendance system using **face-api.js** — runs entirely in the browser with no Python required.

## Stack
- **Next.js 15** (App Router, TypeScript)
- **face-api.js** (browser-side face detection + 128-d recognition)
- **Next.js API Routes** (data persistence)
- **better-sqlite3** (SQLite database on the server)
- **Tailwind CSS v4**

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Download face-api.js model weights
```bash
npm run download-models
```
This downloads SSD MobileNet, Face Landmark, and Face Recognition models into `public/models/`.

### 3. Start the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features
- **Attendance Tab** — Live webcam face verification against enrolled students
- **Enroll Tab** — Register new students with 5 face captures
- **Diagnostics Tab** — Compare two images and view similarity score
- **Manual Override** — Mark attendance manually if verification fails

## How Face Recognition Works
1. Models loaded from `/models/` on startup
2. `SsdMobilenetv1` detects faces in video frames
3. `FaceLandmark68Net` finds 68 facial keypoints
4. `FaceRecognitionNet` extracts a 128-dimensional descriptor
5. `FaceMatcher` compares descriptors using Euclidean distance (threshold: 0.5)
6. Descriptors stored in SQLite via API routes
