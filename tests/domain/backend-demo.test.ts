import { beforeEach, describe, expect, it } from 'vitest';
import { ErroreApi, type SalvaRichiestaInput } from '../../src/data/api';
import { BackendDemo } from '../../src/data/demo/backend-demo';
import { ACCOUNT_DEMO, PASSWORD_DEMO } from '../../src/data/demo/seed';
import { ArchivioFileMemoria, PersistenzaMemoria, SessioneMemoria } from '../../src/data/demo/store';

const ADESSO = new Date('2026-11-03T10:00:00Z');
const [GIULIA, MARCO, LAURA, PAOLO, LUCA] = ACCOUNT_DEMO.map((a) => a.login) as [string, string, string, string, string];

let be: BackendDemo;
const come = (login: string) => be.accedi({ login, password: PASSWORD_DEMO });

const pdf = (tipo: 'Attestato' | 'Altra documentazione') => ({ tipo, nome: 'documento.pdf', mime: 'application/pdf', contenuto: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });

/** Corso a catalogo di una giornata: 09:00-18:00 con un'ora di pausa = 8 ore. */
const nuova = (x: Partial<SalvaRichiestaInput> = {}): SalvaRichiestaInput => ({
  tipologia: 'Formazione',
  corsoId: 'c5', // AI-L2-08, 8 ore, gettone previsto
  dataSessione: '2026-11-02',
  oraInizioSessione: '09:00',
  oraFineSessione: '18:00',
  oraIngresso: '09:00',
  oraUscita: '18:00',
  pausaPrevista: true,
  pausaMinuti: 60,
  pausaInPresenza: true,
  oreRetribuiteRichieste: 5,
  oreGettoneRichieste: 2,
  oreNonRetribuiteRichieste: 1,
  dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true },
  allegatiNuovi: [pdf('Altra documentazione')],
  allegatiRimossi: [],
  ...x,
});

const permessoStudio = (x: Partial<SalvaRichiestaInput> = {}): SalvaRichiestaInput => ({
  tipologia: 'Diritto allo studio',
  descrizioneAttivita: 'Esame di Didattica generale',
  dataSessione: '2026-11-02',
  oraInizioSessione: '09:00',
  oraFineSessione: '13:00',
  oraIngresso: '09:00',
  oraUscita: '13:00',
  pausaPrevista: false,
  pausaMinuti: 0,
  pausaInPresenza: true,
  oreRetribuiteRichieste: 0,
  oreGettoneRichieste: 0,
  oreNonRetribuiteRichieste: 0,
  dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true },
  allegatiNuovi: [],
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
    // ente dedotto dal corso a catalogo; pausa tolta dalle ore
    expect(r.ente).toBe('Datore di lavoro');
    expect(r.durataSessione).toBe(8);
    expect(r.oreFrequentate).toBe(8);

    await come(MARCO);
    const team = await be.getRichieste('team');
    expect(team.some((x) => x.id === r.id)).toBe(true);
    expect((await be.getNotifiche()).some((n) => n.richiestaId === r.id && n.flusso === 'F1')).toBe(true);
    // le tre voci devono sommare alle ore frequentate
    expect((await errore(be.decisioneCoordinatore(r.id, { esito: 'approva', oreRetribuite: 4.5, oreGettone: 2, oreNonRetribuite: 1 }))).codice).toBe('VALIDAZIONE');
    const app = await be.decisioneCoordinatore(r.id, { esito: 'approva', oreRetribuite: 4.5, oreGettone: 2, oreNonRetribuite: 1.5 });
    expect(app.stato).toBe('In attesa di validazione HR');

    await come(LAURA);
    const esito = await be.decisioneHR({ esito: 'approva', voci: [{ id: r.id }] });
    expect(esito).toEqual({ elaborate: 1, scartate: [] });
    const det = await be.getDettaglio(r.id);
    expect(det.richiesta.oreRetribuiteHR).toBe(4.5);
    expect(det.richiesta.oreNonRetribuiteHR).toBe(1.5);
    expect(det.storico.some((v) => v.campo === 'Ore retribuite riconosciute coordinatore')).toBe(true);

    await be.chiudiMese(2026, 11);
    // dopo la chiusura il lavoratore non può più inserire richieste nel mese
    await come(GIULIA);
    const err = await errore(be.salvaRichiesta(nuova({ corsoId: 'c7', oraFineSessione: '14:00', oraUscita: '14:00', pausaPrevista: false, pausaMinuti: 0, oreRetribuiteRichieste: 5, oreGettoneRichieste: 0, oreNonRetribuiteRichieste: 0 }), 'bozza'));
    expect(err.codice).toBe('VALIDAZIONE');

    await come(LAURA);
    const file = await be.generaFilePaghe(2026, 11);
    expect(file.righe).toBe(1);
    expect(file.contenuto).toContain(r.numero);
    expect(file.contenuto).toContain(';4,5;2;1,5;0;0;');
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
    expect((await errore(be.decisioneCoordinatore(r.id, { esito: 'integrazione', oreRetribuite: 0, oreGettone: 0, oreNonRetribuite: 0 }))).codice).toBe('VALIDAZIONE');
    await be.decisioneCoordinatore(r.id, { esito: 'integrazione', oreRetribuite: 0, oreGettone: 0, oreNonRetribuite: 0, nota: 'Allega il foglio presenze' });
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
    const sessione = nuova({ corsoId: 'c2', oraFineSessione: '13:00', oraUscita: '13:00', pausaPrevista: false, pausaMinuti: 0, oreRetribuiteRichieste: 4, oreGettoneRichieste: 0, oreNonRetribuiteRichieste: 0 });
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

describe('nuove logiche', () => {
  it('attestato: non ammesso per i corsi del datore di lavoro, facoltativo per quelli esterni', async () => {
    await come(GIULIA);
    const e = await errore(be.salvaRichiesta(nuova({ allegatiNuovi: [pdf('Attestato')] }), 'bozza'));
    expect(e.dettagli.some((d) => d.campo === 'allegati')).toBe(true);
    const esterno = nuova({
      corsoId: undefined,
      nuovoCorso: { titolo: 'Convegno regionale sui servizi 0-6', modalita: 'In presenza', durataOre: 8, piuGiornate: false, nomeEnte: 'Regione' },
      oreRetribuiteRichieste: 8, oreGettoneRichieste: 0, oreNonRetribuiteRichieste: 0,
    });
    // senza attestato l'invio è consentito
    const r = await be.salvaRichiesta({ ...esterno, allegatiNuovi: [] }, 'invia');
    expect(r.ente).toBe('Committente o altro soggetto');
    expect(r.codiceCorso).toMatch(/^EXT-\d{6}$/);
    expect(r.stato).toBe('In attesa del coordinatore');
  });

  it('il coordinatore corregge titolo e dati del corso esterno prima di approvare', async () => {
    await come(GIULIA);
    const r = await be.salvaRichiesta(
      nuova({ corsoId: undefined, nuovoCorso: { titolo: 'formazione', modalita: 'In presenza', durataOre: 8, piuGiornate: false }, allegatiNuovi: [], oreRetribuiteRichieste: 8, oreGettoneRichieste: 0, oreNonRetribuiteRichieste: 0 }),
      'invia',
    );
    // il lavoratore non può correggere dopo l'invio
    expect((await errore(be.correggiCorso(r.id, { titolo: 'Altro', modalita: 'In presenza', durataOre: 8, piuGiornate: false }))).codice).toBe('NON_AUTORIZZATO');
    await come(MARCO);
    expect((await be.getDettaglio(r.id)).azioni.correzioneCorso).toBe(true);
    const corretta = await be.correggiCorso(r.id, { titolo: 'Pedagogia 0-6: continuità educativa', nomeEnte: 'Comune di Bologna', modalita: 'In presenza', durataOre: 8, piuGiornate: false });
    expect(corretta.titoloCorsoLibero).toBe('Pedagogia 0-6: continuità educativa');
    // il coordinatore rilegge l'ente dal dettaglio: senza, una seconda correzione lo cancellerebbe
    expect((await be.getDettaglio(r.id)).nomeEnteCorso).toBe('Comune di Bologna');
    await come(LAURA);
    const storico = (await be.getDettaglio(r.id)).storico;
    expect(storico.some((v) => v.azione === 'Correzione dati del corso' && v.prima === 'formazione')).toBe(true);
  });

  it('permessi: visibili solo a chi ha il monte ore, scalati e bloccati a esaurimento', async () => {
    // Paolo non ha un monte ore: la richiesta è rifiutata
    await come(PAOLO);
    expect((await be.getProfilo()).monteOre).toEqual([]);
    expect((await errore(be.salvaRichiesta(permessoStudio(), 'bozza'))).dettagli.some((d) => d.campo === 'tipologia')).toBe(true);

    // Giulia ha 150 ore di diritto allo studio
    await come(GIULIA);
    const prima = (await be.getProfilo()).monteOre.find((m) => m.tipo === 'Diritto allo studio')!;
    expect(prima.oreTotali).toBe(150);
    const r = await be.salvaRichiesta(permessoStudio(), 'invia');
    expect(r.oreRetribuiteRichieste).toBe(4);
    expect(r.monteOreId).toBe(prima.id);
    const dopo = (await be.getProfilo()).monteOre.find((m) => m.id === prima.id)!;
    expect(dopo.oreImpegnate).toBe(prima.oreImpegnate + 4);
    expect(dopo.oreResidue).toBe(prima.oreResidue - 4);

    // il coordinatore riconosce 3 ore su 4: l'ora non riconosciuta torna disponibile
    await come(MARCO);
    await be.decisioneCoordinatore(r.id, { esito: 'approva', oreRetribuite: 3, oreGettone: 0, oreNonRetribuite: 1 });
    await come(LAURA);
    await be.decisioneHR({ esito: 'approva', voci: [{ id: r.id }] });
    const monti = await be.getMontiOre();
    const finale = monti.find((m) => m.id === prima.id)!;
    expect(finale.oreUsufruite).toBe(prima.oreUsufruite + 3);
    expect(finale.oreResidue).toBe(prima.oreResidue - 3);
  });

  it('monte ore esaurito: la richiesta è bloccata; HR gestisce i monti ore', async () => {
    await come(LAURA);
    const monti = await be.getMontiOre();
    const sofia = monti.find((m) => m.nominativo === 'Conti Sofia' && m.attivo)!;
    expect(sofia.oreResidue).toBe(4);
    // non si può scendere sotto le ore già usate, né sovrapporre due monti ore dello stesso tipo
    expect((await errore(be.salvaMonteOre({ ...sofia, oreTotali: 10 }))).dettagli.some((d) => d.campo === 'oreTotali')).toBe(true);
    expect((await errore(be.salvaMonteOre({ lavoratoreId: sofia.lavoratoreId, tipo: 'Diritto allo studio', oreTotali: 20, validoDal: '2026-06-01', validoAl: '2026-12-31', attivo: true }))).dettagli.some((d) => d.campo === 'validoDal')).toBe(true);
    // il lavoratore non gestisce i monti ore
    await come(GIULIA);
    expect((await errore(be.getMontiOre())).codice).toBe('NON_AUTORIZZATO');
    // HR attiva la riqualifica professionale a Giulia: da quel momento può rendicontarla
    expect((await errore(be.salvaRichiesta(permessoStudio({ tipologia: 'Riqualifica professionale' }), 'bozza'))).codice).toBe('VALIDAZIONE');
    await come(LAURA);
    await be.salvaMonteOre({ lavoratoreId: (await be.getAnagrafiche()).lavoratori.find((l) => l.login === GIULIA)!.id, tipo: 'Riqualifica professionale', oreTotali: 3, validoDal: '2026-01-01', validoAl: '2026-12-31', attivo: true });
    await come(GIULIA);
    // 4 ore richieste su 3 disponibili: bloccata
    const e = await errore(be.salvaRichiesta(permessoStudio({ tipologia: 'Riqualifica professionale' }), 'invia'));
    expect(e.dettagli.some((d) => d.messaggio.includes('ne restano 3'))).toBe(true);
    const ok = await be.salvaRichiesta(permessoStudio({ tipologia: 'Riqualifica professionale', oraFineSessione: '12:00', oraUscita: '12:00' }), 'invia');
    expect(ok.stato).toBe('In attesa del coordinatore');
    // monte ore esaurito
    const e2 = await errore(be.salvaRichiesta(permessoStudio({ tipologia: 'Riqualifica professionale', dataSessione: '2026-10-30', oraFineSessione: '10:00', oraUscita: '10:00' }), 'invia'));
    expect(e2.dettagli.some((d) => d.messaggio.includes('esaurito'))).toBe(true);
  });

  it('il coordinatore segnala variazioni per sé e per il proprio team, non per altri', async () => {
    await come(MARCO);
    const team = await be.getLavoratoriTeam();
    const elisa = team.find((l) => l.nominativo === 'Costa Elisa')!;
    await be.segnalaVariazione('Dal mese prossimo lavora alla Scuola Girasole.', elisa.id);
    expect((await be.getLavoratoriTeam()).find((l) => l.id === elisa.id)!.segnalazioniAperte).toBe(1);
    const proprio = await be.segnalaVariazione('Coordino anche il nuovo servizio estivo.');
    expect(proprio.segnalazioni[0]!.aperta).toBe(true);
    await come(LAURA);
    const an = await be.getAnagrafiche();
    const seg = an.lavoratori.find((l) => l.id === elisa.id)!.segnalazioni[0]!;
    expect(seg.autoreNome).toBe('Marco Rossi');
    const altro = an.lavoratori.find((l) => l.coordinatoreLogin !== MARCO && l.login !== MARCO)!;
    await come(MARCO);
    expect((await errore(be.segnalaVariazione('Variazione non di mia competenza.', altro.id))).codice).toBe('NON_AUTORIZZATO');
  });

  it('chiusura del mese: richieste aperte raggruppate per coordinatore; file paghe con le nuove colonne', async () => {
    await come(LAURA);
    const stato = await be.getStatoMese(2026, 10);
    expect(stato.apertePerCoordinatore.length).toBeGreaterThan(1);
    expect(stato.apertePerCoordinatore.reduce((t, g) => t + g.totale, 0)).toBe(stato.aperte.length);
    expect(stato.anomalie.every((a) => a.tipo !== 'attestatoMancante' || a.gravita === 'bassa')).toBe(true);
    await be.chiudiMese(2026, 10);
    const file = await be.generaFilePaghe(2026, 10);
    const righe = file.contenuto.split('\r\n');
    expect(righe[0]).toContain('Ore non retribuite;Ore diritto allo studio;Ore riqualifica professionale;ID richiesta');
    // il permesso di diritto allo studio di Giulia validato a ottobre: 8 ore nella colonna dedicata
    expect(righe.some((r) => r.includes('"Bianchi";"Giulia"') && r.includes('"Diritto allo studio"') && r.includes(';0;0;0;8;0;'))).toBe(true);
    expect(file.totaleOrePermessi).toBeGreaterThanOrEqual(8);
  });
});

