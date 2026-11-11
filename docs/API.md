# Contratto delle API REST (produzione)

L'interfaccia comunica con il server **solo** tramite l'interfaccia `Backend` (`src/data/api.ts`).
In produzione la implementa `src/data/http/backend-http.ts`, che chiama le API descritte qui.
Il backend simulato `src/data/demo/backend-demo.ts` è la **specifica eseguibile** del comportamento atteso: per ogni endpoint indica controlli, errori, scritture nel registro e notifiche.

## Regole generali

| Tema | Regola |
|---|---|
| Base URL | `config.apiBaseUrl` (predefinito `/api`, stessa origine dell'app) |
| Autenticazione | Microsoft Entra ID. Consigliato: EasyAuth di Azure Static Web Apps / App Service. L'identità arriva al server nell'intestazione `x-ms-client-principal`; in alternativa token Bearer (MSAL) validato dal server |
| Identità | Il server ricava il login (UPN) **solo** dal token o dalla sessione, mai da parametri del client |
| Autorizzazione | A **ogni** chiamata il server calcola i ruoli (vedi sotto) e applica `src/domain/permessi.ts` e `src/domain/regole.ts` |
| Formato | JSON UTF-8. Date di calendario `AAAA-MM-GG`, istanti ISO 8601 UTC, orari `HH:mm`, ore come numeri decimali |
| Errori | HTTP 400/401/403/404/409/422/500 con corpo `{ "codice", "messaggio", "dettagli"?: [{ "campo", "messaggio" }], "richiestaConferma"?: "duplicato" }`. `messaggio` è già comprensibile per l'utente, in italiano |
| Riservatezza | Non restituire la richiesta (né la sua esistenza) a chi non può vederla: 404 con "Richiesta non trovata o non autorizzata." |
| Registro | Ogni scrittura crea una o più voci `VoceRegistro` (autore, ruolo, azione, campo, prima, dopo, nota). Il codice fiscale non va mai nel registro né nei log |

### Calcolo dei ruoli (come `sessioneDi` nel backend demo)

- **lavoratore**: esiste un `Lavoratore` con quel login e `stato = Attivo`;
- **coordinatore**: almeno un lavoratore attivo ha `coordinatoreLogin` uguale, oppure una struttura attiva ha `coordinatoreServizioLogin` uguale;
- **hr**, **admin**: assegnazione attiva nella tabella dei ruoli applicativi.

`profiloCompleto` è vero se il lavoratore ha e-mail di contatto e codice fiscale (obbligatori al primo accesso).

## Endpoint

| Metodo e percorso | Chi | Corpo / parametri | Risposta |
|---|---|---|---|
| `GET /me` | autenticato | — | `Sessione` (401 se non autenticato) |
| `GET /profilo` | autenticato | — | `Profilo` (CF solo mascherato; `monteOre` = monte ore attivi dei permessi con ore usufruite, impegnate e residue) |
| `PATCH /profilo` | lavoratore | `{ emailContatto?, codiceFiscale? }` | `Profilo` |
| `POST /profilo/segnalazioni` | lavoratore; coordinatore per i lavoratori del proprio team | `{ testo, lavoratoreId? }` (testo ≥ 10 caratteri; senza `lavoratoreId` la segnalazione riguarda chi scrive) | `Profilo`; e-mail a HR con l'autore |
| `GET /catalogo` | autenticato | — | `Corso[]` (Datore di lavoro, attivi, validati) |
| `GET /catalogo/storico-esterni` | autenticato | — | `Corso[]` esterni del chiamante con più giornate |
| `GET /chiusure` | autenticato | — | `ChiusuraMensile[]` (contenuto dei file paghe solo per HR) |
| `GET /richieste/mie` | lavoratore | — | `Richiesta[]` del chiamante |
| `POST /richieste?azione=bozza\|invia` | lavoratore | `multipart/form-data`: `dati` = JSON `SalvaRichiestaInput` senza file; `allegato_N` (file) + `tipo_N` (`Attestato`/`Altra documentazione`) | `Richiesta`. 409 con `richiestaConferma: "duplicato"` se serve conferma |
| `PUT /richieste/{id}?azione=bozza\|invia` | proprietario | come sopra; `dati.allegatiRimossi` = ID da eliminare | `Richiesta` |
| `POST /richieste/{id}/annulla` | proprietario | — | `Richiesta` |
| `GET /richieste/{id}` | chi può vederla | — | `DettaglioRichiesta` (storico completo solo a HR/admin; `gettonePrevisto`; per i permessi `monteOre` con le ore residue senza contare questa richiesta) |
| `GET /richieste/{id}/allegati/{allegatoId}` | chi può vedere la richiesta | — | file binario (`Content-Disposition: attachment`) |
| `GET /richieste?ambito=team\|tutte&anno&mese&area&servizio&centroDiCosto&coordinatoreLogin&login&codiceCorso&stato&tipologia&testo` | team: coordinatore; tutte: HR/admin | — | `Richiesta[]` (mai le bozze altrui) |
| `GET /team/lavoratori` | coordinatore | — | `LavoratoreTeam[]` |
| `POST /richieste/{id}/decisione-coordinatore` | coordinatore assegnato, ≠ lavoratore | `DecisioneInput` | `Richiesta` |
| `POST /richieste/decisione-hr` | HR/admin | `DecisioneMultiplaInput` | `RisultatoMultiplo` (le richieste non elaborabili sono in `scartate` con il motivo) |
| `POST /richieste/{id}/correzione-corso` | coordinatore assegnato o HR/admin, solo su richieste di formazione per corsi esterni in attesa della loro decisione | `CorrezioneCorsoInput` (`titolo`, `nomeEnte?`, `modalita`, `durataOre`, `piuGiornate`) | `Richiesta`; la correzione vale per il corso e per le altre richieste non definitive dello stesso corso |
| `GET /monti-ore` | HR/admin | — | `SituazioneMonteOre[]` (ore usufruite, impegnate e residue calcolate dalle richieste) |
| `POST\|PUT /monti-ore[/{id}]` | HR/admin | `MonteOreInput` (`lavoratoreId`, `tipo`, `oreTotali`, `validoDal`, `validoAl`, `attivo`, `note?`) | `SituazioneMonteOre`; 422 se il periodo si sovrappone a un altro monte ore attivo dello stesso tipo, se le ore scendono sotto quelle già usate o se il periodo esclude permessi già richiesti; e-mail al lavoratore alla prima assegnazione |
| `GET /chiusure/{anno}/{mese}` | HR/admin | — | `StatoMese` (aperte, `apertePerCoordinatore` e anomalie) |
| `POST /chiusure/{anno}/{mese}/chiudi` | HR/admin | `{ note? }` | `ChiusuraMensile` |
| `POST /chiusure/{anno}/{mese}/riapri` | admin | `{ motivo }` (≥ 10 caratteri) | `ChiusuraMensile` |
| `POST /chiusure/{anno}/{mese}/file-paghe` | HR/admin | — | `FilePaghe` (CSV in `contenuto`) |
| `GET /chiusure/{periodo}/file-paghe/{id}` | HR/admin | — | `text/csv` |
| `GET /anagrafiche` | HR/admin | — | `Anagrafiche` |
| `POST\|PUT /lavoratori[/{id}]` | admin | `Lavoratore` | `Lavoratore`; se cambia il coordinatore le richieste aperte passano al nuovo |
| `POST\|PUT /strutture[/{id}]` | admin | `Struttura` | `Struttura` |
| `POST\|PUT /corsi[/{id}]` | admin | `Corso` | `Corso` |
| `POST\|PUT /ruoli[/{id}]` | admin | `AssegnazioneRuolo` | `AssegnazioneRuolo` (resta almeno un admin attivo) |
| `POST /lavoratori/{id}/segnalazioni/{indice}/chiudi` | HR/admin | — | 204 |
| `GET /registro?richiestaId&entita` | HR/admin | — | `VoceRegistro[]` |
| `GET /notifiche` | autenticato | — | `Notifica[]` ricevute dal chiamante (facoltativo: in produzione le notifiche sono e-mail reali) |

`SalvaRichiestaInput` contiene `tipologia` (`Formazione`, `Diritto allo studio`, `Riqualifica professionale`), la pausa (`pausaPrevista`, `pausaMinuti`, `pausaInPresenza`) e le tre voci di ore; l'ente erogatore **non** arriva dal client: il server lo deduce dal corso (catalogo = Datore di lavoro, corso esterno = Committente o altro soggetto). Per i permessi il server collega il monte ore valido alla data, imposta le ore di permesso uguali alle ore frequentate e rifiuta gli attestati.

I tipi (`Sessione`, `Richiesta`, `SalvaRichiestaInput`, …) sono definiti in TypeScript in `src/domain/types.ts` e `src/data/api.ts`.

## Processi lato server (equivalenti dei flussi F1–F6)

| Evento | Il server deve |
|---|---|
| Invio (F1) | validare con `validaRichiesta(…, perInvio = true)`, copiare i dati organizzativi dall'anagrafica (non dal client), controllare i duplicati (`trovaDuplicati`), portare lo stato a *In attesa del coordinatore*, registrare data e ora, inviare l'e-mail al coordinatore (casella aziendale) con il collegamento `‹url app›#/richiesta/{id}` |
| Esito coordinatore (F2) | `validaDecisione` (le tre voci – retribuite, gettone, non retribuite – sommano alle ore frequentate; per i permessi le ore riconosciute non superano il monte ore residuo); se approva salva le ore e porta lo stato a *In attesa di validazione HR*; e-mail al lavoratore (**e-mail di contatto**) |
| Esito HR (F3) | come sopra; e-mail a lavoratore e coordinatore |
| Promemoria (F4) | ogni giorno lavorativo (`isGiornoLavorativo`, con festività e patrono): `valutaPromemoria` → promemoria a 3 e 5 giorni, segnalazione a HR a 7 |
| Riepilogo mensile (F5) | il giorno 2 del mese: `calcolaKPI` per coordinatore e totale, con aperte, respinte, incomplete |
| File paghe (F6) | solo richieste *Inclusa nel riepilogo mensile* del periodo chiuso: `righePaghe` + `generaCsvPaghe` (colonne distinte per ore retribuite, gettone, non retribuite, diritto allo studio e riqualifica professionale); archivio nella raccolta documentale HR; stato *Inviata a Payroll*; link ai destinatari autorizzati |

I testi delle e-mail sono in `src/data/demo/messaggi.ts`.
