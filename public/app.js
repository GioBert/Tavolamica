const loginPanel = document.querySelector("#login-panel");
const menuPanel = document.querySelector("#menu-panel");
const loginForm = document.querySelector("#login-form");
const restaurantSelect = document.querySelector("#restaurant");
const dateInput = document.querySelector("#date");
const status = document.querySelector("#status");
const menuRoot = document.querySelector("#menu");
const exportsRoot = document.querySelector("#exports");
const preferredRestaurantKey = "tavolamica.preferredRestaurantCode";
const menuViewKey = "tavolamica.menuView";
let currentMenu = null;

dateInput.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

function setMenuView(view) {
  const selected = ["dense", "normal", "wide"].includes(view) ? view : "normal";
  document.body.dataset.view = selected;
  localStorage.setItem(menuViewKey, selected);
  for (const button of document.querySelectorAll(".view-option")) {
    button.classList.toggle("active", button.dataset.view === selected);
    button.setAttribute("aria-pressed", String(button.dataset.view === selected));
  }
}

function filenamePart(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function italianDateForFilename(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return filenamePart(isoDate);
  return filenamePart(new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date));
}

function printTitle(menu) {
  if (!menu) return "Menu_Tavolamica";
  const restaurant = filenamePart(menu.restaurant.name);
  const date = italianDateForFilename(menu.menuDate);
  return ["Menu", restaurant, date].filter(Boolean).join("_");
}

setMenuView(localStorage.getItem(menuViewKey) || "dense");
for (const button of document.querySelectorAll(".view-option")) {
  button.addEventListener("click", () => setMenuView(button.dataset.view));
}

document.querySelector("#print-menu").addEventListener("click", () => {
  const previousView = document.body.dataset.view;
  const previousTitle = document.title;
  document.body.dataset.view = "dense";
  document.title = printTitle(currentMenu);
  const restore = () => {
    document.body.dataset.view = previousView;
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
});

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Richiesta non riuscita");
  return payload;
}

function showError(error) {
  status.textContent = error.message;
  status.classList.add("error");
}

async function loadRestaurants() {
  const payload = await api("/api/restaurants");
  restaurantSelect.replaceChildren(...payload.restaurants.map((restaurant) => {
    const option = document.createElement("option");
    option.value = restaurant.code;
    option.textContent = `${restaurant.name}${restaurant.city ? ` · ${restaurant.city}` : ""}`;
    return option;
  }));
  const preferredCode = localStorage.getItem(preferredRestaurantKey);
  const availableCodes = new Set(payload.restaurants.map((restaurant) => restaurant.code));
  if (preferredCode && availableCodes.has(preferredCode)) {
    restaurantSelect.value = preferredCode;
  } else if (payload.defaultRestaurantCode && availableCodes.has(payload.defaultRestaurantCode)) {
    restaurantSelect.value = payload.defaultRestaurantCode;
  }
}

restaurantSelect.addEventListener("change", () => {
  localStorage.setItem(preferredRestaurantKey, restaurantSelect.value);
});

document.querySelector("#save-preferred").addEventListener("click", () => {
  localStorage.setItem(preferredRestaurantKey, restaurantSelect.value);
  status.classList.remove("error");
  status.textContent = "Ristorante preferito salvato su questo browser.";
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Accesso in corso…";
  try {
    await api("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: document.querySelector("#email").value, password: document.querySelector("#password").value })
    });
    loginForm.reset();
    await loadRestaurants();
    loginPanel.classList.add("hidden");
    menuPanel.classList.remove("hidden");
    await loadMenu();
  } catch (error) {
    showError(error);
  }
});

async function loadMenu() {
  status.classList.remove("error");
  status.textContent = "Caricamento menu…";
  menuRoot.replaceChildren();
  exportsRoot.classList.add("hidden");
  try {
    const query = new URLSearchParams({ restaurantCode: restaurantSelect.value, date: dateInput.value });
    const menu = await api(`/api/menu?${query}`);
    currentMenu = menu;
    const heading = document.createElement("div");
    heading.className = "menu-heading";
    const address = document.createElement("p");
    address.className = "eyebrow";
    address.textContent = menu.restaurant.address || "Menu del giorno";
    const restaurantName = document.createElement("h2");
    restaurantName.textContent = menu.restaurant.name;
    const menuDate = document.createElement("p");
    menuDate.textContent = menu.menuDate;
    heading.append(address, restaurantName, menuDate);
    menuRoot.append(heading);
    for (const category of menu.categories) {
      const section = document.createElement("section");
      section.className = "category";
      const title = document.createElement("h3");
      title.textContent = category.name;
      section.append(title);
      for (const dish of category.dishes) {
        const card = document.createElement("div");
        card.className = "dish";
        const meta = [dish.price > 0 ? `€ ${dish.price.toFixed(2).replace(".", ",")}` : "", dish.calories ? `${dish.calories} ${dish.caloriesUnit}` : ""].filter(Boolean);
        const description = document.createElement("div");
        const dishName = document.createElement("h4");
        dishName.textContent = dish.name;
        description.append(dishName);
        if (dish.subcategory) {
          const subcategory = document.createElement("p");
          subcategory.textContent = dish.subcategory;
          description.append(subcategory);
        }
        const details = document.createElement("span");
        details.textContent = meta.join(" · ");
        card.append(description, details);
        section.append(card);
      }
      menuRoot.append(section);
    }
    status.textContent = menu.dishes.length ? `${menu.dishes.length} piatti trovati.` : "Nessun piatto disponibile per questa data.";
    const jsonBlob = new Blob([JSON.stringify(menu, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(jsonBlob);
    link.download = `tavolamica-${menu.restaurant.code}-${menu.menuDate}.json`;
    link.textContent = "Scarica JSON";
    exportsRoot.replaceChildren(link);
    exportsRoot.classList.remove("hidden");
  } catch (error) {
    showError(error);
  }
}

document.querySelector("#load-menu").addEventListener("click", loadMenu);

document.querySelector("#logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  menuPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  currentMenu = null;
  menuRoot.replaceChildren();
});

async function restoreSession() {
  const session = await api("/api/session");
  if (!session.authenticated) return;
  await loadRestaurants();
  loginPanel.classList.add("hidden");
  menuPanel.classList.remove("hidden");
  await loadMenu();
}

restoreSession().catch(showError);
