const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split('T')[0];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Go to main site first
  await page.goto('https://cssbattle.dev', { waitUntil: 'networkidle' });

  // 2. Locate and click the top solutions button, or navigate directly to its target URL
  const buttonSelector = 'a.button[href*="openTopSolutions=true"]';
  
  try {
    await page.waitForSelector(buttonSelector, { timeout: 5000 });
    await page.click(buttonSelector);
  } catch (error) {
    console.log('Button not clicked directly; navigating via URL query param...');
    // Fallback direct navigation if home DOM varies
    await page.goto('https://cssbattle.dev/play/YaO5dVF3I9R870zMutcX?openTopSolutions=true', {
      waitUntil: 'networkidle'
    });
  }

  // Wait for submission items to load inside the modal/panel
  await page.waitForSelector('.submissions-list__item', { timeout: 15000 }).catch(() => {
    console.log('Submission items took long to load or required login.');
  });

  // Extract submission codes
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
