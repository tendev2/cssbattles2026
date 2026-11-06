const fs = require('fs');
const path = require('path');

// Set to true to preview changes without saving, or false to overwrite the files
const DRY_RUN = false;

// Path to your data directory containing the JSON files
const dataDir = path.join(__dirname, 'data2');

// Read all files in the data directory
fs.readdir(dataDir, (err, files) => {
    if (err) {
        console.error('Error reading the data directory:', err);
        return;
    }

    files.forEach(file => {
        if (path.extname(file).toLowerCase() === '.json') {
            const filePath = path.join(dataDir, file);

            fs.readFile(filePath, 'utf8', (err, fileContent) => {
                if (err) {
                    console.error(`Error reading file ${file}:`, err);
                    return;
                }

                try {
                    const jsonData = JSON.parse(fileContent);

                    // Combine all strings inside the submissions array into a single searchable text
                    const submissionsText = Array.isArray(jsonData.submissions)
                        ? jsonData.submissions.join(' ')
                        : (jsonData.submissions || '');

                    // Regular expression to match CSS hex colors (3, 4, 6, or 8 digits with #)
                    const hexRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
                    const matches = submissionsText.match(hexRegex) || [];

                    // Normalize colors (convert to uppercase), remove duplicates, and exclude #0000
                    const uniqueColors = [...new Set(matches.map(color => color.toUpperCase()))]
                        .filter(color => color !== '#0000');

                    const oldColors = jsonData.colors || [];

                    console.log(`--- [${DRY_RUN ? 'DRY-RUN MODE' : 'LIVE MODE'}] File: ${file} ---`);
                    console.log('Old colors:', oldColors);
                    console.log('New colors:', uniqueColors);

                    if (DRY_RUN) {
                        console.log('Status: Skipped saving (Dry-run active).\n');
                    } else {
                        // Update the colors array with the correctly extracted colors
                        jsonData.colors = uniqueColors;

                        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
                            if (err) {
                                console.error(`Error writing updated file ${file}:`, err);
                            } else {
                                console.log('Status: Successfully saved changes.\n');
                            }
                        });
                    }

                } catch (parseErr) {
                    console.error(`Error parsing JSON from file ${file}:`, parseErr);
                }
            });
        }
    });
});
