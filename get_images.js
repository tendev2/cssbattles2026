import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const URL = "https://cssbattle.dev/daily?month=6&year=2023";
const OUTPUT_DIR = "images";

// Ensure the output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scrape() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log(`Navigating to ${URL}...`);
    // Change wait_until to 'domcontentloaded' to avoid hanging on persistent background requests
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("Waiting for calendar grid to render...");
    // Wait specifically for the grid element or daily tiles to be visible
    await page.waitForSelector('.PreviousDailyTargets-module__mEeCpq__calendarGrid, .target-tile--daily', { timeout: 30000 });

    // Extract image URLs and date text directly from the browser context
    const targets = await page.$$eval('.target-tile--daily', tiles => {
        return tiles.map(tile => {
            const img = tile.querySelector('img.target-tile__image');
            const pill = tile.querySelector('.target-top-info__pill');
            return {
                url: img ? img.src : null,
                dateText: pill ? pill.textContent.trim() : null
            };
        }).filter(t => t.url && t.dateText);
    });

    console.log(`Found ${targets.length} valid targets. Downloading images...`);

    let count = 0;
    for (const target of targets) {
        try {
            // Clean up date text (e.g., "Jun 28 🥵" -> "2023_Jun_28.png")
            const cleanDate = target.dateText.replace(/🥵/g, '').trim().replace(/\s+/g, '_');
            const filename = `2023_${cleanDate}.png`;
            const filepath = path.join(OUTPUT_DIR, filename);

            const response = await fetch(target.url);
            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                fs.writeFileSync(filepath, buffer);
                console.log(`Saved: ${filename}`);
                count++;
            }
        } catch (err) {
            console.error(`Failed to download ${target.url}:`, err);
        }
    }

    await browser.close();
    console.log(`Successfully downloaded ${count} images to '${OUTPUT_DIR}/'.`);
}

scrape().catch(err => {
    console.error("Scraping failed:", err);
    process.exit(1);
});
