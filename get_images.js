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
    await page.goto(URL, { waitUntil: 'networkidle' });

    // Wait for the calendar tiles to render completely
    await page.waitForSelector('.target-tile--daily', { timeout: 10000 });

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
