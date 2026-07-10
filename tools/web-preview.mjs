import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";

const args = new Set(process.argv.slice(2));
const value = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const url = value("--url", "http://127.0.0.1:8097/");
const outputDir = path.resolve(value("--output", "artifacts/browser"));
const mobile = args.has("--mobile");
const headed = args.has("--headed");
const authenticated = args.has("--authenticated");
const createPdf = args.has("--pdf");
const restaurantCode = value("--restaurant", "");
const menuDate = value("--date", "");
const stressPages = Math.max(1, Number(value("--stress-pages", "1")) || 1);
const profile = mobile ? "mobile" : "desktop";

async function readEnv(filename) {
  const result = {};
  const content = await fs.readFile(filename, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return result;
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext(mobile ? devices["Pixel 7"] : {
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "senza risposta"} per ${url}`);

  if (authenticated && await page.locator("#login-panel:not(.hidden)").count()) {
    const env = await readEnv(path.resolve(".env"));
    if (!env.TAVOLAMICA_EMAIL || !env.TAVOLAMICA_PASSWORD) {
      throw new Error("Credenziali TAVOLAMICA_EMAIL/TAVOLAMICA_PASSWORD assenti da .env");
    }
    await page.locator("#email").fill(env.TAVOLAMICA_EMAIL);
    await page.locator("#password").fill(env.TAVOLAMICA_PASSWORD);
    await Promise.all([
      page.locator("#menu-panel:not(.hidden)").waitFor({ timeout: 30_000 }),
      page.locator("#login-form button[type=submit]").click()
    ]);
    await page.locator(".category").first().waitFor({ timeout: 30_000 });
  }

  if (restaurantCode || menuDate) {
    if (restaurantCode) await page.locator("#restaurant").selectOption(restaurantCode);
    if (menuDate) await page.locator("#date").fill(menuDate);
    await Promise.all([
      page.waitForResponse((candidate) => candidate.url().includes("/api/menu?") && candidate.ok()),
      page.locator("#load-menu").click()
    ]);
    await page.locator(".category").first().waitFor({ timeout: 30_000 });
  }

  const screenshot = path.join(outputDir, `${profile}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  if (createPdf && !mobile) {
    if (stressPages > 1) {
      await page.locator("#menu").evaluate((menu, copies) => {
        const categories = [...menu.querySelectorAll(":scope > .category")];
        for (let copy = 1; copy < copies; copy += 1) {
          for (const category of categories) menu.append(category.cloneNode(true));
        }
      }, stressPages);
    }
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: path.join(outputDir, stressPages > 1 ? "menu-print-stress.pdf" : "menu-print.pdf"),
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    url: page.url(),
    title: await page.title(),
    viewport: page.viewportSize(),
    authenticated,
    categories: await page.locator(".category h3").allTextContents(),
    consoleErrors,
    pageErrors,
    screenshot
  };
  await fs.writeFile(path.join(outputDir, `${profile}.json`), JSON.stringify({
    ...report,
    visibleText: (await page.locator("body").innerText()).slice(0, 20_000)
  }, null, 2));
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  if (consoleErrors.length || pageErrors.length) process.exitCode = 1;
} finally {
  if (headed) {
    console.log("Browser aperto. Premi Ctrl+C per chiuderlo.");
    await new Promise((resolve) => process.once("SIGINT", resolve));
  }
  await browser.close();
}
