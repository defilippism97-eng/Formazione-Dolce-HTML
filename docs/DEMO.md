# Copione della demo

Per presentare l'app a HR, coordinatori e direzione: circa 15 minuti.

**Come aprirla:** doppio clic su `demo/Gestione-ore-formazione-DEMO.html` (o `dist/index.html` dopo `npm run build`), oppure `npm run dev` e http://localhost:5173.

**Dati:** tutti inventati, generati in base alla data di oggi:
- circa 140 richieste in tutti gli stati negli ultimi 4 mesi;
- 2 mesi già chiusi, con il file paghe;
- il mese scorso ancora aperto.

Le e-mail non partono davvero: si leggono nella **Posta (simulata)** di ciascun utente.

**Per ripartire da zero:** accedi come Amministratore → Amministrazione → Strumenti demo → *Ripristina i dati dimostrativi*.

## Account dimostrativi

Password per tutti: `Demo2026!`

| Account | Ruolo | Cosa mostrare |
|---|---|---|
| giulia.bianchi@demo.societadolce.it | Lavoratore | Richieste in tutti gli stati, una integrazione da completare, una bozza |
| marco.rossi@demo.societadolce.it | Coordinatore (e lavoratore) | Richieste del team da approvare, un duplicato, una ferma da oltre 7 giorni |
| laura.verdi@demo.societadolce.it | Formazione HR | Validazione singola e per perimetro, riepiloghi, chiusura del mese, file paghe |
| paolo.neri@demo.societadolce.it | Amministratore | Organigramma, catalogo, ruoli, riapertura del mese, strumenti demo |
| luca.esposito@demo.societadolce.it | Lavoratore al primo accesso | Completamento obbligatorio del profilo (e-mail di contatto e codice fiscale) |

## Percorso consigliato

1. **Accesso**: nella versione definitiva si entra con l'account Microsoft 365. In demo si usano i pulsanti degli account dimostrativi.
2. **Luca, primo accesso**: l'app chiede e-mail di contatto e codice fiscale, che vengono poi ricordati. Per la prova usare il codice fiscale `RSSMRA80A01A944I`.
3. **Giulia, lavoratore**:
   - la home avvisa della richiesta da integrare, con la nota del coordinatore;
   - in *Inserisci formazione* compilare un corso a catalogo, per esempio BLSD, con gli orari: le ore frequentate si calcolano da sole;
   - provare un errore, per esempio ore richieste superiori alle ore frequentate;
   - allegare un PDF, spuntare le dichiarazioni e premere *Invia al coordinatore*;
   - mostrare il corso esterno nuovo ("Committente o altro soggetto"), con il codice `EXT-…` generato automaticamente.
4. **Marco, coordinatore**:
   - home con le richieste da approvare;
   - *Richieste del team* con i filtri;
   - aprire la richiesta di Giulia, ridurre le ore riconosciute e approvare;
   - respingere un'altra richiesta: la motivazione è obbligatoria;
   - in *Posta* si vedono le e-mail ricevute: nuova richiesta e promemoria.
5. **Laura, HR**:
   - *Validazione HR*: validare una selezione;
   - validare un intero perimetro, per esempio un centro di costo;
   - aprire una richiesta per vedere lo storico delle modifiche;
   - *Riepilogo mensile*: indicatori e totali per coordinatore, servizio, centro di costo e area, con l'esportazione;
   - *Chiusura*: per il mese scorso vedere richieste aperte e anomalie (duplicati, attestati mancanti, codice fiscale mancante, segnalazioni), chiudere il mese, generare e scaricare il file paghe, aprirlo in Excel.
6. **Paolo, amministratore**:
   - cambiare il coordinatore di un lavoratore;
   - validare un corso esterno inserito da un lavoratore;
   - assegnare un ruolo HR;
   - riaprire il mese chiuso indicando il motivo;
   - in *Strumenti demo*, eseguire i promemoria (Flusso 4) e il riepilogo mensile (Flusso 5).
7. **Smartphone**: aprire la stessa pagina da telefono o ridurre la finestra; il menu si apre con ☰.
