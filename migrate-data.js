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

    // 1. Clean submissions by stripping "91›" or character counts if present
    const sourceSubmissions = data.submissions || data.codes || [];
    const cleanedSubmissions = sourceSubmissions.map(submission => {
      if (typeof submission === 'string') {
        return submission.replace(/^\d+›\s*/, '');
      }
      return submission;
    });

    // 2. Ensure "target" image URL property exists (default to empty string if missing)
    const targetImage = data.target !== undefined ? data.target : '';

    // 3. Ensure "colors" property exists (default to empty array if missing)
    const colorsList = Array.isArray(data.colors) ? data.colors : [];

    // Construct the updated schema object
    const updatedData = {
      date: data.date || '',
      target: targetImage,
      colors: colorsList,
      submissions: cleanedSubmissions
    };

    // Write back the updated JSON structure with 2-space formatting
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
    console.log(`Updated: ${file}`);
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});

console.log('Migration completed successfully.');
