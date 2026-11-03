import { beforeEach, describe, expect, it } from 'vitest';
import { ErroreApi, type SalvaRichiestaInput } from '../../src/data/api';
import { BackendDemo } from '../../src/data/demo/backend-demo';
import { ACCOUNT_DEMO, PASSWORD_DEMO } from '../../src/data/demo/seed';
import { ArchivioFileMemoria, PersistenzaMemoria, SessioneMemoria } from '../../src/data/demo/store';

const ADESSO = new Date('2026-11-03T10:00:00Z');
const [GIULIA, MARCO, LAURA, PAOLO, LUCA] = ACCOUNT_DEMO.map((a) => a.login) as [string, string, string, string, string];

let be: BackendDemo;
const come = (login: string) => be.accedi({ login, password: PASSWORD_DEMO });

const nuova = (x: Partial<SalvaRichiestaInput> = {}): SalvaRichiestaInput => ({
  ente: 'Datore di lavoro',
  corsoId: 'c5', // AI-L2-08, 8 ore, gettone previsto
  dataSessione: '2026-11-02',
  oraInizioSessione: '09:00',
  oraFineSessione: '17:00',
  oraIngresso: '09:00',
  oraUscita: '17:00',
  oreRetribuiteRichieste: 6,
  oreGettoneRichieste: 2,
  dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true },
  allegatiNuovi: [{ tipo: 'Attestato', nome: 'attestato.pdf', mime: 'application/pdf', contenuto: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) }],
  allegatiRimossi: [],
  ...x,
});

async function errore(p: Promise<unknown>): Promise<ErroreApi> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroreApi) return e;
    throw e;
  }
  throw new Error('Nessun errore sollevato');
}

beforeEach(() => {
  be = new BackendDemo({ persistenza: new PersistenzaMemoria(), archivio: new ArchivioFileMemoria(), sessione: new SessioneMemoria(), adesso: () => ADESSO });
});

describe('accesso e ruoli', () => {
  it('account demo con i ruoli attesi', async () => {
    expect((await come(GIULIA)).ruoli).toEqual(['lavoratore']);
    expect((await come(MARCO)).ruoli).toEqual(['lavoratore', 'coordinatore']);
    expect((await come(LAURA)).ruoli).toEqual(['lavoratore', 'hr']);
    expect((await come(PAOLO)).ruoli).toEqual(['lavoratore', 'admin']);
    expect((await come(LUCA)).profiloCompleto).toBe(false);
  });
  it('password errata', async () => {
    expect((await errore(be.accedi({ login: GIULIA, password: 'x' }))).codice).toBe('NON_AUTENTICATO');
  });
});

describe('processo completo', () => {
  it('lavoratore → coordinatore → HR → chiusura → file paghe', async () => {
    await come(GIULIA);
    const r = await be.salvaRichiesta(nuova(), 'invia');
    expect(r.stato).toBe('In attesa del coordinatore');
    expect(r.area).toBe('Area Educativa');
    expect(r.coordinatoreLogin).toBe(MARCO);

    await come(MARCO);
    const team = await be.getRichieste('team');
    expect(team.some((x) => x.id === r.id)).toBe(true);
    expect((await be.getNotifiche()).some((n) => n.richiestaId === r.id && n.flusso === 'F1')).toBe(true);
    const app = await be.decisioneCoordinatore(r.id, { esito: 'approva', oreRetribuite: 5.5, oreGettone: 2 });
    expect(app.stato).toBe('In attesa di validazione HR');

    await come(LAURA);
    const esito = await be.decisioneHR({ esito: 'approva', voci: [{ id: r.id }] });
    expect(esito).toEqual({ elaborate: 1, scartate: [] });
    const det = await be.getDettaglio(r.id);
    expect(det.richiesta.oreRetribuiteHR).toBe(5.5);
    expect(det.storico.some((v) => v.campo === 'Ore retribuite riconosciute coordinatore')).toBe(true);

    await be.chiudiMese(2026, 11);
    // dopo la chiusura il lavoratore non può più inserire richieste nel mese
    await come(GIULIA);
    const err = await errore(be.salvaRichiesta(nuova({ dataSessione: '2026-11-02', corsoId: 'c7', oraFineSessione: '14:00', oraUscita: '14:00', oreRetribuiteRichieste: 5, oreGettoneRichieste: 0 }), 'bozza'));
    expect(err.codice).toBe('VALIDAZIONE');

    await come(LAURA);
    const file = await be.generaFilePaghe(2026, 11);
    expect(file.righe).toBe(1);
    expect(file.contenuto).toContain(r.numero);
    expect(file.contenuto).toContain(';5,5;2;');
    expect((await be.getDettaglio(r.id)).richiesta.stato).toBe('Inviata a Payroll');

    // solo l'amministratore riapre il mese
    expect((await errore(be.riapriMese(2026, 11, 'Errore di imputazione ore'))).codice).toBe('NON_AUTORIZZATO');
    await come(PAOLO);
    expect((await be.riapriMese(2026, 11, 'Errore di imputazione ore')).stato).toBe('Riaperto');
  });

  it('integrazione richiesta dal coordinatore e reinvio', async () => {
    await come(GIULIA);
    const r = await be.salvaRichiesta(nuova(), 'invia');
    await come(MARCO);
    expect((await errore(be.decisioneCoordinatore(r.id, { esito: 'integrazione', oreRetribuite: 0, oreGettone: 0 }))).codice).toBe('VALIDAZIONE');
    await be.decisioneCoordinatore(r.id, { esito: 'integrazione', oreRetribuite: 0, oreGettone: 0, nota: 'Allega il foglio presenze' });
    await come(GIULIA);
    const det = await be.getDettaglio(r.id);
    expect(det.azioni.modifica).toBe(true);
    const r2 = await be.salvaRichiesta({ ...nuova(), id: r.id, allegatiNuovi: [] }, 'invia');
    expect(r2.stato).toBe('In attesa del coordinatore');
    expect(r2.numero).toBe(r.numero);
  });

  it('duplicato: conferma esplicita e segnalazione', async () => {
    await come(GIULIA);
    // corso su più giornate (12 ore, sessioni da 4): il duplicato non supera la durata complessiva
    const sessione = nuova({ corsoId: 'c2', oraFineSessione: '13:00', oraUscita: '13:00', oreRetribuiteRichieste: 4, oreGettoneRichieste: 0 });
    await be.salvaRichiesta(sessione, 'invia');
    const e = await errore(be.salvaRichiesta(sessione, 'invia'));
    expect(e.richiestaConferma).toBe('duplicato');
    const r = await be.salvaRichiesta({ ...sessione, confermaDuplicato: true }, 'invia');
    expect(r.possibileDuplicato).toBe(true);
  });

  it('annullamento consentito solo prima dell’approvazione', async () => {
    await come(GIULIA);
    const r = await be.salvaRichiesta(nuova(), 'invia');
    expect((await be.annullaRichiesta(r.id)).stato).toBe('Annullata');
    const mie = await be.getMieRichieste();
    const validata = mie.find((x) => x.stato === 'Validata da HR')!;
    expect((await errore(be.annullaRichiesta(validata.id))).codice).toBe('CONFLITTO');
  });
});

describe('sicurezza', () => {
  it('il lavoratore non accede alle funzioni di coordinatore e HR', async () => {
    await come(GIULIA);
    expect((await errore(be.getRichieste('tutte'))).codice).toBe('NON_AUTORIZZATO');
    expect((await errore(be.getRichieste('team'))).codice).toBe('NON_AUTORIZZATO');
    expect((await errore(be.getAnagrafiche())).codice).toBe('NON_AUTORIZZATO');
  });
  it('il lavoratore non vede le richieste altrui', async () => {
    await come(MARCO);
    const altrui = (await be.getRichieste('team'))[0]!;
    await come(GIULIA);
    if (altrui.login !== GIULIA) expect((await errore(be.getDettaglio(altrui.id))).codice).toBe('NON_TROVATO');
  });
  it('il coordinatore vede solo il proprio team e non approva se stesso', async () => {
    await come(LAURA);
    const tutte = await be.getRichieste('tutte');
    const altroTeam = tutte.find((r) => r.coordinatoreLogin !== MARCO && r.login !== MARCO)!;
    const propria = tutte.find((r) => r.login === MARCO && r.stato === 'In attesa del coordinatore')!;
    await come(MARCO);
    expect((await errore(be.getDettaglio(altroTeam.id))).codice).toBe('NON_TROVATO');
    expect((await be.getDettaglio(propria.id)).azioni.esitoCoordinatore).toBe(false);
    expect((await be.getRichieste('team')).every((r) => r.coordinatoreLogin === MARCO && r.login !== MARCO)).toBe(true);
  });
  it('lo storico completo e il codice fiscale sono riservati', async () => {
    await come(GIULIA);
    const mia = (await be.getMieRichieste()).find((r) => r.stato === 'Validata da HR')!;
    const det = await be.getDettaglio(mia.id);
    expect(det.storico.every((v) => v.campo === 'Stato')).toBe(true);
    const profilo = await be.getProfilo();
    expect(profilo.cfMascherato).toMatch(/^\w{3}\*{10}\w{3}$/);
    expect(JSON.stringify(profilo)).not.toMatch(/[A-Z]{6}\d{2}[A-Z]\d{2}A944[A-Z]/);
  });
  it('primo accesso: profilo obbligatorio prima dell’invio', async () => {
    await come(LUCA);
    const e = await errore(be.salvaRichiesta(nuova(), 'invia'));
    expect(e.dettagli.some((d) => d.campo === 'profilo')).toBe(true);
    expect((await errore(be.aggiornaProfilo({ codiceFiscale: 'ABCDEF' }))).codice).toBe('VALIDAZIONE');
    await be.aggiornaProfilo({ emailContatto: 'luca@email.example', codiceFiscale: 'SPSLCU90A01A944' + 'X' }).catch(() => undefined);
    const s = await be.sessioneCorrente();
    expect(s?.ruoli).toContain('lavoratore');
  });
});
