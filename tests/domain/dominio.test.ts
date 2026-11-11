import { describe, expect, it } from 'vitest';
import {
  azioniConsentite,
  calcolaKPI,
  calcolaOre,
  carattereControlloCF,
  consumoMonteOre,
  festivitaItaliane,
  generaCsvPaghe,
  giorniLavorativiTrascorsi,
  isCodiceFiscaleValido,
  oreTra,
  pasqua,
  puoVedereRichiesta,
  statoDopo,
  trovaDuplicati,
  validaCorrezioneCorso,
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
  tipologia: 'Formazione', ente: 'Datore di lavoro', corsoId: 'c1', dataSessione: '2026-10-14',
  oraInizioSessione: '09:00', oraFineSessione: '13:00', oraIngresso: '09:00', oraUscita: '12:30',
  pausaPrevista: false, pausaMinuti: 0, pausaInPresenza: true,
  oreRetribuiteRichieste: 3.5, oreGettoneRichieste: 0, oreNonRetribuiteRichieste: 0,
  dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true }, ...x,
});

const permesso = (x: Partial<DatiRichiestaInput> = {}): DatiRichiestaInput =>
  input({ tipologia: 'Diritto allo studio', ente: undefined, corsoId: undefined, descrizioneAttivita: 'Esame di Pedagogia', oraUscita: '13:00', oreRetribuiteRichieste: 0, ...x });

const ctx = (x: Partial<ContestoValidazione> = {}): ContestoValidazione => ({
  login: 'giulia@x', corso: corsoCatalogo, altreRichieste: [], meseChiuso: () => false,
  coordinatoreLogin: 'marco@x', profiloCompleto: true, oggi: '2026-11-03', ...x,
});

const richiesta = (x: Partial<Richiesta> = {}): Richiesta => ({
  id: 'r1', numero: 'RF-2026-000001', tipologia: 'Formazione', pausaPrevista: false, pausaMinuti: 0, pausaInPresenza: false, oreNonRetribuiteRichieste: 0, lavoratoreId: 'l1', login: 'giulia@x', cognome: 'Bianchi', nome: 'Giulia',
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
  it('R3 per l’invio le tre voci devono sommare esattamente alle ore frequentate', () => {
    const c = ctx({ corso: { ...corsoCatalogo, gettonePrevisto: true } });
    // 2 + 1 = 3 su 3,5 frequentate: bozza sì, invio no
    const parziale = input({ oreRetribuiteRichieste: 2, oreGettoneRichieste: 1 });
    expect(validaRichiesta(parziale, c, false)).toEqual([]);
    expect(validaRichiesta(parziale, c, true).some((x) => x.messaggio.includes('ne mancano 0.5'))).toBe(true);
    // con la terza voce (ore da non retribuire) la somma torna
    expect(validaRichiesta(input({ oreRetribuiteRichieste: 2, oreGettoneRichieste: 1, oreNonRetribuiteRichieste: 0.5 }), c, true)).toEqual([]);
    // sola registrazione: tutte le ore non retribuite
    expect(validaRichiesta(input({ oreRetribuiteRichieste: 0, oreNonRetribuiteRichieste: 3.5 }), c, true)).toEqual([]);
  });
  it('R13 pausa: si toglie da durata della sessione e ore frequentate', () => {
    const giornata = { oraInizioSessione: '09:00', oraFineSessione: '18:00', oraIngresso: '09:00', oraUscita: '18:00', pausaPrevista: true, pausaMinuti: 60, pausaInPresenza: true };
    expect(calcolaOre(giornata)).toMatchObject({ durataSessione: 8, oreFrequentate: 8 });
    // uscita prima della pausa: la pausa non si toglie dalle ore frequentate
    expect(calcolaOre({ ...giornata, oraUscita: '11:00', pausaInPresenza: false })).toMatchObject({ durataSessione: 8, oreFrequentate: 2 });
    // presenza uguale alla sessione: la pausa si toglie sempre
    expect(calcolaOre({ ...giornata, pausaInPresenza: false }).oreFrequentate).toBe(8);
    const c = ctx({ corso: { ...corsoCatalogo, durataOre: 8 } });
    expect(validaRichiesta(input({ ...giornata, oreRetribuiteRichieste: 8 }), c, true)).toEqual([]);
    expect(validaRichiesta(input({ ...giornata, pausaMinuti: 0, oreRetribuiteRichieste: 8 }), c, false).some((x) => x.campo === 'pausaMinuti')).toBe(true);
    expect(validaRichiesta(input({ ...giornata, pausaMinuti: 600, oreRetribuiteRichieste: 8 }), c, false).some((x) => x.campo === 'pausaMinuti')).toBe(true);
  });
  it('R14 permessi: monte ore obbligatorio, periodo di validità, blocco a esaurimento', () => {
    const monte = { oreResidue: 6, validoDal: '2026-01-01', validoAl: '2026-12-31' };
    expect(validaRichiesta(permesso(), ctx({ corso: null, monteOre: monte }), true)).toEqual([]);
    expect(validaRichiesta(permesso(), ctx({ corso: null, monteOre: null }), false).some((x) => x.campo === 'tipologia')).toBe(true);
    expect(validaRichiesta(permesso(), ctx({ corso: null, monteOre: { ...monte, oreResidue: 3 } }), false).some((x) => x.messaggio.includes('ne restano 3'))).toBe(true);
    expect(validaRichiesta(permesso(), ctx({ corso: null, monteOre: { ...monte, oreResidue: 0 } }), false).some((x) => x.messaggio.includes('esaurito'))).toBe(true);
    expect(validaRichiesta(permesso(), ctx({ corso: null, monteOre: { ...monte, validoDal: '2026-11-01' } }), false).some((x) => x.campo === 'dataSessione')).toBe(true);
    expect(validaRichiesta(permesso({ descrizioneAttivita: '' }), ctx({ corso: null, monteOre: monte }), false).some((x) => x.campo === 'descrizioneAttivita')).toBe(true);
  });
  it('monte ore: usufruite, impegnate e residue', () => {
    const m = { id: 'mo1', oreTotali: 40 };
    const p = (x: Partial<Richiesta>) => richiesta({ tipologia: 'Diritto allo studio', monteOreId: 'mo1', codiceCorso: '', ...x });
    const richieste = [
      p({ id: 'a', stato: 'Inviata a Payroll', oreRetribuiteRichieste: 8, oreRetribuiteCoord: 8, oreRetribuiteHR: 6 }),
      p({ id: 'b', stato: 'In attesa di validazione HR', oreRetribuiteRichieste: 4, oreRetribuiteCoord: 3 }),
      p({ id: 'c', stato: 'In attesa del coordinatore', oreRetribuiteRichieste: 4 }),
      p({ id: 'd', stato: 'Respinta da HR', oreRetribuiteRichieste: 8 }),
      p({ id: 'e', stato: 'Bozza', oreRetribuiteRichieste: 8 }),
      richiesta({ id: 'f', monteOreId: 'altro' }),
    ];
    expect(consumoMonteOre(m, richieste)).toEqual({ oreUsufruite: 6, oreImpegnate: 7, oreResidue: 27 });
    expect(consumoMonteOre(m, richieste, 'c').oreResidue).toBe(31);
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
  it('R4 ore riconosciute: somma uguale alle frequentate; motivazione obbligatoria', () => {
    const ore = (retribuite: number, gettone: number, nonRetribuite: number) => ({ retribuite, gettone, nonRetribuite });
    expect(validaDecisione('approva', ore(3, 2, 0), 4, '')).toHaveLength(1); // supera
    expect(validaDecisione('approva', ore(3, 0, 0), 4, '')).toHaveLength(1); // manca un'ora
    expect(validaDecisione('approva', ore(3, 0, 1), 4, '')).toEqual([]);
    expect(validaDecisione('approva', ore(4, 0, 0), 4, '')).toEqual([]);
    expect(validaDecisione('approva', ore(3, 1, 0), 4, '', { gettonePrevisto: false }).some((x) => x.campo === 'oreGettone')).toBe(true);
    expect(validaDecisione('respingi', ore(0, 0, 0), 4, '')).toHaveLength(1);
    expect(validaDecisione('integrazione', ore(0, 0, 0), 4, 'Correggi gli orari')).toEqual([]);
    // permessi: le ore riconosciute non possono superare il monte ore residuo
    expect(validaDecisione('approva', ore(4, 0, 0), 4, '', { oreResidueMonteOre: 3 }).some((x) => x.campo === 'oreRetribuite')).toBe(true);
    expect(validaDecisione('approva', ore(3, 0, 1), 4, '', { oreResidueMonteOre: 3 })).toEqual([]);
  });
  it('correzione del corso esterno da parte del coordinatore', () => {
    const dati = { titolo: 'Pedagogia 0-6', modalita: 'In presenza' as const, durataOre: 8, piuGiornate: true };
    expect(validaCorrezioneCorso(dati, 8)).toEqual([]);
    expect(validaCorrezioneCorso({ ...dati, titolo: 'x' }, 0).some((x) => x.campo === 'titolo')).toBe(true);
    expect(validaCorrezioneCorso({ ...dati, durataOre: 4 }, 8).some((x) => x.campo === 'durataOre')).toBe(true);
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
    expect(a).toEqual({ modifica: false, annulla: false, esitoCoordinatore: false, esitoHR: false, correzioneCorso: false });
  });
  it('il coordinatore può correggere solo i corsi esterni delle richieste che deve approvare', () => {
    const coord = sessione('marco@x', ['coordinatore']);
    expect(azioniConsentite(coord, richiesta({ ente: 'Committente o altro soggetto' }), false).correzioneCorso).toBe(true);
    expect(azioniConsentite(coord, richiesta(), false).correzioneCorso).toBe(false);
    expect(azioniConsentite(coord, richiesta({ ente: 'Committente o altro soggetto', stato: 'Validata da HR' }), false).correzioneCorso).toBe(false);
  });
});

describe('riepilogo, promemoria e paghe', () => {
  it('KPI con conteggio distinto dei lavoratori', () => {
    const k = calcolaKPI([
      richiesta({ id: 'a', stato: 'Validata da HR', oreRetribuiteHR: 3, oreNonRetribuiteHR: 1, approvatoCoordIl: 'x', oreRetribuiteCoord: 4 }),
      richiesta({ id: 'b', oreFrequentate: 2 }),
      richiesta({ id: 'c', login: 'altro@x', stato: 'Annullata' }),
      richiesta({ id: 'd', tipologia: 'Diritto allo studio', stato: 'Validata da HR', oreRetribuiteHR: 4, approvatoCoordIl: 'x', oreRetribuiteCoord: 4 }),
    ]);
    expect(k.lavoratori).toBe(1);
    expect(k.richieste).toBe(3);
    expect(k.oreFrequentate).toBe(10);
    // i permessi non entrano nelle ore retribuite della formazione
    expect(k.oreRetribuiteHR).toBe(3);
    expect(k.oreNonRetribuiteHR).toBe(1);
    expect(k.orePermessiHR).toBe(4);
  });
  it('promemoria a 3 e 5 giorni, HR a 7', () => {
    const r = richiesta({ inviatoIl: '2026-10-23T17:00:00Z' }); // venerdì
    expect(valutaPromemoria(r, '2026-10-28').promemoria).toEqual([3]);
    expect(valutaPromemoria({ ...r, promemoriaInviati: [3] }, '2026-10-30').promemoria).toEqual([5]);
    expect(valutaPromemoria({ ...r, promemoriaInviati: [3, 5] }, '2026-11-03').segnalaHR).toBe(true);
  });
  it('CSV paghe: BOM, separatore, decimali italiani, protezione formule', () => {
    const csv = generaCsvPaghe([
      { codiceFiscale: 'X', cognome: 'D"Amico', nome: '=SOMMA(1)', area: 'Area Centro', servizio: 'S', centroDiCosto: 'C', mese: 10, anno: 2026, tipologia: 'Formazione', titoloCorso: 'T; 1', dataCorso: '2026-10-14', oreRetribuite: 3.5, oreGettone: 0, oreNonRetribuite: 0.5, oreDirittoStudio: 0, oreRiqualifica: 0, idRichiesta: 'RF-1' },
    ]);
    expect(csv.split('\r\n')[0]).toContain('Tipologia;Titolo corso;Data corso;Ore retribuite riconosciute HR;Ore gettone riconosciute HR;Ore non retribuite;Ore diritto allo studio;Ore riqualifica professionale;ID richiesta');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const riga = csv.split('\r\n')[1]!;
    expect(riga).toContain('"D""Amico"');
    expect(riga).toContain(`"'=SOMMA(1)"`);
    expect(riga).toContain('"T; 1"');
    expect(riga).toContain(';14/10/2026;3,5;0;0,5;0;0;');
  });
});
