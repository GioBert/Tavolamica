# Analisi Android opzionale

Questa sezione è destinata a chi deve verificare la compatibilità con una versione dell’app ufficiale installata su un proprio dispositivo o emulatore. Non è necessaria per il normale utilizzo dopo aver configurato `.env`.

## Uso responsabile

- Usare esclusivamente account, dispositivi e installazioni propri.
- Non distribuire APK o output di decompilazione.
- Non condividere input crittografici, credenziali, token o log grezzi.
- Non usare gli strumenti per aggirare autenticazione o controlli di accesso.
- Mantenere un volume di richieste ragionevole.

## Strumenti presenti

- `tools/frida-agent/agent.ts`: agente Java per osservare il metodo MD5.
- `tools/trace_md5.py`: collega l’agente all’emulatore Android configurato.

Il trace nasconde l’input completo per impostazione predefinita e mostra soltanto lunghezza e impronta SHA-256 abbreviata. L’opzione `--show-sensitive` deve essere usata consapevolmente e l’output non deve essere copiato in issue, commit o chat.

## Preparazione indicativa

Sono richiesti Frida host/server della stessa versione, Python, ADB e un emulatore controllato dall’operatore.

```powershell
Set-Location tools/frida-agent
npm ci
npx frida-compile agent.ts -o _agent.js
Set-Location ../..
python tools/trace_md5.py
```

`_agent.js`, dipendenze, APK e decompilazioni sono ignorati da Git.

Questi strumenti non ricavano automaticamente tutti i parametri applicativi e non sostituiscono una valutazione autonoma delle condizioni d’uso del servizio.
