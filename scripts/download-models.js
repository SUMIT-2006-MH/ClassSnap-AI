/**
 * Download face-api.js model weights into public/models/
 * Run: node scripts/download-models.js
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE_URL =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

// Exact list of files required by the manifests
const MODELS = [
  // SSD MobileNet v1 (Face Detection) - Requires manifest + 2 shards
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model-shard1",
  "ssd_mobilenetv1_model-shard2",

  // Face Landmark 68 (Facial Landmarks) - Requires manifest + 1 shard
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",

  // Face Recognition Net (128-d Descriptors) - Requires manifest + 2 shards
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",

  // Tiny Face Detector (Fast alternative) - Requires manifest + 1 shard
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model-shard1",
];

const MODELS_DIR = path.join(__dirname, "..", "public", "models");

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;

    const req = proto.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return downloadFile(res.headers.location, dest)
            .then(resolve)
            .catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(
            new Error(`HTTP ${res.statusCode} status while downloading ${url}`)
          );
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let receivedBytes = 0;
        const fileStream = fs.createWriteStream(dest);

        res.on("data", (chunk) => {
          receivedBytes += chunk.length;
          fileStream.write(chunk);
        });

        res.on("end", () => {
          fileStream.end(() => {
            if (totalBytes > 0 && receivedBytes < totalBytes) {
              try { fs.unlinkSync(dest); } catch {}
              return reject(
                new Error(
                  `Incomplete download for ${path.basename(dest)}: received ${receivedBytes}/${totalBytes} bytes`
                )
              );
            }
            resolve(receivedBytes);
          });
        });

        res.on("error", (err) => {
          fileStream.close();
          try { fs.unlinkSync(dest); } catch {}
          reject(err);
        });
      }
    );

    req.on("error", (err) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });

    req.setTimeout(60000, () => {
      req.destroy();
      try { fs.unlinkSync(dest); } catch {}
      reject(new Error(`Timeout downloading ${path.basename(dest)}`));
    });
  });
}

async function main() {
  console.log("=================================================");
  console.log("  Downloading face-api.js Models");
  console.log(`  Target Folder: ${MODELS_DIR}`);
  console.log("=================================================\n");

  let successCount = 0;

  for (const model of MODELS) {
    const dest = path.join(MODELS_DIR, model);

    // If file already exists and is not empty, check if we can reuse it
    if (fs.existsSync(dest)) {
      const stats = fs.statSync(dest);
      if (stats.size > 1000) {
        console.log(
          `  [EXISTS] ${model} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
        );
        successCount++;
        continue;
      } else {
        try { fs.unlinkSync(dest); } catch {}
      }
    }

    const url = `${BASE_URL}/${model}`;
    console.log(`  [DOWNLOADING] ${model}...`);
    try {
      const bytes = await downloadFile(url, dest);
      console.log(
        `  [OK] ${model} (${(bytes / 1024 / 1024).toFixed(2)} MB)`
      );
      successCount++;
    } catch (err) {
      console.error(`  [FAILED] ${model}: ${err.message}`);
    }
  }

  console.log("\n=================================================");
  if (successCount === MODELS.length) {
    console.log(`  All ${MODELS.length} model files downloaded successfully!`);
    console.log("=================================================\n");
  } else {
    console.warn(`  Downloaded ${successCount}/${MODELS.length} files.`);
    console.log("=================================================\n");
    process.exit(1);
  }
}

main();
