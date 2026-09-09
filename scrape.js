const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split('T')[0];

  const browser = await chromium.launch({ headless: true });
  // Set a standard desktop User-Agent to avoid headless blocking
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log('Navigating to CSSBattle...');
  // Use 'domcontentloaded' instead of 'networkidle' to avoid socket connection timeouts
  await page.goto('https://cssbattle.dev', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  const buttonSelector = 'a.button[href*="openTopSolutions=true"]';

  try {
    await page.waitForSelector(buttonSelector, { timeout: 10000 });
    await page.click(buttonSelector);
  } catch (error) {
    console.log('Button selector not found on main page, navigating directly to fallback URL...');
    await page.goto('https://cssbattle.dev/play/YaO5dVF3I9R870zMutcX?openTopSolutions=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  }

  console.log('Waiting for submissions list to render...');
  await page.waitForSelector('.submissions-list__item', { timeout: 20000 }).catch(() => {
    console.log('Submission items took long to load or are unavailable.');
  });

  const filteredResults = await page.evaluate(() => {
    const items = document.querySelectorAll('.submissions-list__item');
    return Array.from(items)
      .map(item => {
        const codeElement = item.querySelector('.submissions-list__code');
        return codeElement ? codeElement.textContent.trim() : null;
      })
      .filter(Boolean);
  });

  await browser.close();

  const jsonData = {
    date: dateString,
    targetUrl: page.url(),
    submissions: filteredResults
  };

  const outputDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `submissions_results_${dateString}.json`);
  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
  console.log(`Saved ${filteredResults.length} submission(s) to ${filePath}`);
})();
