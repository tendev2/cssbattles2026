const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Set to a number (e.g. 3) to cap submissions per target, or null for all
const MAX_SUBMISSIONS_PER_TARGET = 1;
const DATASET_FILE = path.join(__dirname, 'dataset.json');

function appendTargetToDataset(datasetPath, relImagePath, colors, submissions) {
  const validSubmissions = Array.isArray(submissions)
    ? submissions.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];

  if (!relImagePath || validSubmissions.length === 0) {
    console.log('Skipping dataset update: missing image or valid submissions.');
    return;
  }

  const selected =
    typeof MAX_SUBMISSIONS_PER_TARGET === 'number'
      ? validSubmissions.slice(0, MAX_SUBMISSIONS_PER_TARGET)
      : validSubmissions;

  let dataset = [];
  if (fs.existsSync(datasetPath)) {
    const raw = fs.readFileSync(datasetPath, 'utf8').trim();
    if (raw) {
      dataset = JSON.parse(raw);
    }
  }

  const normalizedColors = Array.isArray(colors) ? colors : [];
  for (const code of selected) {
    dataset.push({
      image: relImagePath,
      colors: normalizedColors,
      code,
    });
  }

  fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
  console.log(`Added ${selected.length} entries for ${relImagePath} to ${datasetPath}`);
}

(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split('T')[0];

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  console.log('Navigating to CSSBattle...');
  await page.goto('https://cssbattle.dev', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  const buttonSelector = 'a.button[href*="openTopSolutions=true"]';

  try {
    await page.waitForSelector(buttonSelector, { timeout: 10000 });
    await page.click(buttonSelector);
  } catch (error) {
    console.log('Button not found on home page, opening fallback target...');
    await page.goto(
      'https://cssbattle.dev/play/cubFEvfArqYmYhs3IHF4?openTopSolutions=true',
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      }
    );
  }

  console.log('Waiting for elements to load...');
  await page.waitForSelector('.submissions-list__item', { timeout: 20000 }).catch(() => {
    console.log('Submission items took long to load or are unavailable.');
  });

  // Extract page data: image URL, colors, and submissions
  const scrapedData = await page.evaluate(() => {
    // 1. Extract Target Image URL
    const imgElement = document.querySelector('img.levelpage__target');
    const targetImage = imgElement ? imgElement.src : null;

    // 2. Extract Colors
    const colorButtons = document.querySelectorAll('.colors-list__color');
    const colors = Array.from(colorButtons)
      .map((btn) => btn.textContent.trim())
      .filter((color) => color.startsWith('#'));

    // 3. Extract Submissions
    const items = document.querySelectorAll('.submissions-list__item');
    const submissions = Array.from(items)
      .map((item) => {
        const codeElement = item.querySelector('.submissions-list__code');
        if (!codeElement) return null;
        // Strip character count badge and separator (e.g., "91› ")
        return codeElement.textContent.trim().replace(/^\d+›\s*/, '');
      })
      .filter(Boolean);

    return {
      targetImage,
      colors,
      submissions,
    };
  });

  let savedRelImagePath = null;

  // Download the target image to images/year/month/
  if (scrapedData.targetImage) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const monthName = months[yesterday.getMonth()];
    const imageName = `${monthName}_${String(yesterday.getDate()).padStart(2, '0')}.png`;

    const year = dateString.split('-')[0];
    const month = dateString.split('-')[1];
    const imageDir = path.join(__dirname, 'images', year, month);
    fs.mkdirSync(imageDir, { recursive: true });

    const imageResponse = await context.request.get(scrapedData.targetImage);
    if (imageResponse.ok()) {
      const imageBuffer = await imageResponse.body();
      const imagePath = path.join(imageDir, imageName);
      fs.writeFileSync(imagePath, imageBuffer);
      savedRelImagePath = path.relative(__dirname, imagePath).split(path.sep).join('/');
      console.log(`Saved image to ${imagePath}`);
    } else {
      console.log(`Failed to download image: ${imageResponse.status()}`);
    }
  } else {
    console.log('No target image found, skipping download.');
  }

  await browser.close();

  // Construct final JSON output matching required format
  const jsonData = {
    date: dateString,
    target: scrapedData.targetImage,
    colors: scrapedData.colors,
    submissions: scrapedData.submissions,
  };

  const outputDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `submissions_results_${dateString}.json`);
  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
  console.log(`Successfully saved data to ${filePath}`);

  // Append entries for this scraped target into dataset.json
  appendTargetToDataset(
    DATASET_FILE,
    savedRelImagePath,
    scrapedData.colors,
    scrapedData.submissions
  );
})();
