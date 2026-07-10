# Contribuire

Grazie per voler contribuire alla ricerca sul menu Tavolamica.

## Segnalazioni utili

Una segnalazione dovrebbe includere:

- modello generico del dispositivo e versione Android;
- versione e version code dell'app;
- comportamento atteso e comportamento osservato;
- passaggi minimi per riprodurre il problema;
- estratto breve e ripulito del log, se rilevante.

Non sono necessarie credenziali per diagnosticare la maggior parte dei problemi.

## Rimozione dei dati sensibili

Prima di pubblicare output ADB, logcat, HAR o risposte JSON, sostituire con
segnaposto tutti i valori riconducibili a una persona o a una sessione:

```text
Authorization: Bearer <REDACTED>
Cookie: <REDACTED>
email: <REDACTED>
device_id: <REDACTED>
```

Se non si è certi che un file sia sicuro, non pubblicarlo.

## Pull request

- mantenere le modifiche piccole e motivate;
- non committare APK o materiale proprietario;
- non introdurre automazioni aggressive o tentativi di elusione;
- aggiungere istruzioni per riprodurre e verificare ogni nuovo risultato;
- evitare dipendenze quando bastano gli strumenti standard.

## Licenza dei contributi

Inviando un contributo, dichiari di avere il diritto di proporlo e accetti che venga distribuito secondo la licenza `AGPL-3.0-or-later` del progetto. Mantieni il copyright sul tuo contributo, salvo diverso accordo scritto.

## Ambito

Sono benvenuti documentazione, diagnostica, parser delle risposte ottenute
legittimamente, client con configurazione esterna e test basati su dati fittizi.

Non rientrano nell'ambito exploit, bypass dell'autenticazione, raccolta di
credenziali, scraping aggressivo o distribuzione dell'app proprietaria.
