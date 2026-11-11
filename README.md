# Gestione ore formazione – Società Dolce (app web)

App web per **digitalizzare il foglio delle ore di formazione**:

**Lavoratore → Coordinatore → Ufficio HR/Formazione → Ufficio Paghe**

Implementa tutte le funzioni del documento di analisi e gli aggiornamenti concordati con Ufficio Formazione e IT:
- **4 ruoli**: lavoratore, coordinatore, Formazione HR, amministratore;
- **13 stati** della richiesta e controlli R1–R14;
- **tre tipologie**: formazione e, per i lavoratori abilitati da HR, **Diritto allo studio** e **Riqualifica professionale** con **monte ore** individuale che si scala fino a esaurimento;
- **pausa** della sessione e ripartizione delle ore in **retribuite, gettone e non retribuite** (la somma è uguale alle ore frequentate);
- corso scelto **prima dal catalogo**: l'ente erogatore lo deduce l'app; attestato non richiesto per i corsi del datore di lavoro e facoltativo per quelli esterni;
- il coordinatore può **correggere i dati di un corso esterno** e **segnalare variazioni di organigramma** per sé e per il team;
- **allegati**, **notifiche**, **promemoria**;
- **riepiloghi mensili** per coordinatore, servizio, centro di costo e area;
- **chiusura del mese**, con le richieste aperte raggruppate per coordinatore, e **file per l'Ufficio Paghe** con una colonna per ogni voce;
- **registro delle modifiche** e **sicurezza per ruolo**.

L'interfaccia è responsive (computer, tablet, smartphone) e usa logo, colori e carattere di Società Dolce.

Le integrazioni con **Zucchetti** (catalogo dei corsi, date e orari delle edizioni, profilo formativo della persona) sono previste in una **fase 2** e non fanno parte di questo prototipo.

## Provarla subito (modalità DEMO)

Scaricare e aprire **[`demo/Gestione-ore-formazione-DEMO.html`](demo/Gestione-ore-formazione-DEMO.html)** nel browser (doppio clic, nessuna installazione; Chrome, Edge, Firefox o Safari aggiornati) e scegliere un account dimostrativo:

| Account | Ruolo |
|---|---|
| giulia.bianchi@demo.societadolce.it | Lavoratore |
| marco.rossi@demo.societadolce.it | Coordinatore |
| laura.verdi@demo.societadolce.it | Formazione HR |
| paolo.neri@demo.societadolce.it | Amministratore |
| luca.esposito@demo.societadolce.it | Lavoratore al primo accesso |

Password per tutti: `Demo2026!`. Il copione della demo è in [docs/DEMO.md](docs/DEMO.md).

Come funziona la demo:
- dati e persone sono **inventati** e restano solo nel browser di chi la prova;
- le e-mail non partono: si leggono nella sezione **Posta (simulata)**.

## Per l'IT

| Documento | Contenuto |
|---|---|
| [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) | Livelli, ruoli, stati, regole e dove sono nel codice, sicurezza, accessibilità |
| [docs/API.md](docs/API.md) | Contratto REST del server di produzione |
| [docs/PRODUZIONE.md](docs/PRODUZIONE.md) | Opzioni di messa in produzione, checklist del server, configurazione |
| [docs/DEMO.md](docs/DEMO.md) | Copione della presentazione |

### Tecnologie

- **TypeScript (strict) + React 18**, nessun'altra libreria a runtime.
- **esbuild** per compilare in un **unico file HTML** (circa 670 KB con carattere e logo incorporati, nessuna risorsa esterna).
- **Vitest** per i test delle regole, **Playwright** per i test nel browser.

Comandi:

```bash
npm ci              # dipendenze esatte
npm run dev         # sviluppo su http://localhost:5173
npm run typecheck   # controllo dei tipi
npm test            # test delle regole e del backend demo
npm run test:e2e    # test end-to-end nel browser
npm run build       # dist/index.html (+ copia in demo/)
```

### Struttura

```
src/
  domain/           regole di business pure (stati, controlli, permessi, riepiloghi, file paghe)
  data/api.ts       contratto Backend usato dall'interfaccia
  data/demo/        backend simulato (DEMO): stessi controlli del server reale + dati dimostrativi
  data/http/        client delle API reali e accesso Microsoft 365
  ui/               interfaccia: struttura, componenti, schermate
  styles/app.css    stile (colori e carattere del marchio in cima al file)
  assets/           logo
tests/domain/       test delle regole e del processo completo
tests/e2e/          test end-to-end nel browser
index.html          modello della pagina e configurazione (DEMO / produzione)
staticwebapp.config.json   pubblicazione su Azure Static Web Apps con accesso Entra ID
```

### Principi

1. **Le regole stanno in `src/domain`**, non nelle schermate, e sono testate. Il server di produzione le riusa.
2. **L'interfaccia parla solo con l'interfaccia `Backend`**: si passa da DEMO a produzione cambiando una riga di configurazione.
3. **Il backend demo è la specifica eseguibile del server**: ogni controllo che fa (identità, ruoli, stati, ore, mese chiuso, registro, notifiche) va fatto anche dal server reale.
4. **Nessuna password nell'app** in produzione: l'accesso è Single Sign-On Microsoft 365.

## Progetto collegato

Il repository **Formazione-Dolce** contiene la versione **Power Platform a costo zero** della stessa app:
- liste SharePoint, app Power Apps e flussi Power Automate;
- il modello dati SharePoint e i flussi riutilizzabili anche come backend di questa app web.
