import { describe, expect, it } from 'vitest';
import {
  azioniConsentite,
  calcolaKPI,
  carattereControlloCF,
  festivitaItaliane,
  generaCsvPaghe,
  giorniLavorativiTrascorsi,
  isCodiceFiscaleValido,
  oreTra,
  pasqua,
  puoVedereRichiesta,
  statoDopo,
  trovaDuplicati,
  validaDecisione,
  validaRichiesta,
  valutaPromemoria,
  type ContestoValidazione,
  type Corso,
  type DatiRichiestaInput,
  type Richiesta,
  type Sessione,
} from '../../src/domain';

const corsoCatalogo: Corso = {
  id: 'c1', codice: 'PS-B-12', titolo: 'Primo soccorso', ente: 'Datore di lavoro', modalita: 'In presenza', durataOre: 12,
  gettonePrevisto: false, attivo: true, piuGiornate: true, origine: 'Catalogo aziendale', statoValidazione: 'Validato',
};

const input = (x: Partial<DatiRichiestaInput> = {}): DatiRichiestaInput => ({
  ente: 'Datore di lavoro', corsoId: 'c1', dataSessione: '2026-10-14',
  oraInizioSessione: '09:00', oraFineSessione: '13:00', oraIngresso: '09:00', oraUscita: '12:30',
  oreRetribuiteRichieste: 3.5, oreGettoneRichieste: 0,
  dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true }, ...x,
});

const ctx = (x: Partial<ContestoValidazione> = {}): ContestoValidazione => ({
  login: 'giulia@x', corso: corsoCatalogo, altreRichieste: [], meseChiuso: () => false,
  coordinatoreLogin: 'marco@x', profiloCompleto: true, oggi: '2026-11-03', ...x,
});

const richiesta = (x: Partial<Richiesta> = {}): Richiesta => ({
  id: 'r1', numero: 'RF-2026-000001', lavoratoreId: 'l1', login: 'giulia@x', cognome: 'Bianchi', nome: 'Giulia',
  area: 'Area Educativa', servizio: 'Nido', centroDiCosto: 'ED-1', strutturaId: 's1', coordinatoreLogin: 'marco@x',
  codiceCorso: 'PS-B-12', titoloCorso: 'Primo soccorso', durataCorso: 12, ente: 'Datore di lavoro', modalita: 'In presenza',
  piuGiornate: true, dataSessione: '2026-10-14', oraInizioSessione: '09:00', oraFineSessione: '13:00', durataSessione: 4,
  oraIngresso: '09:00', oraUscita: '13:00', oreFrequentate: 4, oreRetribuiteRichieste: 4, oreGettoneRichieste: 0,
  allegati: [], stato: 'In attesa del coordinatore', creatoIl: '2026-10-14T18:00:00Z', modificatoIl: '2026-10-14T18:00:00Z',
  modificatoDa: 'giulia@x', meseCompetenza: 10, annoCompetenza: 2026,
  dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true },
  possibileDuplicato: false, giorniAttesa: 0, promemoriaInviati: [], segnalataHR: false, ...x,
});

const sessione = (login: string, ruoli: Sessione['ruoli']): Sessione => ({ login, nome: '', cognome: '', ruoli, profiloCompleto: true });

describe('calcoli', () => {
  it('ore tra due orari', () => {
    expect(oreTra('09:00', '12:30')).toBe(3.5);
    expect(oreTra('14:10', '15:00')).toBe(0.83);
  });
  it('Pasqua e festività', () => {
    expect(pasqua(2026)).toBe('2026-04-05');
    expect(pasqua(2027)).toBe('2027-03-28');
    expect(festivitaItaliane(2026).has('2026-04-06')).toBe(true);
    expect(festivitaItaliane(2026, ['10-04']).has('2026-10-04')).toBe(true);
  });
  it('giorni lavorativi esclusi weekend e festivi', () => {
    // lun 26/10 -> mar 03/11: 27,28,29,30 ott, 2 nov, 3 nov (1 nov domenica e festivo)
    expect(giorniLavorativiTrascorsi('2026-10-26', '2026-11-03')).toBe(6);
    expect(giorniLavorativiTrascorsi('2026-12-24', '2026-12-28')).toBe(1);
  });
});

describe('regole della richiesta', () => {
  it('richiesta corretta', () => {
    expect(validaRichiesta(input(), ctx(), true)).toEqual([]);
  });
  it('R1 ora di fine successiva all’inizio', () => {
    const e = validaRichiesta(input({ oraFineSessione: '08:00' }), ctx(), false);
    expect(e.map((x) => x.campo)).toContain('oraFineSessione');
  });
  it('R2 ore frequentate non superiori alla sessione', () => {
    const e = validaRichiesta(input({ oraIngresso: '08:00' }), ctx(), false);
    expect(e.some((x) => x.campo === 'oraUscita')).toBe(true);
  });
  it('R3 ore richieste non superiori alle frequentate', () => {
    const e = validaRichiesta(input({ oreRetribuiteRichieste: 3, oreGettoneRichieste: 1 }), ctx({ corso: { ...corsoCatalogo, gettonePrevisto: true } }), false);
    expect(e.some((x) => x.campo === 'oreRetribuiteRichieste')).toBe(true);
  });
  it('R5 gettone non previsto', () => {
    const e = validaRichiesta(input({ oreRetribuiteRichieste: 2.5, oreGettoneRichieste: 1 }), ctx(), false);
    expect(e.some((x) => x.campo === 'oreGettoneRichieste')).toBe(true);
  });
  it('R6 somma delle sessioni entro la durata del corso', () => {
    const altre = [richiesta({ id: 'a', durataSessione: 4 }), richiesta({ id: 'b', durataSessione: 6, dataSessione: '2026-10-07' })];
    const e = validaRichiesta(input(), ctx({ altreRichieste: altre }), false);
    expect(e.some((x) => x.messaggio.includes('oltre la durata complessiva'))).toBe(true);
    // le richieste respinte non contano
    const ok = validaRichiesta(input(), ctx({ altreRichieste: altre.map((r) => ({ ...r, stato: 'Respinta da HR' as const })) }), false);
    expect(ok).toEqual([]);
  });
  it('R9 mese chiuso', () => {
    const e = validaRichiesta(input(), ctx({ meseChiuso: () => true }), false);
    expect(e.some((x) => x.campo === 'dataSessione')).toBe(true);
  });
  it('R11 dichiarazioni e coordinatore obbligatori per l’invio, non per la bozza', () => {
    const i = input({ dichiarazioni: { partecipazione: false, correttezza: true, autorizzazione: true } });
    expect(validaRichiesta(i, ctx({ coordinatoreLogin: undefined }), false)).toEqual([]);
    const campi = validaRichiesta(i, ctx({ coordinatoreLogin: undefined }), true).map((x) => x.campo);
    expect(campi).toEqual(expect.arrayContaining(['dichiarazioni.partecipazione', 'coordinatore']));
  });
  it('data nel futuro non ammessa', () => {
    expect(validaRichiesta(input({ dataSessione: '2026-12-01' }), ctx(), false).some((x) => x.campo === 'dataSessione')).toBe(true);
  });
  it('corso esterno nuovo richiede titolo e durata', () => {
    const e = validaRichiesta(
      input({ ente: 'Committente o altro soggetto', corsoId: undefined, nuovoCorso: { titolo: '', modalita: 'In presenza', durataOre: 0, piuGiornate: false } }),
      ctx({ corso: null }),
      false,
    );
    expect(e.map((x) => x.campo)).toEqual(expect.arrayContaining(['nuovoCorso.titolo', 'nuovoCorso.durataOre']));
  });
  it('R7 duplicati', () => {
    const tutte = [richiesta({ id: 'a' }), richiesta({ id: 'b', stato: 'Annullata' }), richiesta({ id: 'c', stato: 'Bozza' })];
    expect(trovaDuplicati({ login: 'giulia@x', codiceCorso: 'PS-B-12', dataSessione: '2026-10-14', id: 'nuova' }, tutte).map((r) => r.id)).toEqual(['a']);
  });
  it('R4 ore riconosciute e motivazione obbligatoria', () => {
    expect(validaDecisione('approva', 3, 2, 4, '')).toHaveLength(1);
    expect(validaDecisione('approva', 4, 0, 4, '')).toEqual([]);
    expect(validaDecisione('respingi', 0, 0, 4, '')).toHaveLength(1);
    expect(validaDecisione('integrazione', 0, 0, 4, 'Allega attestato')).toEqual([]);
  });
  it('codice fiscale', () => {
    const base = 'RSSMRA80A01A944';
    expect(isCodiceFiscaleValido(base + carattereControlloCF(base))).toBe(true);
    expect(isCodiceFiscaleValido(base + 'Z')).toBe(carattereControlloCF(base) === 'Z');
    expect(isCodiceFiscaleValido('ABC')).toBe(false);
  });
});

describe('stati e permessi', () => {
  it('transizioni', () => {
    expect(statoDopo('Bozza', 'invia')).toBe('Inviata al coordinatore');
    expect(statoDopo('Validata da HR', 'annulla')).toBeNull();
    expect(statoDopo('In attesa di validazione HR', 'validaHR')).toBe('Validata da HR');
  });
  it('il lavoratore vede solo le proprie richieste', () => {
    expect(puoVedereRichiesta(sessione('giulia@x', ['lavoratore']), richiesta())).toBe(true);
    expect(puoVedereRichiesta(sessione('altro@x', ['lavoratore']), richiesta())).toBe(false);
  });
  it('il coordinatore vede solo i propri lavoratori e non le bozze', () => {
    expect(puoVedereRichiesta(sessione('marco@x', ['coordinatore']), richiesta())).toBe(true);
    expect(puoVedereRichiesta(sessione('chiara@x', ['coordinatore']), richiesta())).toBe(false);
    expect(puoVedereRichiesta(sessione('marco@x', ['coordinatore']), richiesta({ stato: 'Bozza' }))).toBe(false);
  });
  it('nessuno approva le proprie richieste', () => {
    const r = richiesta({ login: 'marco@x', coordinatoreLogin: 'marco@x' });
    expect(azioniConsentite(sessione('marco@x', ['lavoratore', 'coordinatore']), r, false).esitoCoordinatore).toBe(false);
    const rHR = richiesta({ login: 'laura@x', stato: 'In attesa di validazione HR' });
    expect(azioniConsentite(sessione('laura@x', ['lavoratore', 'hr']), rHR, false).esitoHR).toBe(false);
  });
  it('mese chiuso blocca ogni modifica', () => {
    const a = azioniConsentite(sessione('giulia@x', ['lavoratore']), richiesta({ stato: 'Bozza' }), true);
    expect(a).toEqual({ modifica: false, annulla: false, esitoCoordinatore: false, esitoHR: false });
  });
});

describe('riepilogo, promemoria e paghe', () => {
  it('KPI con conteggio distinto dei lavoratori', () => {
    const k = calcolaKPI([
      richiesta({ id: 'a', stato: 'Validata da HR', oreRetribuiteHR: 4, approvatoCoordIl: 'x', oreRetribuiteCoord: 4 }),
      richiesta({ id: 'b', oreFrequentate: 2 }),
      richiesta({ id: 'c', login: 'altro@x', stato: 'Annullata' }),
    ]);
    expect(k.lavoratori).toBe(1);
    expect(k.richieste).toBe(2);
    expect(k.oreFrequentate).toBe(6);
    expect(k.oreRetribuiteHR).toBe(4);
  });
  it('promemoria a 3 e 5 giorni, HR a 7', () => {
    const r = richiesta({ inviatoIl: '2026-10-23T17:00:00Z' }); // venerdì
    expect(valutaPromemoria(r, '2026-10-28').promemoria).toEqual([3]);
    expect(valutaPromemoria({ ...r, promemoriaInviati: [3] }, '2026-10-30').promemoria).toEqual([5]);
    expect(valutaPromemoria({ ...r, promemoriaInviati: [3, 5] }, '2026-11-03').segnalaHR).toBe(true);
  });
  it('CSV paghe: BOM, separatore, decimali italiani, protezione formule', () => {
    const csv = generaCsvPaghe([
      { codiceFiscale: 'X', cognome: 'D"Amico', nome: '=SOMMA(1)', area: 'Area Centro', servizio: 'S', centroDiCosto: 'C', mese: 10, anno: 2026, titoloCorso: 'T; 1', dataCorso: '2026-10-14', oreRetribuite: 3.5, oreGettone: 0, idRichiesta: 'RF-1' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const riga = csv.split('\r\n')[1]!;
    expect(riga).toContain('"D""Amico"');
    expect(riga).toContain(`"'=SOMMA(1)"`);
    expect(riga).toContain('"T; 1"');
    expect(riga).toContain(';14/10/2026;3,5;0;');
  });
});
