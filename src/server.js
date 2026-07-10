import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePdfBrowser, menuPdfFilename, pdfEtag, renderMenuPdf } from "./pdf.js";
import { TavolamicaClient, dateOffset, italyToday, menuAsText } from "./tavolamica.js";

const config = {
  port: Number(process.env.PORT || 8097),
  checksumSeed: process.env.TAVOLAMICA_CHECKSUM_SEED || "",
  appToken: process.env.TAVOLAMICA_APP_TOKEN || "",
  email: process.env.TAVOLAMICA_EMAIL || "",
  password: process.env.TAVOLAMICA_PASSWORD || "",
  apiKey: process.env.TAVOLAMICA_API_KEY || "",
  cacheDir: path.resolve(process.env.TAVOLAMICA_CACHE_DIR || ".cache/tavolamica"),
  cacheTtlMs: Math.max(60_000, Number(process.env.TAVOLAMICA_CACHE_TTL_SECONDS || 900) * 1000),
  usersBaseUrl: process.env.TAVOLAMICA_USERS_BASE_URL || "https://users.tavolamica.it/",
  menuBaseUrl: process.env.TAVOLAMICA_MENU_BASE_URL || "https://mmta.tavolamica.it/"
};

const client = new TavolamicaClient(config);
const sessions = new Map();
let serviceSession = null;
const menuCache = new Map();
const pdfJobs = new Map();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function json(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(data);
}

function error(res, status, message) {
  json(res, status, { error: message });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new Error("Richiesta troppo grande");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function cookieSession(req) {
  const value = (req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith("tm_session="));
  return value ? sessions.get(value.slice("tm_session=".length)) : null;
}

async function enrichSession(auth) {
  const restaurants = await client.restaurants(auth.clientCode);
  return { ...auth, restaurants, createdAt: Date.now() };
}

async function getServiceSession(force = false) {
  if (!force && serviceSession && Date.now() - serviceSession.createdAt < 30 * 60_000) return serviceSession;
  if (!config.email || !config.password) throw new Error("Credenziali server non configurate");
  serviceSession = await enrichSession(await client.login(config.email, config.password));
  return serviceSession;
}

function bearerAllowed(req) {
  if (!config.apiKey) return false;
  const supplied = Buffer.from((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(config.apiKey);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function selectRestaurant(session, code) {
  return session.restaurants.find((item) => item.code === code);
}

async function serviceMenu(url) {
  const session = await getServiceSession();
  const restaurantCode = url.searchParams.get("restaurantCode");
  if (!restaurantCode) throw Object.assign(new Error("restaurantCode obbligatorio"), { statusCode: 400 });
  const restaurant = selectRestaurant(session, restaurantCode);
  if (!restaurant) throw Object.assign(new Error("Ristorante non disponibile per questo account"), { statusCode: 404 });
  const date = url.searchParams.get("date") || italyToday();
  try {
    dateOffset(date);
  } catch {
    throw Object.assign(new Error("Data non valida: usare YYYY-MM-DD"), { statusCode: 422 });
  }
  const key = `${restaurant.code}:${date}`;
  const cached = menuCache.get(key);
  if (cached && Date.now() - cached.createdAt < config.cacheTtlMs) return { ...cached, cache: "HIT" };
  const menu = await client.menu(restaurant, date);
  const entry = { key, menu, createdAt: Date.now() };
  menuCache.set(key, entry);
  return { ...entry, cache: "MISS" };
}

async function cachedPdf(entry) {
  const safeKey = entry.key.replace(/[^a-zA-Z0-9_-]/g, "-");
  const filename = path.join(config.cacheDir, `${safeKey}.pdf`);
  try {
    const stat = await fs.stat(filename);
    if (Date.now() - stat.mtimeMs < config.cacheTtlMs) {
      return { buffer: await fs.readFile(filename), cache: "HIT" };
    }
  } catch (caught) {
    if (caught?.code !== "ENOENT") throw caught;
  }
  if (!pdfJobs.has(entry.key)) {
    pdfJobs.set(entry.key, (async () => {
      const buffer = await renderMenuPdf(entry.menu);
      await fs.mkdir(config.cacheDir, { recursive: true });
      const temporary = `${filename}.${process.pid}.tmp`;
      await fs.writeFile(temporary, buffer);
      await fs.rename(temporary, filename);
      return buffer;
    })().finally(() => pdfJobs.delete(entry.key)));
  }
  return { buffer: await pdfJobs.get(entry.key), cache: "MISS" };
}

function sendPdf(req, res, menu, buffer, cache) {
  const etag = pdfEtag(buffer);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": "private, max-age=300" });
    return res.end();
  }
  const filename = menuPdfFilename(menu);
  res.writeHead(200, {
    "content-type": "application/pdf",
    "content-length": buffer.length,
    "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "private, max-age=300",
    etag,
    "x-tavolamica-restaurant-code": menu.restaurant.code,
    "x-tavolamica-menu-date": menu.menuDate,
    "x-tavolamica-cache": cache
  });
  res.end(buffer);
}

async function serveStatic(req, res, pathname) {
  const names = { "/": "index.html", "/app.js": "app.js", "/styles.css": "styles.css" };
  const name = names[pathname];
  if (!name) return false;
  const type = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript";
  const body = await fs.readFile(path.join(publicDir, name));
  res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
  res.end(body);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { status: "ok", configured: Boolean(config.checksumSeed) });
    }
    if (req.method === "GET" && url.pathname === "/api/session") {
      const session = cookieSession(req);
      return json(res, 200, {
        authenticated: Boolean(session),
        displayName: session?.displayName || null
      });
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      if (!config.checksumSeed) return error(res, 503, "Checksum seed non configurato");
      const { email, password } = await readJson(req);
      if (!email || !password) return error(res, 400, "Email e password obbligatorie");
      const session = await enrichSession(await client.login(String(email), String(password)));
      const id = crypto.randomBytes(32).toString("base64url");
      sessions.set(id, session);
      res.setHeader("set-cookie", `tm_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
      return json(res, 200, { displayName: session.displayName, defaultRestaurantCode: session.defaultRestaurantCode });
    }
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const raw = (req.headers.cookie || "").match(/(?:^|;\s*)tm_session=([^;]+)/)?.[1];
      if (raw) sessions.delete(raw);
      res.setHeader("set-cookie", "tm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/restaurants") {
      const session = cookieSession(req);
      if (!session) return error(res, 401, "Sessione assente");
      return json(res, 200, { restaurants: session.restaurants, defaultRestaurantCode: session.defaultRestaurantCode });
    }
    if (req.method === "GET" && url.pathname === "/api/menu") {
      const session = cookieSession(req);
      if (!session) return error(res, 401, "Sessione assente");
      const restaurant = selectRestaurant(session, url.searchParams.get("restaurantCode"));
      if (!restaurant) return error(res, 404, "Ristorante non disponibile per questo account");
      return json(res, 200, await client.menu(restaurant, url.searchParams.get("date") || italyToday()));
    }
    if (req.method === "GET" && url.pathname === "/api/v1/restaurants") {
      if (!bearerAllowed(req)) return error(res, 401, "API key non valida");
      const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
      const session = await getServiceSession(refresh);
      return json(res, 200, {
        restaurants: session.restaurants,
        defaultRestaurantCode: session.defaultRestaurantCode,
        fetchedAt: new Date(session.createdAt).toISOString()
      });
    }
    if (req.method === "GET" && ["/api/v1/menu", "/api/v1/menu.txt", "/api/v1/menu.pdf"].includes(url.pathname)) {
      if (!bearerAllowed(req)) return error(res, 401, "API key non valida");
      const entry = await serviceMenu(url);
      const menu = entry.menu;
      if (url.pathname.endsWith(".pdf")) {
        const pdf = await cachedPdf(entry);
        return sendPdf(req, res, menu, pdf.buffer, pdf.cache);
      }
      if (url.pathname.endsWith(".txt")) {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        return res.end(menuAsText(menu));
      }
      return json(res, 200, menu);
    }
    if (req.method === "GET" && await serveStatic(req, res, url.pathname)) return;
    error(res, 404, "Risorsa non trovata");
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : caught);
    error(res, Number(caught?.statusCode) || 502, caught instanceof Error ? caught.message : "Errore inatteso");
  }
});

const cleanup = setInterval(() => {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, session] of sessions) if (session.createdAt < cutoff) sessions.delete(id);
}, 15 * 60_000);
cleanup.unref();

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Tavolamica Menu in ascolto sulla porta ${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await closePdfBrowser().catch(() => {});
    server.close(() => process.exit(0));
  });
}
