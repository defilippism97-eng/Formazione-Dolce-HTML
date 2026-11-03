/**
 * Test end-to-end della modalità DEMO in un browser reale (Playwright).
 *
 *   npm run test:e2e
 *
 * Percorre il processo completo: lavoratore -> coordinatore -> HR -> chiusura -> file paghe,
 * più i controlli di accesso per ruolo e la visualizzazione su smartphone.
 * Esce con codice 1 al primo errore o se la pagina registra errori JavaScript.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
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

let passi = 0;
const passo = (descrizione) => console.log(`  ✓ ${++passi}. ${descrizione}`);

async function accedi(page, account) {
  await page.goto(URL_APP);
  const esci = page.getByRole('button', { name: 'Esci' });
  if (await esci.isVisible().catch(() => false)) {
    await esci.click();
  }
  await page.getByLabel('Nome utente Microsoft 365').fill(account);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByRole('navigation', { name: 'Menu principale' }).waitFor();
}

async function vaiA(page, etichettaMenu) {
  const menu = page.getByRole('navigation', { name: 'Menu principale' });
  if (!(await menu.isVisible())) await page.getByRole('button', { name: /Apri il menu/ }).click();
  await menu.getByRole('link', { name: etichettaMenu }).click();
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errori = [];
page.on('pageerror', (e) => errori.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errori.push(`console: ${m.text()}`));
page.on('dialog', (d) => d.accept());
await mkdir(CARTELLA, { recursive: true });

try {
  console.log('Test end-to-end – modalità DEMO');

  // ---------------------------------------------------------------- accesso
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
  passo('primo accesso: profilo obbligatorio');

  // ---------------------------------------------------------- lavoratore
  await accedi(page, 'giulia.bianchi@demo.societadolce.it');
  await page.getByRole('heading', { name: /Ciao Giulia/ }).waitFor();
  await page.getByText(/richiesta da integrare/).waitFor();
  passo('home del lavoratore con integrazione da completare');

  await vaiA(page, 'Le mie richieste');
  await page.getByRole('heading', { name: 'Le mie richieste' }).waitFor();
  const righeIniziali = await page.locator('table.tabella tbody tr').count();
  if (righeIniziali < 5) throw new Error(`Attese almeno 5 richieste, trovate ${righeIniziali}`);
  passo(`elenco delle proprie richieste (${righeIniziali})`);

  // Il lavoratore non accede alle sezioni HR
  await page.goto(`${URL_APP}#/validazione`);
  await page.getByRole('heading', { name: 'Accesso non consentito' }).waitFor();
  passo('sezione HR negata al lavoratore');

  await page.screenshot({ path: resolve(CARTELLA, 'lavoratore.png'), fullPage: true });

  // ------------------------------------------------------- coordinatore
  await accedi(page, 'marco.rossi@demo.societadolce.it');
  await vaiA(page, 'Richieste del team');
  await page.getByRole('heading', { name: /Richieste del team/ }).waitFor();
  passo('richieste del team');
  await page.screenshot({ path: resolve(CARTELLA, 'coordinatore.png'), fullPage: true });

  // ----------------------------------------------------------------- HR
  await accedi(page, 'laura.verdi@demo.societadolce.it');
  await vaiA(page, 'Validazione HR');
  await page.getByRole('heading', { name: /Validazione HR/ }).waitFor();
  passo('validazione HR');
  await vaiA(page, 'Riepilogo mensile');
  await page.getByRole('heading', { name: /Riepilogo/ }).waitFor();
  passo('riepilogo mensile');
  await vaiA(page, 'Chiusura e file paghe');
  await page.getByRole('heading', { name: /Chiusura/ }).first().waitFor();
  passo('chiusura mensile');
  await page.screenshot({ path: resolve(CARTELLA, 'hr.png'), fullPage: true });

  // ------------------------------------------------------ amministratore
  await accedi(page, 'paolo.neri@demo.societadolce.it');
  await vaiA(page, 'Amministrazione');
  await page.getByRole('heading', { name: /Amministrazione/ }).waitFor();
  passo('amministrazione');

  // --------------------------------------------------------- smartphone
  await page.setViewportSize({ width: 390, height: 844 });
  await vaiA(page, 'Home');
  await page.getByRole('heading', { name: /Ciao Paolo/ }).waitFor();
  const larghezza = await page.evaluate(() => document.documentElement.scrollWidth);
  if (larghezza > 392) throw new Error(`Scorrimento orizzontale su smartphone (${larghezza}px)`);
  passo('smartphone senza scorrimento orizzontale');
  await page.screenshot({ path: resolve(CARTELLA, 'smartphone.png'), fullPage: true });

  if (errori.length) throw new Error(`Errori nella pagina:\n${errori.join('\n')}`);
  console.log(`\nTutti i ${passi} passi superati.`);
} catch (e) {
  await page.screenshot({ path: resolve(CARTELLA, 'errore.png'), fullPage: true }).catch(() => undefined);
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  if (errori.length) console.error(errori.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
