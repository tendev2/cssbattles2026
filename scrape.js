const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split('T')[0];

  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log('Navigating to CSSBattle...');
  await page.goto('https://cssbattle.dev', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  const buttonSelector = 'a.button[href*="openTopSolutions=true"]';

  try {
    await page.waitForSelector(buttonSelector, { timeout: 10000 });
    await page.click(buttonSelector);
  } catch (error) {
    console.log('Button not found on home page, opening fallback target...');
    await page.goto('https://cssbattle.dev/play/cubFEvfArqYmYhs3IHF4?openTopSolutions=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
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
      .map(btn => btn.textContent.trim())
      .filter(color => color.startsWith('#'));

    // 3. Extract Submissions
    const items = document.querySelectorAll('.submissions-list__item');
    const submissions = Array.from(items)
      .map(item => {
        const codeElement = item.querySelector('.submissions-list__code');
        if (!codeElement) return null;
        // Strip character count badge and separator (e.g., "91› ")
        return codeElement.textContent.trim().replace(/^\d+›\s*/, '');
      })
      .filter(Boolean);

    return {
      targetImage,
      colors,
      submissions
    };
  });

  await browser.close();

  // Construct final JSON output matching required format
  const jsonData = {
    date: dateString,
    target: scrapedData.targetImage,
    colors: scrapedData.colors,
    submissions: scrapedData.submissions
  };

  const outputDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `submissions_results_${dateString}.json`);
  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
  console.log(`Successfully saved data to ${filePath}`);
})();
