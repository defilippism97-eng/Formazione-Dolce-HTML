# Architettura

## Livelli

```
┌──────────────────────────────────────────────────────────────┐
│  src/ui            Interfaccia React (schermate, componenti)  │
│                    usa SOLO l'interfaccia Backend             │
├──────────────────────────────────────────────────────────────┤
│  src/data/api.ts   Contratto Backend (TypeScript)             │
├──────────────────────────────┬───────────────────────────────┤
│  src/data/demo               │  src/data/http                │
│  backend simulato nel        │  client delle API REST reali  │
│  browser (modalità DEMO)     │  (produzione, docs/API.md)    │
├──────────────────────────────┴───────────────────────────────┤
│  src/domain        Regole di business pure, senza dipendenze  │
│                    (riutilizzabili identiche nel server Node)  │
└──────────────────────────────────────────────────────────────┘
```

- **`src/domain`**: tipi, stati e transizioni, controlli, permessi, riepiloghi, anomalie, file paghe, promemoria. Sono funzioni pure coperte da test (`tests/domain`). Il server di produzione, se scritto in Node/TypeScript, le importa così come sono; in altri linguaggi i test sono la specifica da replicare.
- **`src/data/demo`**: un "server" che gira nel browser. Applica gli stessi controlli che dovrà applicare il server vero, salva i dati in `localStorage` e gli allegati in IndexedDB, e genera le e-mail dei flussi nella **Posta simulata**.
- **`src/data/http`**: client delle API reali e accesso Microsoft 365.
- **`src/ui`**: schermate; nessuna regola vincolante vive solo qui.

La modalità si sceglie in `index.html` (`window.SDF_CONFIG.modalita = 'demo' | 'produzione'`) senza ricompilare.

## Ruoli

| Ruolo | Origine | Cosa vede |
|---|---|---|
| Lavoratore | anagrafica Lavoratori (attivo) | solo le proprie richieste |
| Coordinatore | assegnazione dei lavoratori (o coordinatore di servizio) | richieste dei lavoratori assegnati, esclusi bozze e se stesso; può segnalare a HR variazioni di organigramma per sé e per il team |
| Formazione HR | tabella ruoli applicativi | tutte le richieste (non le bozze), validazione, monte ore dei permessi, chiusura, file paghe, anomalie |
| Amministratore | tabella ruoli applicativi | come HR + organigramma, catalogo, utenti e ruoli, riapertura dei mesi |

Un utente può avere più ruoli. Nessuno può approvare o validare le **proprie** richieste.

## Ciclo di vita della richiesta

```
Bozza ──invia──▶ Inviata al coordinatore ──(auto)──▶ In attesa del coordinatore
  │                                                   │ approva     │ respinge      │ integrazione
  │                                                   ▼             ▼               ▼
  │                                  Approvata dal coordinatore   Respinta dal   Integrazione richiesta
  │                                                   │(auto)     coordinatore   dal coordinatore ─reinvia─▶ (In attesa…)
  │                                                   ▼
  │                                   In attesa di validazione HR
  │                                    │ valida        │ respinge      │ integrazione
  │                                    ▼               ▼               ▼
  │                              Validata da HR    Respinta da HR   Integrazione richiesta da HR ─reinvia─▶ (In attesa del coordinatore)
  │                                    │ chiusura del mese
  │                                    ▼
  │                       Inclusa nel riepilogo mensile ──file paghe──▶ Inviata a Payroll
  └──annulla (prima dell'approvazione)──▶ Annullata
```

Definizione in codice: `src/domain/stati.ts` (insiemi `MODIFICABILI_DAL_LAVORATORE`, `ANNULLABILI_DAL_LAVORATORE`, `IN_ATTESA_COORDINATORE`, `IN_ATTESA_HR`, `DEFINITIVI`, tabella `TRANSIZIONI`).

## Regole (dove sono implementate)

| # | Regola | Codice |
|---|---|---|
| R1 | Ora di fine dopo l'ora di inizio (sessione e presenza) | `validaRichiesta` |
| R2 | Ore frequentate = uscita − ingresso − pausa, > 0, ≤ durata della sessione | `calcolaOre`, `validaRichiesta` |
| R3 | Ore retribuite + gettone + non retribuite = ore frequentate all'invio (in bozza ≤) | `validaRichiesta` |
| R4 | Ore riconosciute da coordinatore e HR: stesse tre voci, somma = ore frequentate; nota obbligatoria per respingere o chiedere un'integrazione | `validaDecisione` |
| R5 | Gettone solo per i corsi che lo prevedono, mai per i permessi | `validaRichiesta`, `validaDecisione`, backend |
| R6 | Somma delle sessioni dello stesso corso ≤ durata complessiva (anomalia se diversa a fine corso) | `validaRichiesta`, `rilevaAnomalie` |
| R7 | Duplicato: stesso lavoratore, corso e data → conferma esplicita, segnalazione a coordinatore e HR | `trovaDuplicati`, backend |
| R8 | Nessuna modifica dopo la validazione HR | `azioniConsentite` |
| R9 | Nessuna modifica né nuova richiesta in un mese chiuso | `validaRichiesta`, `azioniConsentite` |
| R10 | Registro di tutte le variazioni di coordinatore, HR e amministratore | backend (`registra`) |
| R11 | Campi obbligatori, dichiarazioni, coordinatore e profilo completo per l'invio | `validaRichiesta` |
| R12 | Data non futura; mese e anno di competenza = data della sessione | `validaRichiesta`, backend |
| R13 | Pausa: se prevista dura da 5 a 240 minuti ed è più breve della sessione; si toglie dalla durata della sessione e dalle ore frequentate (se la presenza è parziale, solo quando il lavoratore dichiara che la pausa è caduta durante la presenza) | `calcolaOre`, `validaRichiesta` |
| R14 | Permessi (diritto allo studio, riqualifica professionale): solo con un monte ore attivo assegnato da HR e valido alla data; le ore non superano il residuo, all'invio e in ogni decisione | `validaRichiesta`, `validaDecisione`, `consumoMonteOre`, backend |

## Tipologie e monte ore dei permessi

Una richiesta ha una **tipologia**: `Formazione`, `Diritto allo studio` o `Riqualifica professionale`. Le ultime due sono permessi che HR abilita per il singolo lavoratore assegnandogli un **monte ore** (`MonteOre`: lavoratore, tipo, ore totali, periodo di validità, attivo).

- Il lavoratore vede un tipo di permesso solo finché ha un monte ore attivo di quel tipo.
- I permessi seguono lo stesso ciclo di vita della formazione (coordinatore, poi HR) e usano gli stessi campi delle ore: `oreRetribuite*` = ore di permesso a carico del monte ore, `oreGettone*` = 0, `oreNonRetribuite*` = ore non riconosciute.
- `consumoMonteOre` (`src/domain/monteore.ts`): **usufruite** = permessi validati da HR; **impegnate** = permessi inviati e non conclusi; **residue** = totali − usufruite − impegnate. Bozze, richieste respinte e annullate non contano.
- Nel file paghe i permessi hanno colonne proprie.

Per la formazione l'**ente erogatore** non è scelto dal lavoratore: un corso del catalogo è del datore di lavoro, un corso non a catalogo è esterno (committente o altro soggetto). Coordinatore e HR possono correggere titolo e dati di un corso esterno prima di decidere (`correggiCorso`). L'attestato non è previsto per i corsi del datore di lavoro ed è facoltativo per quelli esterni.

## Sicurezza

- **Il browser non è affidabile**: in produzione ogni controllo (identità, ruoli, visibilità, transizioni, ore, mese chiuso) va ripetuto nel server. Il backend demo mostra esattamente quali.
- **Dati personali**: il codice fiscale non viene mai restituito in chiaro al lavoratore, solo mascherato; compare solo nel file paghe e ad HR/amministratori. Non va scritto nel registro né nei log. Le e-mail non contengono dati fiscali.
- **Allegati**: si scaricano solo tramite un endpoint che verifica la visibilità della richiesta. Tipi ammessi: PDF e immagini, massimo 10 MB, massimo 5 file.
- **CSV**: file paghe e riepilogo delle richieste hanno una colonna per ogni voce di ore (retribuite, gettone, non retribuite, permessi); i campi di testo sono racchiusi tra apici e protetti dall'esecuzione di formule in Excel (CSV injection).
- **Interfaccia**: React esegue l'escape dei contenuti; nessun uso di `innerHTML` con dati. Intestazioni di sicurezza consigliate in `staticwebapp.config.json`.
- **Accesso**: in produzione nessuna password viene digitata nell'app (Single Sign-On Microsoft 365).

## Accessibilità e responsive

- Etichette su tutti i campi, messaggi d'errore collegati ai campi (`aria-describedby`), annunci con `aria-live`, focus visibile, finestre modali con focus intrappolato e chiusura con Esc, link "Vai al contenuto".
- Layout a griglia: menu laterale su computer, menu a scomparsa su tablet e smartphone; tabelle che su smartphone diventano schede.
