# Messa in produzione – guida per l'IT

Il prototipo è completo lato interfaccia e regole. Per l'uso reale servono tre cose:

1. **un server (API)** che implementi `docs/API.md` riusando `src/domain`;
2. **l'accesso Microsoft 365** (Entra ID);
3. **dove salvare dati e allegati**.

Il frontend non va riscritto: basta impostare `modalita: 'produzione'` in `index.html`.

## Opzioni di architettura

| Opzione | Server | Dati | Accesso | Costi indicativi | Note |
|---|---|---|---|---|---|
| **A. Azure Static Web Apps + Azure Functions** (consigliata) | Functions Node/TypeScript gestite da Static Web Apps, che importano `src/domain` | Liste e raccolte SharePoint già progettate (repo *Formazione-Dolce*, `sharepoint/schema.yaml`) tramite Microsoft Graph con un'app registration; in alternativa Azure SQL o Table Storage | EasyAuth Entra ID integrato (nessuna libreria nel browser) | Piano Free di Static Web Apps; le Functions gestite rientrano nel piano. Serve comunque una sottoscrizione Azure: da verificare con l'IT | Hosting, HTTPS, accesso e API in un unico servizio |
| B. Server aziendale (IIS / Node / .NET) | API in qualsiasi linguaggio, replicando le regole (i test sono la specifica) | Database aziendale o SharePoint via Graph | Entra ID (OIDC) o reverse proxy con autenticazione | Infrastruttura esistente | Più lavoro di integrazione |
| C. Web part SharePoint (SPFx) nella intranet | Power Automate (vedi repo *Formazione-Dolce*) o Azure Functions | Liste SharePoint | Contesto SharePoint (SSO automatico) | Nessuna licenza aggiuntiva con Power Automate standard | Le schermate React si riusano in una web part SPFx; il client dati va adattato ai flussi |

## Checklist dell'implementazione del server

- [ ] Autenticazione Entra ID. Con EasyAuth: leggere e verificare `x-ms-client-principal`. Rifiutare chiamate senza identità.
- [ ] Ricavare il login dal token, **mai** da parametri.
- [ ] Calcolare i ruoli come descritto in `docs/API.md`.
- [ ] Applicare a ogni endpoint `puoVedereRichiesta` / `azioniConsentite` / `validaRichiesta` / `validaDecisione` (le stesse funzioni di `src/domain`).
- [ ] Copiare sulla richiesta i dati organizzativi (area, servizio, centro di costo, coordinatore) dall'anagrafica al momento dell'invio.
- [ ] Registro modifiche per ogni scrittura, senza il codice fiscale.
- [ ] Allegati: controllo di tipo (anche dal contenuto), dimensione, antivirus se disponibile; download solo previo controllo di visibilità.
- [ ] Notifiche e-mail con Microsoft Graph `sendMail` da una cassetta condivisa (es. `formazione@societadolce.it`): ai lavoratori sull'e-mail di contatto, ai coordinatori sull'e-mail aziendale. Testi in `src/data/demo/messaggi.ts`.
- [ ] Processi pianificati: promemoria giornaliero (F4, giorni lavorativi, festività italiane + patrono) e riepilogo mensile (F5), con funzioni timer o Power Automate.
- [ ] File paghe: CSV generato con `generaCsvPaghe`, archiviato nella raccolta documentale HR con permessi ristretti; link ai destinatari autorizzati.
- [ ] Log applicativi senza dati personali; conservazione dei dati concordata con il DPO.
- [ ] Test: i test di `tests/domain` vanno eseguiti anche sul server. Aggiungere test di integrazione per ogni endpoint: permessi negati, 404 su richieste altrui, transizioni non ammesse.

## Configurazione del frontend

In `dist/index.html`, dopo `npm run build`:

```html
<script>
  window.SDF_CONFIG = {
    modalita: 'produzione',
    apiBaseUrl: '/api',
    linkResetPassword: 'https://password.societadolce.it/',
  };
</script>
```

Per usare MSAL al posto di EasyAuth, aggiungere `entra: { clientId, tenantId, scope }` e caricare `@azure/msal-browser`, esponendo l'istanza come `window.sdfMsal` (vedi `src/data/http/auth.ts`).

## Pubblicazione su Azure Static Web Apps (opzione A)

1. Creare la risorsa Static Web App collegata al repository: cartella dell'app `/`, comando di build `npm run build`, output `dist`.
2. Configurare l'autenticazione Microsoft Entra ID.
   - **Piano Free**: il provider Microsoft preconfigurato accetta qualsiasi account Microsoft. Le API **devono quindi verificare il tenant** (claim `tid` dell'utente uguale al tenant di Società Dolce) e rifiutare tutti gli altri.
   - **Piano Standard** (costo mensile contenuto): si registra un provider personalizzato limitato al solo tenant aziendale, con controllo già a livello di piattaforma.
3. `staticwebapp.config.json` (incluso) richiede l'autenticazione su tutte le pagine e imposta le intestazioni di sicurezza.
4. Aggiungere le Functions in `api/`, che implementano `docs/API.md` importando `../src/domain`.
5. Impostare in `index.html` `modalita: 'produzione'`.

## Comandi

```bash
npm ci              # installa le dipendenze esatte (package-lock.json)
npm run dev         # sviluppo con ricompilazione su http://localhost:5173
npm run typecheck   # controllo dei tipi TypeScript (modalità strict)
npm test            # test delle regole e del backend demo (Vitest)
npm run test:e2e    # test end-to-end nel browser (Playwright)
npm run build       # dist/index.html: file unico pronto per la pubblicazione
```

La pipeline `.github/workflows/verifica.yml` esegue controllo dei tipi, test e build a ogni push.
