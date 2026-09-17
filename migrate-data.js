const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  console.log('No data directory found.');
  process.exit(0);
}

// Read all JSON files in the data directory
const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));

console.log(`Found ${files.length} file(s) to process...`);

files.forEach(file => {
  const filePath = path.join(dataDir, file);
  
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawContent);

    // 1. Clean submissions by stripping character count markers (e.g. "91›")
    const sourceSubmissions = data.submissions || data.codes || [];
    const cleanedSubmissions = sourceSubmissions.map(submission => {
      if (typeof submission === 'string') {
        return submission.replace(/^\d+›\s*/, '');
      }
      return submission;
    });

    // 2. Extract colors directly from the cleaned submission code
    const hexRegex = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
    const extractedColorsSet = new Set();

    // Preserve any existing valid colors in the file first
    if (Array.isArray(data.colors)) {
      data.colors.forEach(c => {
        if (typeof c === 'string' && c.startsWith('#')) {
          extractedColorsSet.add(c.toUpperCase());
        }
      });
    }

    // Extract hex codes from all submission strings
    cleanedSubmissions.forEach(code => {
      if (typeof code === 'string') {
        const matches = code.match(hexRegex);
        if (matches) {
          matches.forEach(color => extractedColorsSet.add(color.toUpperCase()));
        }
      }
    });

    // 3. Ensure target image URL property exists (default to empty string if missing)
    const targetImage = data.target !== undefined ? data.target : '';

    // Construct the updated schema object
    const updatedData = {
      date: data.date || '',
      target: targetImage,
      colors: Array.from(extractedColorsSet),
      submissions: cleanedSubmissions
    };

    // Write back the updated JSON structure with 2-space formatting
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
    console.log(`Updated ${file}: Extracted ${updatedData.colors.length} color(s).`);
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});

console.log('Migration completed successfully.');
