import fs from "node:fs/promises";
import path from "node:path";

const OWNER = "tendev2";
const REPO = "cssbattles2026";
const BRANCH = "main";
const OUTPUT_FILE = "dataset.json";

// Optional: set GITHUB_TOKEN env var if you hit rate limits
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "cssbattles-dataset-builder",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Uses the Git Trees API recursively so nested folders like
 * images/2026/07/Jul_13_🙂.png are listed in one request.
 */
async function getRepoTree() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const data = await fetchJson(url);
  if (data.truncated) {
    console.warn("Warning: Git tree response was truncated.");
  }
  return data.tree.filter((item) => item.type === "blob");
}

/**
 * Builds lookup maps for images so we can match a JSON record's `date`
 * (e.g., "2023-08-05" or "2026-07-13") to its path under `images/`.
 */
function indexImages(imageBlobs) {
  const byIsoDate = new Map();
  const byMonthDay = new Map();

  const monthNames = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  for (const blob of imageBlobs) {
    const filePath = blob.path; // e.g. "images/2026/07/Jul_13_🙂.png"
    const decodedPath = decodeURIComponent(filePath);

    // Match YYYY/MM/... or YYYY-MM-DD in path
    const isoMatch = decodedPath.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (isoMatch) {
      const key = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      byIsoDate.set(key, filePath);
    }

    // Match Mon_DD in filename (e.g., Jul_13_...) + optional year folder
    const baseName = path.basename(decodedPath);
    const monDayMatch = baseName.match(/^([A-Za-z]{3})[_-](\d{1,2})/);
    if (monDayMatch) {
      const mm = monthNames[monDayMatch[1].toLowerCase()];
      const dd = monDayMatch[2].padStart(2, "0");
      if (mm) {
        const yearMatch = decodedPath.match(/images\/(\d{4})\//);
        if (yearMatch) {
          byIsoDate.set(`${yearMatch[1]}-${mm}-${dd}`, filePath);
        }
        byMonthDay.set(`${mm}-${dd}`, filePath);
      }
    }
  }

  return { byIsoDate, byMonthDay };
}

function findMatchingImage(dateStr, filename, imageIndex) {
  if (dateStr && imageIndex.byIsoDate.has(dateStr)) {
    return imageIndex.byIsoDate.get(dateStr);
  }

  // Fallback: extract YYYY-MM-DD from filename like submissions_results_2023-08-05.json
  const fileDateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (fileDateMatch) {
    const d = fileDateMatch[1];
    if (imageIndex.byIsoDate.has(d)) {
      return imageIndex.byIsoDate.get(d);
    }
    const mmdd = d.slice(5);
    if (imageIndex.byMonthDay.has(mmdd)) {
      return imageIndex.byMonthDay.get(mmdd);
    }
  }

  return null;
}

async function main() {
  const blobs = await getRepoTree();

  const dataFiles = blobs.filter(
    (b) => b.path.startsWith("data/") && b.path.endsWith(".json")
  );
  const imageBlobs = blobs.filter(
    (b) =>
      b.path.startsWith("images/") &&
      /\.(png|jpe?g|webp|gif|svg)$/i.test(b.path)
  );

  const imageIndex = indexImages(imageBlobs);
  const dataset = [];
  let skippedNoCode = 0;
  let skippedNoImage = 0;

  for (const fileBlob of dataFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${fileBlob.path}`;
    try {
      const record = await fetchJson(rawUrl);
      const firstSubmission = Array.isArray(record.submissions)
        ? record.submissions[0]
        : undefined;

      if (!firstSubmission) {
        skippedNoCode++;
        continue;
      }

      const matchedImage = findMatchingImage(
        record.date,
        path.basename(fileBlob.path),
        imageIndex
      );

      if (!matchedImage) {
        skippedNoImage++;
        continue;
      }

      dataset.push({
        image: matchedImage,
        colors: Array.isArray(record.colors) ? record.colors : [],
        code: firstSubmission,
      });
    } catch (err) {
      console.error(`Failed processing ${fileBlob.path}:`, err.message);
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(dataset, null, 2), "utf8");
  console.log(
    `Done. Wrote ${dataset.length} items to ${OUTPUT_FILE} (skipped: ${skippedNoCode} missing submission, ${skippedNoImage} unmatched image).`
  );
}

main();
