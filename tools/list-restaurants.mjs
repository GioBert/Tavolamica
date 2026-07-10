import fs from "node:fs/promises";
import process from "node:process";

const value = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

async function localEnv() {
  try {
    const content = await fs.readFile(".env", "utf8");
    return Object.fromEntries(content.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      return match ? [[match[1], match[2].replace(/^(["'])(.*)\1$/, "$2")]] : [];
    }));
  } catch {
    return {};
  }
}

const env = { ...(await localEnv()), ...process.env };
const baseUrl = value("--base-url", env.TAVOLAMICA_SERVICE_URL || "http://127.0.0.1:8097");
const apiKey = env.TAVOLAMICA_API_KEY || "";
const jsonOutput = process.argv.includes("--json");
const refresh = process.argv.includes("--refresh");
if (!apiKey) throw new Error("TAVOLAMICA_API_KEY non configurata");

const url = new URL("/api/v1/restaurants", baseUrl);
if (refresh) url.searchParams.set("refresh", "1");
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${apiKey}` },
  signal: AbortSignal.timeout(30_000)
});
const payload = await response.json();
if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

if (jsonOutput) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Ristoranti disponibili: ${payload.restaurants.length} · aggiornati: ${payload.fetchedAt}`);
  console.table(payload.restaurants.map((restaurant) => ({
    codice: restaurant.code,
    ristorante: restaurant.name,
    citta: restaurant.city,
    provincia: restaurant.province
  })));
  console.log(`Codice predefinito account: ${payload.defaultRestaurantCode || "nessuno"}`);
}
