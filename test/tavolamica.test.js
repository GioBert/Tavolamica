import test from "node:test";
import assert from "node:assert/strict";
import { categoryRank, dateOffset, menuAsText, normalizeMenu, normalizeRestaurants } from "../src/tavolamica.js";
import { menuPdfFilename, menuPdfHtml } from "../src/pdf.js";

test("calcola l'offset civile senza dipendere dall'ora", () => {
  assert.equal(dateOffset("2026-07-13", "2026-07-10"), 3);
  assert.equal(dateOffset("2026-07-09", "2026-07-10"), -1);
});

test("normalizza e ordina i ristoranti", () => {
  const restaurants = normalizeRestaurants({ data: { b: { code:"B", title:"Zola" }, a:{ code:"A", title:"Imola", city:"Imola" } } });
  assert.deepEqual(restaurants.map((item) => item.code), ["A", "B"]);
});

test("normalizza il menu e genera testo chat", () => {
  const payload = { data: { "2026-07-10": { menu_date:"2026-07-10", plates:{ x:{ id:1, title:"Pasta al pomodoro", category:"Primi", price:4.5 } } } } };
  const menu = normalizeMenu(payload, { code:"IM", name:"Imola Grieco" }, "2026-07-10");
  assert.equal(menu.dishes[0].name, "Pasta al pomodoro");
  assert.match(menuAsText(menu), /PRIMI/);
  assert.match(menuAsText(menu), /€ 4,50/);
});

test("ordina le categorie secondo la sequenza italiana", () => {
  const names = ["Pizzeria", "Dessert", "Contorni", "Secondi Freddi", "Primi Caldi", "Antipasti"];
  assert.deepEqual(names.sort((a, b) => categoryRank(a) - categoryRank(b)), [
    "Antipasti", "Primi Caldi", "Secondi Freddi", "Contorni", "Dessert", "Pizzeria"
  ]);
});

test("mantiene unite e ordinate le famiglie di categorie reali", () => {
  const plates = Object.fromEntries([
    "Secondi Caldi", "Pizzeria", "Contorni", "Primi Caldi", "Secondi Freddi",
    "Frutta", "Gruppo Coperti", "Piatti Unici Caldi", "Articoli Speciali",
    "Primi Freddi", "Dessert"
  ].map((category, index) => [index, { id:index, title:`Piatto ${index}`, category }]));
  const menu = normalizeMenu({ data:{ "2026-07-13":{ menu_date:"2026-07-13", plates } } }, { code:"0332", name:"Imola - Grieco" }, "2026-07-13");
  assert.deepEqual(menu.categories.map(({ name }) => name), [
    "Primi Caldi", "Primi Freddi",
    "Piatti Unici Caldi", "Secondi Caldi", "Secondi Freddi",
    "Contorni", "Dessert", "Frutta",
    "Articoli Speciali", "Gruppo Coperti", "Pizzeria"
  ]);
});

test("genera nome e template PDF adatti ai bot", () => {
  const menu = {
    restaurant: { code:"0332", name:"Tavolamica Imola - Grieco", address:"Via Grieco, 4" },
    menuDate:"2026-07-10",
    categories:[{ name:"Primi Caldi", dishes:[{ name:"Riso", subcategory:"Base riso", price:4.2, calories:"100", caloriesUnit:"KCL" }] }]
  };
  assert.equal(menuPdfFilename(menu), "Menu_Tavolamica_Imola-Grieco_venerdi_10_luglio_2026.pdf");
  const html = menuPdfHtml(menu);
  assert.match(html, /@bottom-center/);
  assert.match(html, /Progetto indipendente e non ufficiale/);
  assert.match(html, /Tavolamica Imola - Grieco/);
});
