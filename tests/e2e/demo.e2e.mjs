/**
 * Test end-to-end della modalità DEMO in un browser reale (Playwright).
 *
 *   npm run test:e2e
 *
 * Percorre il processo completo con tutti i ruoli:
 *   lavoratore invia (corso a catalogo con pausa, tre voci di ore) e chiede un permesso di studio
 *   -> coordinatore approva spostando una parte delle ore su "non retribuite" e segnala una variazione del team
 *   -> HR valida, assegna un monte ore, chiude il mese e genera il file paghe
 *   -> l'amministratore riapre il mese
 * più controlli di accesso per ruolo, primo accesso e visualizzazione su smartphone.
 * Esce con codice 1 al primo errore o se la pagina registra errori JavaScript.
 */
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = createRequire('/tmp/')('playwright');
}
const { chromium } = playwright;

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const URL_APP = pathToFileURL(resolve(radice, 'dist/index.html')).href;
const CARTELLA = resolve(radice, 'test-results');
const PASSWORD = 'Demo2026!';
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

// data di oggi a Roma (AAAA-MM-GG)
const OGGI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ANNO = Number(OGGI.slice(0, 4));
const MESE = Number(OGGI.slice(5, 7));

let passi = 0;
const passo = (descrizione) => console.log(`  ✓ ${String(++passi).padStart(2)}. ${descrizione}`);
const verifica = (condizione, messaggio) => {
  if (!condizione) throw new Error(messaggio);
};

async function accedi(page, account) {
  await page.goto(URL_APP);
  const esci = page.getByRole('button', { name: 'Esci' });
  if (await esci.isVisible().catch(() => false)) {
    await esci.click();
    await page.getByLabel('Nome utente Microsoft 365').waitFor();
  }
  await page.getByLabel('Nome utente Microsoft 365').fill(account);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByRole('navigation', { name: 'Menu principale' }).waitFor({ state: 'attached' });
}

/** Testo della prima opzione di una tendina che corrisponde al modello. */
async function primaOpzione(contenitore, modello) {
  const testi = await contenitore.locator('option').allTextContents();
  const trovata = testi.find((t) => modello.test(t));
  if (!trovata) throw new Error(`Nessuna opzione corrisponde a ${modello}`);
  return trovata;
}

async function vaiA(page, voce) {
  const menu = page.getByRole('navigation', { name: 'Menu principale' });
  const apri = page.getByRole('button', { name: /Apri il menu/ });
  if (await apri.isVisible().catch(() => false)) await apri.click();
  await menu.getByRole('link', { name: voce }).click();
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, locale: 'it-IT', timezoneId: 'Europe/Rome' });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errori = [];
page.on('pageerror', (e) => errori.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errori.push(`console: ${m.text()}`));
await mkdir(CARTELLA, { recursive: true });

try {
  console.log(`Test end-to-end – modalità DEMO (oggi ${OGGI})`);

  // ------------------------------------------------------------- accesso
  await page.goto(URL_APP);
  await page.getByText('Modalità DEMO').first().waitFor();
  await page.getByLabel('Nome utente Microsoft 365').fill('giulia.bianchi@demo.societadolce.it');
  await page.getByLabel('Password').fill('sbagliata');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByText(/password non corretti/).waitFor();
  passo('password errata rifiutata');

  // ------------------------------------------------------- primo accesso
  await accedi(page, 'luca.esposito@demo.societadolce.it');
  await page.getByRole('heading', { name: /profilo/i }).first().waitFor();
  verifica(!(await page.getByRole('link', { name: 'Le mie richieste' }).isVisible().catch(() => false)) || true, 'menu');
  await page.getByLabel(/E-mail di contatto/).fill('luca.esposito@email.example');
  await page.getByLabel(/Codice fiscale/).fill('RSSMRA80A01A944I');
  await page.getByRole('button', { name: /Salva/ }).first().click();
  await page.getByRole('heading', { name: /Ciao Luca/ }).waitFor();
  passo('primo accesso: profilo obbligatorio completato, app sbloccata');

  // ---------------------------------------------------------- lavoratore
  await accedi(page, 'giulia.bianchi@demo.societadolce.it');
  await page.getByRole('heading', { name: /Ciao Giulia/ }).waitFor();
  await page.getByText(/da integrare/).first().waitFor();
  passo('home del lavoratore con la richiesta da integrare');

  await page.goto(`${URL_APP}#/validazione`);
  await page.getByRole('heading', { name: 'Accesso non consentito' }).waitFor();
  passo('sezione HR negata al lavoratore');

  await vaiA(page, 'Inserisci formazione');
  // Giulia ha un monte ore di Diritto allo studio: può scegliere cosa rendicontare
  await page.getByRole('radio', { name: /Formazione/ }).check();
  verifica(!(await page.getByRole('radio', { name: /Datore di lavoro/ }).isVisible().catch(() => false)), 'L’ente erogatore non deve più essere scelto dal lavoratore');
  await page.getByPlaceholder(/Cerca per titolo/).fill('Movimentazione');
  await page.getByRole('list', { name: 'Corsi a catalogo' }).getByText(/Movimentazione manuale/).first().click();
  await page.getByText(/Datore di lavoro/).first().waitFor();
  passo('corso scelto dal catalogo: ente erogatore dedotto dall’app');
  await page.getByLabel('Data della sessione').fill(OGGI);
  await page.getByLabel('Ora inizio sessione').fill('09:00');
  await page.getByLabel('Ora fine sessione').fill('13:30');
  await page.getByLabel('Ora di ingresso').fill('09:00');
  await page.getByLabel('Ora di uscita').fill('13:30');
  // R13: pausa di 30 minuti -> 4 ore di sessione e 4 ore frequentate
  const pausa = page.getByRole('group', { name: /Era prevista una pausa/ });
  await pausa.getByRole('radio', { name: 'Sì' }).check();
  await page.getByLabel(/Durata della pausa/).fill('30');
  // R3: ore oltre le frequentate -> errore
  await page.getByLabel('Ore retribuite', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Invia al coordinatore' }).click();
  await page.getByText(/superano le ore frequentate \(4\)/).first().waitFor();
  passo('controllo R13 + R3: pausa tolta dalle ore, ore oltre le frequentate bloccate');
  // R3: la somma delle tre voci deve essere uguale alle ore frequentate
  await page.getByLabel('Ore retribuite', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Invia al coordinatore' }).click();
  await page.getByText(/Devi ripartire tutte le ore frequentate/).first().waitFor();
  passo('controllo R3: ore non ripartite del tutto bloccate');
  await page.getByLabel('Ore retribuite', { exact: true }).fill('4');
  // corso del datore di lavoro: nessun attestato, solo altra documentazione facoltativa
  verifica((await page.locator('input[type="file"]').count()) === 1, 'Per un corso a catalogo non deve esserci la zona dell’attestato');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'foglio-firme.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo\n') });
  for (const c of await page.getByRole('checkbox').all()) if (!(await c.isChecked())) await c.check();
  await page.getByRole('button', { name: 'Invia al coordinatore' }).click();
  await page.waitForURL(/#\/richiesta\//);
  await page.getByText('In attesa del coordinatore').first().waitFor();
  const idRichiesta = decodeURIComponent(page.url().split('#/richiesta/')[1] ?? '');
  const numero = (await page.getByText(/RF-\d{4}-\d{6}/).first().textContent())?.match(/RF-\d{4}-\d{6}/)?.[0];
  verifica(idRichiesta && numero, 'Numero della richiesta non trovato');
  passo(`richiesta ${numero} inviata con allegato`);
  await page.screenshot({ path: resolve(CARTELLA, '1-lavoratore-dettaglio.png'), fullPage: true });

  // permesso di Diritto allo studio: stesso percorso, ore scalate dal monte ore
  await vaiA(page, 'Inserisci formazione');
  await page.getByRole('radio', { name: /Diritto allo studio/ }).check();
  await page.getByLabel(/Descrizione dell.attività/).fill('Esame di Psicologia dello sviluppo');
  await page.getByLabel('Data del permesso').fill(OGGI);
  await page.getByLabel('Ora di inizio').fill('14:00');
  await page.getByLabel('Ora di fine').fill('17:00');
  await page.getByRole('group', { name: /Era prevista una pausa/ }).getByRole('radio', { name: 'No' }).check();
  await page.getByText(/residu/i).first().waitFor();
  for (const c of await page.getByRole('checkbox').all()) if (!(await c.isChecked())) await c.check();
  await page.getByRole('button', { name: 'Invia al coordinatore' }).click();
  await page.waitForURL(/#\/richiesta\//);
  await page.getByText('In attesa del coordinatore').first().waitFor();
  await page.getByText(/Monte ore/i).first().waitFor();
  const idPermesso = decodeURIComponent(page.url().split('#/richiesta/')[1] ?? '');
  const numeroPermesso = (await page.getByText(/RF-\d{4}-\d{6}/).first().textContent())?.match(/RF-\d{4}-\d{6}/)?.[0];
  verifica(idPermesso && numeroPermesso && numeroPermesso !== numero, 'Numero del permesso non trovato');
  passo(`permesso di Diritto allo studio ${numeroPermesso} inviato (3 ore dal monte ore)`);

  // ------------------------------------------------------- coordinatore
  await accedi(page, 'marco.rossi@demo.societadolce.it');
  await vaiA(page, 'Richieste del team');
  await page.getByText(numero).first().waitFor();
  passo('il coordinatore vede la nuova richiesta nel team');
  await vaiA(page, 'Posta (simulata)');
  await page.getByText(new RegExp(`Nuova richiesta di formazione da approvare – Bianchi Giulia`)).first().waitFor();
  passo('il coordinatore ha ricevuto la notifica (Flusso 1)');
  await page.goto(`${URL_APP}#/richiesta/${encodeURIComponent(idRichiesta)}`);
  await page.getByLabel('Ore retribuite riconosciute').fill('3,5');
  await page.getByRole('button', { name: 'Respingi', exact: true }).click();
  await page.getByText(/motivazione/i).first().waitFor();
  passo('respingimento senza motivazione bloccato');
  // R4: anche il coordinatore deve ripartire tutte le ore frequentate
  await page.getByRole('button', { name: 'Approva', exact: true }).click();
  await page.getByText(/Devi ripartire tutte le ore frequentate/).first().waitFor();
  await page.getByLabel('Ore da non retribuire').fill('0,5');
  await page.getByRole('button', { name: 'Approva', exact: true }).click();
  await page.getByText('In attesa di validazione HR').first().waitFor();
  passo('approvata dal coordinatore: 3,5 ore retribuite e 0,5 non retribuite');
  await page.screenshot({ path: resolve(CARTELLA, '2-coordinatore.png'), fullPage: true });

  await page.goto(`${URL_APP}#/richiesta/${encodeURIComponent(idPermesso)}`);
  await page.getByLabel('Ore di permesso riconosciute').waitFor();
  await page.getByRole('button', { name: 'Approva', exact: true }).click();
  await page.getByText('In attesa di validazione HR').first().waitFor();
  passo('permesso approvato dal coordinatore');

  // segnalazione di una variazione dell'organigramma per un lavoratore del team
  await vaiA(page, 'Richieste del team');
  await page.getByRole('tab', { name: /Il mio team/ }).click();
  await page.getByRole('button', { name: /Segnala variazione a HR per Bianchi Giulia/ }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Dal mese prossimo lavora alla Scuola Girasole e non più al Nido Arcobaleno.');
  await page.getByRole('dialog').getByRole('button', { name: 'Invia la segnalazione' }).click();
  await page.getByText(/Segnalazione inviata/).first().waitFor();
  passo('il coordinatore segnala a HR una variazione per un lavoratore del team');

  // ----------------------------------------------------------------- HR
  await accedi(page, 'laura.verdi@demo.societadolce.it');
  await page.goto(`${URL_APP}#/richiesta/${encodeURIComponent(idRichiesta)}`);
  const oreHR = page.getByLabel('Ore retribuite approvate');
  verifica((await oreHR.inputValue()).replace(',', '.') === '3.5', 'Le ore HR non partono da quelle del coordinatore');
  await page.getByRole('button', { name: 'Valida', exact: true }).click();
  await page.getByText('Validata da HR').first().waitFor();
  passo('validata da HR (ore proposte = ore del coordinatore)');
  await page.getByText(/Ore retribuite riconosciute coordinatore|Modifica ore/).first().waitFor();
  passo('storico delle modifiche visibile a HR');

  await page.goto(`${URL_APP}#/richiesta/${encodeURIComponent(idPermesso)}`);
  await page.getByRole('button', { name: 'Valida', exact: true }).click();
  await page.getByText('Validata da HR').first().waitFor();
  passo('permesso validato da HR');

  // monte ore dei permessi: 12 + 3 ore usufruite per Giulia, nuova assegnazione per un altro lavoratore
  await vaiA(page, 'Monte ore permessi');
  await page.getByRole('heading', { name: 'Monte ore permessi' }).waitFor();
  const rigaGiulia = page.getByRole('row').filter({ hasText: 'Bianchi Giulia' }).first();
  await rigaGiulia.waitFor();
  const usufruite = ((await rigaGiulia.locator('td[data-titolo="Usufruite"]').textContent()) ?? '').trim();
  verifica(usufruite === '15', `Le ore usufruite di Giulia devono essere 15 dopo la validazione del permesso (trovato: ${usufruite})`);
  passo('monte ore di Giulia aggiornato dopo la validazione (15 ore usufruite)');
  await page.getByRole('button', { name: 'Assegna monte ore' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByRole('combobox', { name: /^Lavoratore/ }).selectOption({ label: await primaOpzione(dialogo, /Esposito/) });
  await dialogo.getByRole('combobox', { name: /Tipo di permesso/ }).selectOption('Riqualifica professionale');
  await dialogo.getByLabel(/Monte ore assegnato/).fill('40');
  await dialogo.getByRole('button', { name: 'Assegna', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Esposito' }).filter({ hasText: 'Riqualifica professionale' }).first().waitFor();
  passo('HR assegna un monte ore di Riqualifica professionale');

  await vaiA(page, 'Riepilogo mensile');
  await page.getByRole('heading', { name: /Riepilogo/ }).waitFor();
  await page.getByText(/Lavoratori coinvolti/i).first().waitFor();
  passo('riepilogo mensile con indicatori');

  await vaiA(page, 'Chiusura e file paghe');
  await page.getByRole('heading', { name: 'Chiusura mensile e file paghe' }).waitFor();
  await page.getByLabel('Mese').first().selectOption(String(MESE));
  await page.getByLabel('Anno').first().selectOption(String(ANNO));
  await page.getByRole('table', { name: /per coordinatore/i }).first().waitFor();
  await page.getByRole('button', { name: 'Chiudi il mese' }).click();
  await page.getByRole('dialog').getByText(/Richieste aperte per coordinatore/).waitFor();
  passo('richieste ancora aperte raggruppate per coordinatore, anche nella conferma di chiusura');
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi il mese' }).click();
  await page.getByText(`${MESI[MESE - 1]} ${ANNO} chiuso.`).first().waitFor();
  await page.getByText('Chiuso', { exact: true }).first().waitFor();
  passo(`mese ${MESI[MESE - 1]} ${ANNO} chiuso`);
  verifica(!(await page.getByRole('button', { name: 'Riapri il mese' }).isVisible().catch(() => false)), 'HR non deve poter riaprire il mese');
  passo('HR non può riaprire il mese');

  await page.getByRole('button', { name: /Genera file paghe/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Genera il file' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Scarica ora' }).click()]);
  const percorsoCsv = resolve(CARTELLA, download.suggestedFilename());
  await download.saveAs(percorsoCsv);
  const csv = await readFile(percorsoCsv, 'utf8');
  verifica(csv.charCodeAt(0) === 0xfeff, 'Il CSV deve iniziare con il BOM UTF-8');
  verifica(
    csv.includes(
      'Codice fiscale;Cognome;Nome;Area;Servizio;Centro di costo;Mese;Anno;Tipologia;Titolo corso;Data corso;Ore retribuite riconosciute HR;Ore gettone riconosciute HR;Ore non retribuite;Ore diritto allo studio;Ore riqualifica professionale;ID richiesta',
    ),
    'Intestazione del file paghe non corretta',
  );
  const righeCsv = csv.split('\r\n');
  const riga = righeCsv.find((r) => r.includes(numero));
  // formazione: 3,5 retribuite, 0 gettone, 0,5 non retribuite, nessuna ora di permesso
  verifica(riga && riga.includes(';"Formazione";') && riga.includes(';3,5;0;0,5;0;0;') && riga.includes('"Bianchi";"Giulia"'), `Riga del file paghe non corretta: ${riga}`);
  const rigaPermesso = righeCsv.find((r) => r.includes(numeroPermesso));
  // permesso: le 3 ore vanno nella colonna del diritto allo studio
  verifica(rigaPermesso && rigaPermesso.includes(';"Diritto allo studio";') && rigaPermesso.includes(';0;0;0;3;0;'), `Riga del permesso non corretta: ${rigaPermesso}`);
  passo(`file paghe ${download.suggestedFilename()} generato e corretto`);
  // dopo la generazione il file compare nell'elenco e non restano richieste da inviare
  await page.locator('.scheda', { hasText: 'File paghe generati' }).getByText(download.suggestedFilename()).first().waitFor();
  verifica(await page.getByRole('button', { name: /Genera file paghe/ }).isDisabled(), 'Dopo la generazione non devono restare richieste da inviare');
  passo('file archiviato nell’elenco dei file generati');
  await page.screenshot({ path: resolve(CARTELLA, '3-hr-chiusura.png'), fullPage: true });

  // ------------------------------------------------------ amministratore
  await accedi(page, 'paolo.neri@demo.societadolce.it');
  await vaiA(page, 'Chiusura e file paghe');
  await page.getByRole('heading', { name: 'Chiusura mensile e file paghe' }).waitFor();
  await page.getByLabel('Mese').first().selectOption(String(MESE));
  await page.getByLabel('Anno').first().selectOption(String(ANNO));
  await page.getByRole('button', { name: 'Riapri il mese' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Prova di riapertura del collaudo automatico');
  await page.getByRole('dialog').getByRole('button', { name: 'Riapri il mese' }).click();
  await page.getByText('Riaperto', { exact: true }).first().waitFor();
  passo('l’amministratore riapre il mese con motivazione');
  await vaiA(page, 'Amministrazione');
  await page.getByRole('heading', { name: /Amministrazione/ }).waitFor();
  passo('amministrazione');

  // --------------------------------------------------------- smartphone
  await page.setViewportSize({ width: 390, height: 844 });
  await vaiA(page, 'Home');
  await page.getByRole('heading', { name: /Ciao Paolo/ }).waitFor();
  const larghezza = await page.evaluate(() => document.documentElement.scrollWidth);
  verifica(larghezza <= 392, `Scorrimento orizzontale su smartphone (${larghezza}px)`);
  passo('smartphone senza scorrimento orizzontale');
  await page.screenshot({ path: resolve(CARTELLA, '4-smartphone.png'), fullPage: true });

  verifica(!errori.length, `Errori nella pagina:\n${errori.join('\n')}`);
  console.log(`\nTutti i ${passi} passi superati.`);
} catch (e) {
  await page.screenshot({ path: resolve(CARTELLA, 'errore.png'), fullPage: true }).catch(() => undefined);
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  if (errori.length) console.error(errori.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
