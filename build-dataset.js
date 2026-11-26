const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "data");
const IMAGES_DIR = path.join(__dirname, "images");

// Set to a number (e.g. 3) to cap submissions per target, or null for all
const MAX_SUBMISSIONS_PER_TARGET = null;

function getOutputFilePath() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return path.join(__dirname, `dataset_final.json`);
}

async function walkFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walkFiles(fullPath) : fullPath;
    })
  );
  return files.flat();
}

function indexImages(imagePaths) {
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

  for (const fullPath of imagePaths) {
    const relPath = path.relative(__dirname, fullPath).split(path.sep).join("/");

    const isoMatch = relPath.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (isoMatch) {
      byIsoDate.set(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, relPath);
    }

    const baseName = path.basename(relPath);
    const monDayMatch = baseName.match(/^([A-Za-z]{3})[_-](\d{1,2})/);
    if (monDayMatch) {
      const mm = monthNames[monDayMatch[1].toLowerCase()];
      const dd = monDayMatch[2].padStart(2, "0");
      if (mm) {
        const yearMatch = relPath.match(/images\/(\d{4})\//);
        if (yearMatch) {
          byIsoDate.set(`${yearMatch[1]}-${mm}-${dd}`, relPath);
        }
        byMonthDay.set(`${mm}-${dd}`, relPath);
      }
    }
  }

  return { byIsoDate, byMonthDay };
}

function findMatchingImage(dateStr, filename, imageIndex) {
  if (dateStr && imageIndex.byIsoDate.has(dateStr)) {
    return imageIndex.byIsoDate.get(dateStr);
  }

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
  const outputFile = getOutputFilePath();
  const allDataFiles = (await walkFiles(DATA_DIR)).filter((f) =>
    f.endsWith(".json")
  );
  const allImageFiles = (await walkFiles(IMAGES_DIR)).filter((f) =>
    /\.(png|jpe?g|webp|gif|svg)$/i.test(f)
  );

  const imageIndex = indexImages(allImageFiles);
  const dataset = [];
  let skippedNoCode = 0;
  let skippedNoImage = 0;

  for (const filePath of allDataFiles.sort()) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const record = JSON.parse(raw);

      const validSubmissions = Array.isArray(record.submissions)
        ? record.submissions.filter(
            (s) => typeof s === "string" && s.trim().length > 0
          )
        : [];

      if (validSubmissions.length === 0) {
        skippedNoCode++;
        continue;
      }

      const matchedImage = findMatchingImage(
        record.date,
        path.basename(filePath),
        imageIndex
      );

      if (!matchedImage) {
        skippedNoImage++;
        continue;
      }

      const selectedSubmissions =
        typeof MAX_SUBMISSIONS_PER_TARGET === "number"
          ? validSubmissions.slice(0, MAX_SUBMISSIONS_PER_TARGET)
          : validSubmissions;

      const colors = Array.isArray(record.colors) ? record.colors : [];

      for (const code of selectedSubmissions) {
        dataset.push({
          image: matchedImage,
          colors,
          code,
        });
      }
    } catch (err) {
      console.error(`Failed processing ${filePath}:`, err.message);
    }
  }

  await fs.writeFile(outputFile, JSON.stringify(dataset, null, 2), "utf8");
  console.log(
    `Done. Wrote ${dataset.length} items to ${outputFile} (skipped: ${skippedNoCode} empty, ${skippedNoImage} unmatched image).`
  );
}

main();
