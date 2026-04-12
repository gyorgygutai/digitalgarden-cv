
const puppeteer = require("puppeteer");
const path = require("path");
const __dirname = __dirname || path.resolve();

(async () => {
  const htmlPath = path.resolve(__dirname, "../docs/index.html");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.goto(`file://${htmlPath}`, {
    waitUntil: "networkidle2",
  });

  await page.addStyleTag({
    path: path.resolve(__dirname, "../docs/assets/print.css"),
  });

  await page.screenshot({
    path: path.resolve(__dirname, "../docs/cv_gyorgy_gutai.png"),
    fullPage: true,
  });
  await browser.close();
})();
