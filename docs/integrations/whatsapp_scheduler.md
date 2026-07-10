# Integrazione futura con WhatsApp Scheduler

Stato: contratto lato Tavolamica implementato; nessuna modifica applicata al bot WhatsApp.

## Obiettivo

Consentire a un servizio esterno, per esempio un bot personale, di ottenere il menu
del giorno già impaginato in PDF e inviarlo a uno o più destinatari WhatsApp
esplicitamente configurati.

Tavolamica resta il fornitore dei dati e dei documenti. Il bot resta
responsabile di target, orari, quote, idempotenza degli invii e stato WhatsApp.

## Scenario di riferimento

Il servizio può essere integrato con uno scheduler o un bot già esistente. Il
deploy deve usare una porta host libera oppure, preferibilmente, una rete Docker
privata e il nome del servizio.

Un gateway che oggi invia soltanto testo dovrà aggiungere in futuro un metodo
per documenti PDF, senza cambiare il contratto HTTP qui definito.

## Confini di responsabilità

### Tavolamica

- conserva esclusivamente le proprie credenziali di servizio;
- espone elenco ristoranti, menu JSON/testo e PDF;
- applica il fuso orario `Europe/Rome` quando la data è omessa;
- ordina le categorie come antipasti, primi, secondi/piatti unici, contorni,
  dessert/frutta e altro;
- genera nome file, MIME type, checksum e metadati;
- usa cache per la coppia ristorante/data;
- non conosce numeri, JID o target WhatsApp.

### WhatsApp Scheduler

- conserva l'API key usata verso Tavolamica;
- decide orario e giorni di invio;
- associa la pianificazione a un alias target già configurato;
- scarica il PDF come buffer con limiti di dimensione e timeout;
- invia il documento tramite Baileys;
- applica quote, retry, ledger e chiave idempotente;
- non riceve mai username o password Tavolamica.

## Contratto API previsto

Tutte le route di servizio richiedono:

```http
Authorization: Bearer <TAVOLAMICA_API_KEY>
```

Il bot non deve disporre di email o password Tavolamica. Queste restano nel
solo container Tavolamica, che effettua login e rinnovo della sessione. Al bot
viene consegnata esclusivamente `TAVOLAMICA_API_KEY`, una chiave separata e
revocabile.

### Elenco ristoranti

```http
GET /api/v1/restaurants
```

Per forzare un aggiornamento dal backend Tavolamica:

```http
GET /api/v1/restaurants?refresh=1
```

Comando operatore dal repository Tavolamica:

```powershell
npm run api:restaurants -- --refresh
npm run api:restaurants -- --refresh --json
```

Contro un servizio remoto:

```powershell
$env:TAVOLAMICA_API_KEY = '<chiave dedicata>'
npm run api:restaurants -- --base-url http://menu-service.local:8107 --refresh
```

La tabella restituita espone il codice da copiare nella futura configurazione
del bot. La chiave non deve essere passata come parametro URL.

Risposta sintetica:

```json
{
  "restaurants": [
    {
      "code": "0332",
      "name": "Tavolamica Imola - Grieco",
      "city": "Imola",
      "province": "BO"
    }
  ],
  "defaultRestaurantCode": "0332"
}
```

### Menu del giorno in PDF

Data esplicita:

```http
GET /api/v1/menu.pdf?restaurantCode=0332&date=2026-07-10
```

Data odierna italiana:

```http
GET /api/v1/menu.pdf?restaurantCode=0332
```

Header previsti:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="Menu_Tavolamica_Imola-Grieco_venerdi_10_luglio_2026.pdf"
ETag: "<checksum>"
X-Tavolamica-Restaurant-Code: 0332
X-Tavolamica-Menu-Date: 2026-07-10
X-Tavolamica-Cache: HIT
```

Il PDF deve includere disclaimer e crediti su ogni pagina.

### Formati alternativi

```http
GET /api/v1/menu?restaurantCode=0332
GET /api/v1/menu.txt?restaurantCode=0332
```

JSON e testo sono alternative utili se il PDF non può essere inviato.

## Flusso giornaliero ipotizzato

1. Alle `10:45` lo scheduler crea il job per il target configurato.
2. Calcola la data civile in `Europe/Rome`.
3. Costruisce la chiave idempotente:
   `tavolamica:0332:2026-07-10:gruppo_pranzo`.
4. Richiede il PDF al servizio Tavolamica con timeout.
5. Verifica HTTP 200, `application/pdf`, dimensione massima e data negli header.
6. Invia un documento WhatsApp con una breve didascalia.
7. Registra l'esito nel ledger; un riavvio non causa un doppio invio.

Esempio futuro Baileys, puramente illustrativo:

```js
await socket.sendMessage(targetJid, {
  document: pdfBuffer,
  mimetype: "application/pdf",
  fileName: pdfFilename,
  caption: "Menu di oggi - Tavolamica Imola - Grieco"
});
```

## Configurazione futura lato bot

Esempio concettuale, non ancora supportato dal bot:

```yaml
integrations:
  tavolamica:
    base_url: http://tavolamica-menu:8097
    api_key_env: TAVOLAMICA_MENU_API_KEY
    timeout_seconds: 30
    max_pdf_mb: 10

document_reminders:
  - id: menu_pranzo_imola
    enabled: false
    timezone: Europe/Rome
    weekdays: [monday, tuesday, wednesday, thursday, friday]
    time: "10:45"
    targets: [gruppo_pranzo]
    provider: tavolamica
    restaurant_code: "0332"
    date: today
    format: pdf
```

La funzione deve nascere disabilitata e passare prima da un target di test.

## Errori e fallback

- `401`: API key errata, nessun invio e allarme operativo;
- `404`: ristorante non disponibile, nessun invio;
- `422`: data non valida;
- `502/504`: backend Tavolamica non disponibile, retry limitato;
- menu vuoto: non inviare un PDF fuorviante;
- PDF oltre limite: inviare testo solo se esplicitamente configurato;
- errore WhatsApp: conservare il job e seguire retry/quote del bot.

## Funzioni implementate in Tavolamica

- `GET /api/v1/restaurants`, con refresh opzionale;
- `GET /api/v1/menu`, `/api/v1/menu.txt` e `/api/v1/menu.pdf`;
- data odierna italiana quando `date` è omessa;
- cache menu in memoria e PDF su volume;
- deduplicazione delle generazioni PDF concorrenti;
- header `ETag`, filename, codice ristorante, data e stato cache;
- test del filename/template e verifica PDF multipagina disponibile negli strumenti.

Restano miglioramenti futuri: readiness upstream separata, metriche, limite
esplicito di concorrenza globale e policy di pulizia periodica della cache.

## Requisiti futuri lato WhatsApp Scheduler

- gateway per documenti PDF;
- job/reminder di tipo documento o provider esterno;
- download HTTP autenticato con limiti e timeout;
- idempotenza per target/ristorante/data;
- prova manuale verso un target di test;
- audit e stato admin senza esporre API key, JID o contenuti sensibili.

## Sicurezza

- servizi raggiungibili preferibilmente sulla stessa rete Docker privata;
- API non esposta direttamente a Internet;
- API key distinta dalle credenziali Tavolamica e ruotabile;
- nessun JID nei log Tavolamica;
- nessuna password Tavolamica nella configurazione WhatsApp;
- cache PDF con permessi e retention limitati.
