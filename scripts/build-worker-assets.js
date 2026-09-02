const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const notesDir = path.join(__dirname, '../src/site/notes/pdf');
const outputFile = path.join(__dirname, '../worker/src/assets/pdfSources.js');

let buildHash = 'dev';
try {
  buildHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {}

const sources = {};

if (fs.existsSync(notesDir)) {
  const files = fs.readdirSync(notesDir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
      // Key can be path mapping e.g. /img/user/assets/index.pdf or filename
        const key = '/' + file.replace('.md', '');
      sources[key] = content;
      sources['/img/user/assets/' + file.replace('.md', '.pdf')] = content;
    }
  }
}

// Alias index.pdf to the first available source (used as main CV download link)
const firstKey = '/img/user/assets/' + Object.keys(sources).find(k => k.startsWith('/img/user/assets/'))?.split('/').pop();
if (firstKey && !sources['/img/user/assets/index.pdf']) {
  const firstContent = sources[firstKey];
  sources['/img/user/assets/index.pdf'] = firstContent;
}

// Fallback if empty
if (Object.keys(sources).length === 0) {
  sources['/img/user/assets/index.pdf'] = '# Default CV\n\nNo markdown found.';
}

const fileContent = `// Auto-generated build asset
export const BUILD_HASH = "${buildHash}";
export const PDF_SOURCES = ${JSON.stringify(sources, null, 2)};
`;

fs.writeFileSync(outputFile, fileContent, 'utf8');
console.log(`Generated worker assets with build hash ${buildHash}`);
