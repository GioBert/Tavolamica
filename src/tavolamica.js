import crypto from "node:crypto";

export const PROJECT_CODE = "0001";

export function checksum(seed, ...parts) {
  if (!seed) throw new Error("TAVOLAMICA_CHECKSUM_SEED non configurato");
  return crypto.createHash("md5").update(seed + parts.join(""), "utf8").digest("hex");
}

export function italyToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function civilDay(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error("Data non valida: usare YYYY-MM-DD");
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = Date.UTC(year, month - 1, day);
  const checked = new Date(value);
  if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) {
    throw new Error("Data non valida");
  }
  return value / 86_400_000;
}

export function dateOffset(isoDate, today = italyToday()) {
  return civilDay(isoDate) - civilDay(today);
}

export function normalizeRestaurants(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object") return [];
  return Object.values(data)
    .filter(Boolean)
    .map((item) => ({
      code: String(item.code ?? ""),
      name: String(item.title ?? item.name ?? ""),
      address: String(item.address ?? ""),
      city: String(item.city ?? ""),
      province: String(item.state ?? item.province ?? ""),
      postalCode: String(item.post_code ?? item.postCode ?? ""),
      phone: String(item.phone ?? item.telephone ?? "")
    }))
    .filter((item) => item.code && item.name)
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function findMenuElement(data, isoDate) {
  if (!data || typeof data !== "object") return null;
  if (data[isoDate]) return data[isoDate];
  return Object.values(data).find((item) => item?.menu_date === isoDate) ?? Object.values(data)[0] ?? null;
}

export function categoryRank(name) {
  const value = String(name).toLocaleLowerCase("it");
  if (value.includes("antipast")) return 0;
  if (value.includes("prim")) return 1;
  if (value.includes("second") || value.includes("piatt") || value.includes("unico")) return 2;
  if (value.includes("contorn")) return 3;
  if (value.includes("dessert") || value.includes("dolc") || value.includes("frutta")) return 4;
  return 5;
}

export function normalizeMenu(payload, restaurant, isoDate) {
  const element = findMenuElement(payload?.data, isoDate);
  const rawPlates = element?.plates && typeof element.plates === "object" ? Object.values(element.plates) : [];
  const dishes = rawPlates.filter(Boolean).map((plate) => ({
    id: String(plate.id ?? ""),
    code: String(plate.code ?? ""),
    name: String(plate.title ?? ""),
    category: String(plate.category ?? "Altro"),
    subcategory: String(plate.sub_category ?? ""),
    price: Number.isFinite(Number(plate.price)) ? Number(plate.price) : null,
    calories: String(plate.calories ?? ""),
    caloriesUnit: String(plate.calories_unit_of_measure ?? ""),
    allergens: Array.isArray(plate.allergens2) ? plate.allergens2 : [],
    allergensText: String(plate.allergens ?? ""),
    note: String(plate.note ?? ""),
    dishOfTheDay: String(plate.plate_of_the_day ?? "") === "1"
  }));

  const categories = Object.values(Object.groupBy(dishes, (dish) => dish.category || "Altro"))
    .map((items) => ({ name: items[0]?.category || "Altro", dishes: items }))
    .sort((a, b) => categoryRank(a.name) - categoryRank(b.name) || a.name.localeCompare(b.name, "it"));

  return {
    schemaVersion: 1,
    provider: "Tavolamica",
    restaurant,
    requestedDate: isoDate,
    menuDate: String(element?.menu_date ?? isoDate),
    categories,
    dishes,
    fetchedAt: new Date().toISOString()
  };
}

export function menuAsText(menu) {
  const lines = [`🍽️ ${menu.restaurant.name}`, `📅 ${menu.menuDate}`, ""];
  for (const category of menu.categories) {
    lines.push(category.name.toUpperCase());
    for (const dish of category.dishes) {
      const details = [];
      if (dish.price !== null && dish.price > 0) details.push(`€ ${dish.price.toFixed(2).replace(".", ",")}`);
      if (dish.calories) details.push(`${dish.calories}${dish.caloriesUnit ? ` ${dish.caloriesUnit}` : ""}`);
      lines.push(`• ${dish.name}${details.length ? ` — ${details.join(" · ")}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

async function parseResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Risposta Tavolamica non valida (${response.status})`);
  }
  if (!response.ok || payload?.success === "KO") {
    throw new Error(payload?.exception || payload?.error || `Errore Tavolamica (${response.status})`);
  }
  return payload;
}

export class TavolamicaClient {
  constructor({ checksumSeed, appToken, usersBaseUrl, menuBaseUrl }) {
    this.seed = checksumSeed;
    this.appToken = appToken;
    this.usersBaseUrl = new URL(usersBaseUrl);
    this.menuBaseUrl = new URL(menuBaseUrl);
  }

  async login(email, password) {
    const body = new URLSearchParams({ email, password, project_code: PROJECT_CODE });
    const response = await fetch(new URL("api/login", this.usersBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        ...(this.appToken ? { Token: this.appToken } : {})
      },
      body,
      signal: AbortSignal.timeout(20_000)
    });
    const payload = await parseResponse(response);
    const user = payload?.user;
    if (!user?.client_code) throw new Error(payload?.error || "Login non valido o clientCode assente");
    return {
      clientCode: String(user.client_code),
      defaultRestaurantCode: String(user.shop_id ?? ""),
      displayName: String(user.name ?? user.first_name ?? email)
    };
  }

  async restaurants(clientCode) {
    const form = new FormData();
    form.set("clientCode", clientCode);
    form.set("code", checksum(this.seed, clientCode));
    const response = await fetch(new URL("downloadRestaurantData", this.menuBaseUrl), {
      method: "POST",
      headers: this.appToken ? { Token: this.appToken } : {},
      body: form,
      signal: AbortSignal.timeout(20_000)
    });
    return normalizeRestaurants(await parseResponse(response));
  }

  async menu(restaurant, isoDate, today) {
    const offset = String(dateOffset(isoDate, today));
    const form = new FormData();
    form.set("restaurantCode", restaurant.code);
    form.set("date", offset);
    form.set("code", checksum(this.seed, restaurant.code, offset));
    const response = await fetch(new URL("downloadData", this.menuBaseUrl), {
      method: "POST",
      headers: this.appToken ? { Token: this.appToken } : {},
      body: form,
      signal: AbortSignal.timeout(20_000)
    });
    return normalizeMenu(await parseResponse(response), restaurant, isoDate);
  }
}
