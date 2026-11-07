import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUTPUT_DIR = "images";

// Helper function to add a delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to thoroughly clean filenames (removes emojis, symbols, and extra spaces)
function sanitizeFilename(text) {
    return text
        // Remove emojis and pictographs using Unicode property escapes
        .replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '')
        // Remove any non-word characters except spaces, underscores, and hyphens
        .replace(/[^\w\s-]/g, '')
        .trim()
        // Replace spaces or multiple underscores with a single underscore
        .replace(/\s+/g, '_');
}

async function scrapeMonthWithRetry(page, url, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Navigating to ${url} (Attempt ${attempt}/${retries})...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            await page.waitForSelector('.target-tile--daily', { timeout: 40000 });
            return true; // Success
        } catch (err) {
            console.warn(`Attempt ${attempt} failed for ${url}: ${err.message}`);
            if (attempt < retries) {
                console.log(`Retrying in 5 seconds...`);
                await sleep(5000);
            } else {
                console.error(`Failed to load ${url} after ${retries} attempts.`);
                return false;
            }
        }
    }
}

async function scrape() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Define start date (June 28, 2023) and today's date
    const startDate = new Date(2023, 5, 28); // Month is 0-indexed (5 = June)
    const today = new Date();

    let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (currentDate <= today) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1; // 1-12
        const monthStr = String(month).padStart(2, '0'); // Padded format like "06"
        const url = `https://cssbattle.dev/daily?month=${month}&year=${year}`;

        const loaded = await scrapeMonthWithRetry(page, url, 3);
        
        if (loaded) {
            try {
                // Extract targets from the DOM
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

                console.log(`Found ${targets.length} targets for ${monthStr}/${year}. Processing...`);

                // Define target folder path: images/YYYY/MM/
                const monthDir = path.join(OUTPUT_DIR, String(year), monthStr);
                if (!fs.existsSync(monthDir)) {
                    fs.mkdirSync(monthDir, { recursive: true });
                }

                for (const target of targets) {
                    try {
                        // Sanitize the date text to strip emojis and weird special characters
                        const cleanDateText = sanitizeFilename(target.dateText); 
                        if (cleanDateText) console.log(`${target.dateText}  *******>   ${leanDateText}`);
                        if (!cleanDateText) continue;
                        const filename = `${cleanDateText}.png`;
                        const filepath = path.join(monthDir, filename);

                        // Duplicate check: Skip download if file already exists locally
                        if (fs.existsSync(filepath)) {
                            console.log(`Skipping (already exists): ${year}/${monthStr}/${filename}`);
                            continue;
                        }

                        // Download image via fetch
                        const response = await fetch(target.url);
                        if (response.ok) {
                            const buffer = Buffer.from(await response.arrayBuffer());
                            fs.writeFileSync(filepath, buffer);
                            console.log(`Saved: ${year}/${monthStr}/${filename}`);
                        }
                    } catch (err) {
                        console.error(`Failed to download image from ${target.url}:`, err.message);
                    }
                }
            } catch (err) {
                console.error(`Error processing data for ${monthStr}/${year}:`, err.message);
            }
        }

        // Move to the next month
        currentDate.setMonth(currentDate.getMonth() + 1);

        // Add a 4-second polite delay between month requests
        if (currentDate <= today) {
            console.log("Waiting 4 seconds before next month...\n");
            await sleep(4000);
        }
    }

    await browser.close();
    console.log(`\nScraping complete! All images organized and cleaned inside '${OUTPUT_DIR}/'.`);
}

scrape().catch(err => {
    console.error("Scraping workflow failed:", err);
    process.exit(1);
});
