import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parse } from "node-html-parser";
import markdownIt from "markdown-it";
import markdownItMark from "markdown-it-mark";
import markdownItFootnote from "markdown-it-footnote";
import markdownItAttrs from "markdown-it-attrs";
import markdownItTaskCheckbox from "markdown-it-task-checkbox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CSS_DIR = path.resolve(REPO_ROOT, "src/site/styles/user");
const NOTES_DIR = path.resolve(REPO_ROOT, "src/site/notes");
const ASSETS_DIR = path.resolve(REPO_ROOT, "src/site/img");
const SOURCE_NOTE = "index.md";
const OUTPUT_PDF = path.resolve(
  REPO_ROOT,
  "src/site/img/user/assets",
  SOURCE_NOTE.replace(/\.md$/, ".pdf")
);

function stripFrontmatter(content) {
  return content.replace(/^---[\s\S]*?---\n*/m, "");
}

function stripTransclusionWrappers(content) {
  content = content.replace(/<div\s+class="transclusion[^"]*"[^>]*>/g, "");
  content = content.replace(/<div\s+class="markdown-embed"[^>]*>/g, "");
  content = content.replace(/<\/div>\s*<\/div>/g, "");
  return content;
}

function embedImagesAsBase64(content) {
  const imageExt = /\.(png|jpg|jpeg|gif|svg|webp)$/i;
  return content.replace(
    /\]\(\/img\/user\/assets\/([^"')\]>\s]+)\)/g,
    (match, filename) => {
      if (!imageExt.test(filename)) return match;
      const absPath = path.join(ASSETS_DIR, "user/assets", filename);
      if (!fs.existsSync(absPath)) return match;
      const ext = path.extname(filename).slice(1).replace("jpg", "jpeg");
      const data = fs.readFileSync(absPath).toString("base64");
      return `](data:image/${ext};base64,${data})`;
    }
  );
}

function createMarkdownIt() {
  return markdownIt({ breaks: true, html: true, linkify: true })
    .use(markdownItMark)
    .use(markdownItFootnote)
    .use(markdownItAttrs)
    .use(markdownItTaskCheckbox, {
      disabled: true,
      divWrap: false,
      divClass: "checkbox",
      idPrefix: "cbx_",
      ulClass: "task-list",
      liClass: "task-list-item",
    });
}

const calloutMeta = /\[!([\w-]*)\|?(\s?.*)\](\+|\-){0,1}(\s?.*)/;

function transformCalloutBlockquotes(blockquotes) {
  for (const blockquote of blockquotes) {
    transformCalloutBlockquotes(blockquote.querySelectorAll("blockquote"));

    let content = blockquote.innerHTML;
    let titleDiv = "";
    let calloutType = "";
    let calloutMetaData = "";
    let isCollapsable;
    let isCollapsed;

    if (!content.match(calloutMeta)) continue;

    content = content.replace(calloutMeta, (metaInfoMatch, callout, metaData, collapse, title) => {
      isCollapsable = Boolean(collapse);
      isCollapsed = collapse === "-";
      const titleText = title.replace(/(<\/{0,1}\w+>)/, "")
        ? title
        : `${callout.charAt(0).toUpperCase()}${callout.substring(1).toLowerCase()}`;
      const fold = isCollapsable
        ? `<div class="callout-fold"><i icon-name="chevron-down"></i></div>`
        : "";
      calloutType = callout;
      calloutMetaData = metaData;
      titleDiv = `<div class="callout-title"><div class="callout-title-inner">${titleText}</div>${fold}</div>`;
      return "";
    });

    if (content === "\n<p>\n") content = "";
    let contentDiv = content ? `\n<div class="callout-content">${content}</div>` : "";

    blockquote.tagName = "div";
    blockquote.classList.add("callout");
    blockquote.classList.add(isCollapsable ? "is-collapsible" : "");
    blockquote.classList.add(isCollapsed ? "is-collapsed" : "");
    blockquote.setAttribute("data-callout", calloutType.toLowerCase());
    if (calloutMetaData) blockquote.setAttribute("data-callout-metadata", calloutMetaData);
    blockquote.innerHTML = `${titleDiv}${contentDiv}`;
  }
}

function transformCallouts(html) {
  const parsed = parse(html);
  transformCalloutBlockquotes(parsed.querySelectorAll("blockquote"));
  return parsed.innerHTML;
}

function buildHtml(bodyHtml) {
  const cssFiles = fs.readdirSync(CSS_DIR).filter(f => f.endsWith(".css"));
  let styles = "";
  for (const file of cssFiles) {
    styles += fs.readFileSync(path.join(CSS_DIR, file), "utf-8") + "\n";
  }

  styles += `
.callout {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  display: block;
  font-size: 1rem;
  padding: var(--callout-padding, 1rem);
  border-left: 2px solid var(--callout-color, #888);
  background: var(--callout-background, transparent);
}
.callout-title {
  margin-top: 0;
  align-items: center;
  display: flex;
  gap: 0.5rem;
}
.callout-title-inner, .callout-icon, .callout-fold, .callout-content {
  margin: 0;
  padding: 0;
}
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${styles}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function renderPdf(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({
    path: OUTPUT_PDF,
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
  });
  await browser.close();
}

async function main() {
  const indexPath = path.join(NOTES_DIR, SOURCE_NOTE);
  if (!fs.existsSync(indexPath)) {
    console.error(`index.md not found at ${indexPath}`);
    process.exit(1);
  }

  let content = fs.readFileSync(indexPath, "utf-8");
  content = stripFrontmatter(content);
  content = stripTransclusionWrappers(content);
  content = embedImagesAsBase64(content);

  const md = createMarkdownIt();
  let html = md.render(content);
  html = transformCallouts(html);
  const fullHtml = buildHtml(html);
  await renderPdf(fullHtml);

  console.log(`PDF generated: ${OUTPUT_PDF}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
