import crypto from "node:crypto";
import { chromium } from "playwright";

let browserPromise = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function filenamePart(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_*-_*/g, "-")
    .replace(/_+/g, "_");
}

export function italianDateForFilename(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Data menu non valida");
  return filenamePart(new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date));
}

export function menuPdfFilename(menu) {
  return ["Menu", filenamePart(menu.restaurant.name), italianDateForFilename(menu.menuDate)].join("_") + ".pdf";
}

export function menuPdfHtml(menu) {
  const categories = menu.categories.map((category) => `
    <section class="category">
      <h2>${escapeHtml(category.name)}</h2>
      ${category.dishes.map((dish) => {
        const meta = [
          dish.price > 0 ? `€ ${dish.price.toFixed(2).replace(".", ",")}` : "",
          dish.calories ? `${dish.calories} ${dish.caloriesUnit || ""}`.trim() : ""
        ].filter(Boolean).join(" · ");
        return `<div class="dish"><div><h3>${escapeHtml(dish.name)}</h3>${dish.subcategory ? `<p>${escapeHtml(dish.subcategory)}</p>` : ""}</div><strong>${escapeHtml(meta)}</strong></div>`;
      }).join("")}
    </section>`).join("");

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${escapeHtml(menuPdfFilename(menu))}</title>
<style>
  *{box-sizing:border-box} body{margin:0;color:#111;font:8.5pt/1.14 Arial,sans-serif}
  header{display:grid;grid-template-columns:1fr auto;align-items:end;padding-bottom:2mm;border-bottom:.6mm solid #111;column-span:all}
  header p{grid-column:1/-1;margin:0 0 1mm;color:#b65d35;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  header h1{margin:0;font:700 15pt/1.05 Georgia,serif} header time{font-weight:700}
  main{columns:2;column-gap:7mm} .category{break-inside:avoid;padding:1.2mm 0;border-bottom:.2mm solid #aaa}
  h2{margin:0 0 .6mm;font-size:8.5pt;letter-spacing:.04em;text-transform:uppercase}
  .dish{display:flex;justify-content:space-between;gap:3mm;padding:.35mm 0;border-bottom:.15mm dotted #aaa;break-inside:avoid}
  .dish h3,.dish p{margin:0}.dish h3{font-size:7.8pt}.dish p{color:#444;font-size:6.8pt}.dish strong{white-space:nowrap;font-size:7.5pt}
  @page{size:A4 portrait;margin:9mm 9mm 17mm;@bottom-center{content:"Progetto indipendente e non ufficiale, realizzato senza finalità commerciali per offrire ai clienti una consultazione rapida e pratica dei menu resi disponibili dal servizio Tavolamica. Marchi, contenuti e servizi appartengono ai rispettivi titolari.\\A © 2026 Giovanni Bertozzi · GioBert on GitHub · Sorgente: github.com/GioBert/Tavolamica (AGPL-3.0-or-later)";padding-top:1.5mm;border-top:.2mm solid #aaa;color:#222;font:6.3pt/1.15 Arial,sans-serif;white-space:pre-wrap}}
</style></head><body>
<header><p>${escapeHtml(menu.restaurant.address || "Menu del giorno")}</p><h1>${escapeHtml(menu.restaurant.name)}</h1><time>${escapeHtml(menu.menuDate)}</time></header>
<main>${categories}</main></body></html>`;
}

async function getBrowser() {
  if (!browserPromise) {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
    const args = process.env.PLAYWRIGHT_DISABLE_SANDBOX === "1" ? ["--no-sandbox"] : [];
    browserPromise = chromium.launch({ headless: true, executablePath, args }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export async function renderMenuPdf(menu) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(menuPdfHtml(menu), { waitUntil: "load" });
    return await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  } finally {
    await page.close();
  }
}

export function pdfEtag(buffer) {
  return `"${crypto.createHash("sha256").update(buffer).digest("hex")}"`;
}

export async function closePdfBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close();
}
