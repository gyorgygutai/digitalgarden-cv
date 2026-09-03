const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const notesDir = path.join(__dirname, '../src/site/notes/pdf');
const outputFile = path.join(__dirname, '../worker/src/assets/pdfSources.js');

let buildHash = 'dev';
try {
  buildHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {}

function preprocessObsidianMarkdown(raw) {
  let md = raw;

  // 1. Strip frontmatter ---...---
  md = md.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // 2. Strip HTML comments
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Extract inner content from transclusion divs and replace with content
  // <div class="transclusion...><div class="markdown-embed">BLOCKQUOTE CONTENT</div></div>
  md = md.replace(
    /<div class="transclusion[^>]*>[\s\S]*?<div class="markdown-embed">\s*([\s\S]*?)\s*<\/div>\s*<\/div>/gi,
    (_, inner) => {
      // inner is the blockquote content - return it as-is, it will be processed below
      return inner.trim();
    }
  );

  // 4. Strip callout markers > [!callout-type] but keep the content
  md = md.replace(/^>\s*\[![^\]]+\]\s*$/gm, '');  // remove empty callout marker lines
  md = md.replace(/^>\s*\[![^\]]+\]\s*/gm, '');   // remove callout marker from start of line

  // 5. Strip image embeds inside blockquotes > ![alt](url) and wikilinks > ![alt]([[...]])
  md = md.replace(/^>\s*!\[[^\]]*\]\([^)]+\)/gm, '');
  md = md.replace(/^>\s*!\[\[[^\]]+\]\]/gm, '');

  // 6. Clean up blockquoted headings - remove > prefix from heading lines
  md = md.replace(/^>\s*(#\s+.*)$/gm, '$1');

  // 7. Remove > from all remaining blockquote lines (non-heading)
  md = md.replace(/^>\s*(?!$)(.*)$/gm, '$1');

  // 8. Clean up remaining > that are now on empty lines
  md = md.replace(/^>\s*$/gm, '');

  // 8. Strip remaining embeds outside blockquotes ![[...]]
  md = md.replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '');

  // 9. Convert wikilinks [[Link]] or [[Link|Text]] to plain text
  md = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, display) => display || link);

  // 10. Strip remaining HTML tags, preserve newlines for block-level ones
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<[^>]+>/g, '');

  // 11. Clean up multiple blank lines
  md = md.replace(/\n{3,}/g, '\n\n');

  // 12. Trim each line
  md = md.split('\n').map(line => line.trim()).join('\n');

  // 13. Remove leading/trailing blank lines
  md = md.replace(/^\n+/, '').replace(/\n+$/, '');

  return md;
}

const sources = {};

if (fs.existsSync(notesDir)) {
  const files = fs.readdirSync(notesDir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const raw = fs.readFileSync(path.join(notesDir, file), 'utf8');
      const cleaned = preprocessObsidianMarkdown(raw);

      const baseKey = '/' + file.replace('.md', '');
      sources[baseKey] = cleaned;
      sources['/img/user/assets/' + file.replace('.md', '.pdf')] = cleaned;
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

const fileContent = `// Auto-generated build asset\nexport const BUILD_HASH = "${buildHash}";\nexport const PDF_SOURCES = ${JSON.stringify(sources, null, 2)};\n`;

fs.writeFileSync(outputFile, fileContent, 'utf8');
console.log(`Generated worker assets with build hash ${buildHash}`);
