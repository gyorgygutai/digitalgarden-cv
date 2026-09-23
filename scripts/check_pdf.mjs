import fs from "fs";
import path from "path";

const PDF_DIR = path.resolve(process.cwd(), "src/site");
const PDF_SOURCE_DIR = path.resolve(process.cwd(), "src/site/notes/pdf");
const ASSETS_DIR = path.resolve(process.cwd(), "src/site/img/user/assets");
const MIN_SIZE = 1024;
const MAX_PAGES = 3;

function check_pdf_exists(pdfPath) {
  return fs.existsSync(pdfPath) && fs.statSync(pdfPath).isFile();
}

function check_pdf_has_size(pdfPath) {
  return fs.existsSync(pdfPath) && fs.statSync(pdfPath).size >= MIN_SIZE;
}

function check_pdf_has_lt_3_pages(pdfPath) {
  const text = fs.readFileSync(pdfPath, "latin1");
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
  return counts.length > 0 ? Math.max(...counts) <= MAX_PAGES : true;
}

function check_pdf_has_image(pdfPath, pdfName) {
  const mdPath = path.join(PDF_SOURCE_DIR, `${pdfName}.md`);
  if (!fs.existsSync(mdPath)) return true;
  const md = fs.readFileSync(mdPath, "utf-8");
  const refs = md.match(/!\[[^\]]*\]\(\/img\/user\/assets\/([^)]+)\)/g);
  if (!refs || refs.length === 0) return true;
  for (const ref of refs) {
    const match = ref.match(/\/img\/user\/assets\/([^)]+)\)/);
    if (!match || !fs.existsSync(path.join(ASSETS_DIR, match[1]))) return false;
  }
  return true;
}

async function main() {
  const pdfFiles = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf"));
  if (pdfFiles.length === 0) {
    console.log("No PDF files found");
    return;
  }

  for (const file of pdfFiles) {
    const pdfPath = path.join(PDF_DIR, file);
    const pdfName = path.basename(file, ".pdf");

    console.log(`\n📄 ${file}`);

    const r1 = check_pdf_exists(pdfPath);
    console.log(`${r1 ? "✅" : "❌"} check_pdf_exists: ${r1 ? "met" : "failed"}`);

    const r2 = check_pdf_has_size(pdfPath);
    console.log(`${r2 ? "✅" : "❌"} check_pdf_has_size: ${r2 ? "met" : "failed"}`);

    const r3 = check_pdf_has_lt_3_pages(pdfPath);
    console.log(`${r3 ? "✅" : "❌"} check_pdf_has_lt_3_pages: ${r3 ? "met" : "failed"}`);

    const r4 = check_pdf_has_image(pdfPath, pdfName);
    console.log(`${r4 ? "✅" : "❌"} check_pdf_has_image: ${r4 ? "met" : "failed"}`);

    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(0);
});
