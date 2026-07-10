# Tavolamica Menu

> Progetto indipendente e non ufficiale. Non rappresenta, non è affiliato e non è sponsorizzato da Tavolamica o da CAMST Soc. Coop. a r.l. Società Benefit.

Tavolamica Menu nasce dall’esigenza di alcuni clienti di consultare in modo rapido, leggibile e stampabile i menu messi a disposizione dal servizio Tavolamica. Il progetto nasce senza finalità commerciali e non intende sostituire l’app ufficiale. Marchi, contenuti e servizi appartengono ai rispettivi titolari.

© 2026 Giovanni Bertozzi · [GioBert on GitHub](https://github.com/GioBert)

## Abstract

Tavolamica Menu è un’applicazione locale che consente a un cliente Tavolamica di usare il proprio account per:

- consultare i ristoranti disponibili;
- scegliere una sede preferita e una data;
- leggere il menu nelle viste densa, normale o larga;
- stampare o salvare un PDF A4;
- esportare il menu in formato JSON o testo;
- offrire API protette a bot e automazioni personali.

Il menu viene ordinato secondo una sequenza gastronomica stabile: antipasti, primi, piatti unici e secondi, contorni, dessert e frutta, quindi le altre categorie. Le categorie assenti non vengono aggiunte artificialmente.

## Privacy e sicurezza

- Le credenziali inserite nella pagina web vengono inoltrate ai servizi Tavolamica e non vengono scritte su disco dall’applicazione.
- Le sessioni web sono conservate soltanto in memoria e scadono dopo un’ora.
- La modalità API usa credenziali Tavolamica conservate nel file `.env` locale e una chiave API separata per i client autorizzati.
- Un bot non deve conoscere l’indirizzo email o la password Tavolamica: riceve soltanto la chiave API del servizio locale.
- `.env`, cache, PDF, screenshot, APK, decompilazioni, log e catture di rete sono esclusi da Git.
- Non pubblicare mai credenziali, token, cookie, HAR, log grezzi o risposte API contenenti dati personali.

L’uso dei servizi Tavolamica resta soggetto alle condizioni del relativo fornitore. Le API e il formato dei dati possono cambiare senza preavviso.

## Funzionalità

- accesso interattivo con il proprio account;
- elenco aggiornabile dei ristoranti;
- ristorante preferito salvato soltanto nel browser;
- data odierna italiana preselezionata;
- categorie ordinate e viste responsive;
- PDF A4 con dichiarazione di indipendenza e crediti su ogni pagina;
- JSON normalizzato e testo per chat;
- API con autenticazione Bearer per ristoranti, menu e PDF;
- cache di menu e PDF, con ETag per le richieste condizionali;
- Docker Compose e controllo dello stato del servizio;
- collaudi visivi desktop, mobile e multipagina con Playwright.

## Requisiti

- Node.js 20 o versione successiva;
- npm;
- un account Tavolamica personale;
- i parametri applicativi richiesti nel file `.env`, ricavati legittimamente dalla propria installazione dell’app ufficiale.

Il repository non distribuisce APK, credenziali, token o costanti incorporate nell’app proprietaria.

Per verifiche di compatibilità sulla propria installazione è disponibile la [guida opzionale all’analisi Android](docs/research/android-analysis.md).

## Installazione locale

```powershell
git clone https://github.com/GioBert/Tavolamica.git
Set-Location Tavolamica
npm ci
npx playwright install chromium
Copy-Item .env.example .env
```

Compilare `.env` con i propri valori. Configurazione minima per la pagina web:

```dotenv
PORT=8097
TAVOLAMICA_CHECKSUM_SEED=<valore locale>
TAVOLAMICA_APP_TOKEN=<valore locale>
TAVOLAMICA_EMAIL=
TAVOLAMICA_PASSWORD=
TAVOLAMICA_API_KEY=
```

Avviare il servizio:

```powershell
npm start
```

Aprire nel browser:

```text
http://127.0.0.1:8097/
```

La pagina richiede email e password in modo interattivo. Non è necessario inserirle nel file `.env` se non si usano le API destinate a bot e automazioni.

## Modalità servizio e API

Per bot e automazioni, valorizzare anche:

```dotenv
TAVOLAMICA_EMAIL=<email dell’account di servizio>
TAVOLAMICA_PASSWORD=<password dell’account di servizio>
TAVOLAMICA_API_KEY=<chiave casuale lunga e distinta>
TAVOLAMICA_CACHE_TTL_SECONDS=900
```

Le richieste API usano l’intestazione:

```http
Authorization: Bearer <TAVOLAMICA_API_KEY>
```

### Elenco dei ristoranti e relativi codici

```powershell
npm run api:restaurants -- --refresh
npm run api:restaurants -- --refresh --json
```

Oppure:

```http
GET /api/v1/restaurants?refresh=1
```

### Menu

```http
GET /api/v1/menu?restaurantCode=0332&date=2026-07-10
GET /api/v1/menu.txt?restaurantCode=0332&date=2026-07-10
GET /api/v1/menu.pdf?restaurantCode=0332&date=2026-07-10
```

Se `date` viene omesso, il servizio usa il giorno corrente nel fuso orario `Europe/Rome`.

Esempio PowerShell che non inserisce la chiave nell’URL:

```powershell
$headers = @{ Authorization = "Bearer $env:TAVOLAMICA_API_KEY" }
Invoke-WebRequest `
  'http://127.0.0.1:8097/api/v1/menu.pdf?restaurantCode=0332' `
  -Headers $headers `
  -OutFile menu.pdf
```

La risposta PDF include negli header HTTP il nome del file, l’ETag, il codice del ristorante, la data del menu e lo stato della cache.

## Docker Compose

```bash
cp .env.example .env
# compilare .env
docker compose up -d --build
```

Per impostazione predefinita, Docker pubblica il servizio soltanto su:

```text
http://127.0.0.1:8107/
```

La porta dell’host è configurabile con `TAVOLAMICA_BIND_PORT`. Per l’accesso da altri container è preferibile una rete Docker privata. Per l’accesso esterno, usare un reverse proxy HTTPS e non pubblicare direttamente l’applicazione su Internet.

## Collaudi

```powershell
npm test
npm run visual:check
npm run visual:check -- --authenticated --restaurant 0332 --pdf
npm run visual:check -- --mobile --authenticated --restaurant 0332
```

Gli artefatti vengono scritti in `artifacts/browser/`, cartella ignorata da Git.

Stress test del piè di pagina su più pagine:

```powershell
npm run visual:check -- --authenticated --restaurant 0332 --pdf --stress-pages 3
python tools/verify_pdf.py artifacts/browser/menu-print-stress.pdf
```

## Integrazioni

- [Contratto per scheduler e bot di messaggistica](docs/integrations/whatsapp_scheduler.md)

Il documento descrive responsabilità, sicurezza, cache, idempotenza e invio del PDF, senza legare Tavolamica Menu a uno specifico bot o destinatario.

## Contribuire

Leggere [CONTRIBUTING.md](CONTRIBUTING.md). Sono accettati test con dati fittizi, miglioramenti documentali e client che usano una configurazione esterna. Non sono accettati APK, segreti, dati personali, scraping aggressivo o aggiramenti dei controlli di accesso.

## Licenza e marchi

Il codice originale è software libero e open source distribuito secondo la GNU Affero General Public License, versione 3 o successiva (`AGPL-3.0-or-later`): [LICENSE](LICENSE).

La licenza consente uso, studio, modifica, distribuzione e impiego commerciale nel rispetto dei suoi termini. Se una versione modificata viene resa accessibile agli utenti tramite una rete, deve offrire anche il relativo codice sorgente secondo la sezione 13 della GNU AGPL.

Per eventuali accordi commerciali alternativi relativi alle parti del progetto detenute dal titolare del copyright, consultare [COMMERCIAL-LICENSING.md](COMMERCIAL-LICENSING.md). Una licenza alternativa non limita i diritti già concessi dalla GNU AGPL.

Tavolamica e CAMST sono nomi e marchi dei rispettivi titolari. La loro menzione serve esclusivamente a identificare il servizio con cui questo progetto indipendente è interoperabile.
