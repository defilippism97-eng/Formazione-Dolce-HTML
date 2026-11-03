/**
 * Dati simulati della modalità DEMO.
 *
 * Generazione deterministica (stesso risultato a parità di data odierna): organigramma,
 * lavoratori, catalogo, ~4 mesi di richieste in tutti gli stati, chiusure mensili con
 * file paghe, registro delle modifiche e notifiche recenti.
 * Tutti i nomi e i codici fiscali sono INVENTATI.
 */
import {
  aggiungiGiorni,
  arrotonda2,
  calcolaKPI,
  carattereControlloCF,
  dataRomaDaIstante,
  generaCsvPaghe,
  giorniLavorativiTrascorsi,
  isGiornoLavorativo,
  mesePrecedente,
  nomeFilePaghe,
  oreTra,
  periodo as periodoDi,
  righePaghe,
  SOGLIE_PROMEMORIA,
  SOGLIA_SEGNALAZIONE_HR,
} from '../../domain';
import type {
  Area,
  AssegnazioneRuolo,
  ChiusuraMensile,
  Corso,
  DataISO,
  Lavoratore,
  Modalita,
  Notifica,
  Richiesta,
  RuoloRegistro,
  StatoRichiesta,
  Struttura,
  UtenteDirectory,
  VoceRegistro,
} from '../../domain';
import type { AccountDemo } from '../api';
import { messaggi, type Messaggio } from './messaggi';
import { VERSIONE_DATI, type DatiDemo } from './store';

export const DOMINIO = 'demo.societadolce.it';
export const PASSWORD_DEMO = 'Demo2026!';
export const EMAIL_HR = `formazione@${DOMINIO}`;
export const EMAIL_PAGHE = `paghe@${DOMINIO}`;

const login = (nome: string, cognome: string) => `${normalizza(nome)}.${normalizza(cognome)}@${DOMINIO}`;
const emailPersonale = (nome: string, cognome: string) => `${normalizza(nome)}.${normalizza(cognome)}@email.example`;
function normalizza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

export const ACCOUNT_DEMO: AccountDemo[] = [
  { login: login('Giulia', 'Bianchi'), password: PASSWORD_DEMO, ruolo: 'Lavoratore', descrizione: 'Educatrice al Nido Arcobaleno: richieste in tutti gli stati' },
  { login: login('Marco', 'Rossi'), password: PASSWORD_DEMO, ruolo: 'Coordinatore', descrizione: 'Coordina Nido Arcobaleno e Scuola Girasole: richieste da approvare' },
  { login: login('Laura', 'Verdi'), password: PASSWORD_DEMO, ruolo: 'Formazione HR', descrizione: 'Ufficio Formazione: validazione, riepiloghi, chiusura e file paghe' },
  { login: login('Paolo', 'Neri'), password: PASSWORD_DEMO, ruolo: 'Amministratore', descrizione: 'Organigramma, catalogo, ruoli, riapertura dei mesi' },
  { login: login('Luca', 'Esposito'), password: PASSWORD_DEMO, ruolo: 'Lavoratore (primo accesso)', descrizione: 'Nuovo assunto: deve completare il profilo al primo accesso' },
];

// ---------------------------------------------------------------------------
//  Utilità
// ---------------------------------------------------------------------------
function mulberry32(seme: number) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Converte data e ora di Roma in istante UTC ISO. */
export function istanteRoma(data: DataISO, ora: string): string {
  const ipotesi = new Date(`${data}T${ora}:00Z`);
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' })
    .formatToParts(ipotesi)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-]\d+)/.exec(parte ?? '');
  const offsetOre = m ? Number(m[1]) : 1;
  return new Date(ipotesi.getTime() - offsetOre * 3600_000).toISOString();
}

function codiceFiscale(nome: string, cognome: string, sesso: 'M' | 'F', nascita: DataISO): string {
  const consonanti = (s: string) => normalizza(s).toUpperCase().replace(/[AEIOU]/g, '');
  const vocali = (s: string) => normalizza(s).toUpperCase().replace(/[^AEIOU]/g, '');
  const cog = (consonanti(cognome) + vocali(cognome) + 'XXX').slice(0, 3);
  const cn = consonanti(nome);
  const nom = (cn.length >= 4 ? cn[0]! + cn[2]! + cn[3]! : cn + vocali(nome) + 'XXX').slice(0, 3);
  const anno = nascita.slice(2, 4);
  const mese = 'ABCDEHLMPRST'[Number(nascita.slice(5, 7)) - 1] ?? 'A';
  const giorno = String(Number(nascita.slice(8, 10)) + (sesso === 'F' ? 40 : 0)).padStart(2, '0');
  const primi15 = `${cog}${nom}${anno}${mese}${giorno}A944`; // A944 = Bologna
  return primi15 + carattereControlloCF(primi15);
}

// ---------------------------------------------------------------------------
//  Organigramma
// ---------------------------------------------------------------------------
interface Persona {
  nome: string;
  cognome: string;
  sesso: 'M' | 'F';
}

const RESPONSABILI: Record<string, Persona> = {
  gallo: { nome: 'Francesca', cognome: 'Gallo', sesso: 'F' },
  colombo: { nome: 'Andrea', cognome: 'Colombo', sesso: 'M' },
  greco: { nome: 'Sara', cognome: 'Greco', sesso: 'F' },
  fontana: { nome: 'Stefano', cognome: 'Fontana', sesso: 'M' },
};
const COORDINATORI: Record<string, Persona> = {
  rossi: { nome: 'Marco', cognome: 'Rossi', sesso: 'M' },
  romano: { nome: 'Chiara', cognome: 'Romano', sesso: 'F' },
  ricci: { nome: 'Davide', cognome: 'Ricci', sesso: 'M' },
  marino: { nome: 'Elena', cognome: 'Marino', sesso: 'F' },
};
const P = (p: Persona) => login(p.nome, p.cognome);

const STRUTTURE: Array<Omit<Struttura, 'coordinatoreResponsabileLogin' | 'coordinatoreServizioLogin' | 'emailCoordinatoreServizio'> & { resp: Persona; coord: Persona }> = [
  { id: 's1', area: 'Area Educativa', servizio: "Nido d'infanzia Arcobaleno", centroDiCosto: 'ED-NID-01', resp: RESPONSABILI.gallo!, coord: COORDINATORI.rossi!, attiva: true },
  { id: 's2', area: 'Area Educativa', servizio: "Scuola dell'infanzia Girasole", centroDiCosto: 'ED-INF-02', resp: RESPONSABILI.gallo!, coord: COORDINATORI.rossi!, attiva: true },
  { id: 's3', area: 'Area Socio Sanitaria', servizio: 'Casa residenza anziani Villa Serena', centroDiCosto: 'SS-CRA-01', resp: RESPONSABILI.colombo!, coord: COORDINATORI.romano!, attiva: true },
  { id: 's4', area: 'Area Socio Sanitaria', servizio: 'Centro diurno anziani Il Melograno', centroDiCosto: 'SS-CDA-02', resp: RESPONSABILI.colombo!, coord: COORDINATORI.romano!, attiva: true },
  { id: 's5', area: 'Area Centro', servizio: 'Assistenza domiciliare Bologna', centroDiCosto: 'CE-SAD-01', resp: RESPONSABILI.colombo!, coord: COORDINATORI.ricci!, attiva: true },
  { id: 's6', area: 'Area Nord Ovest', servizio: 'Centro socio-riabilitativo Il Faro', centroDiCosto: 'NO-CSR-01', resp: RESPONSABILI.greco!, coord: COORDINATORI.marino!, attiva: true },
  { id: 's7', area: 'Area Staff', servizio: 'Ufficio Formazione e Sviluppo', centroDiCosto: 'ST-FOR-01', resp: RESPONSABILI.fontana!, coord: RESPONSABILI.fontana!, attiva: true },
  { id: 's8', area: 'Area Staff', servizio: 'Sistemi informativi', centroDiCosto: 'ST-SIS-02', resp: RESPONSABILI.fontana!, coord: RESPONSABILI.fontana!, attiva: true },
  { id: 's9', area: 'Area Educativa', servizio: 'Coordinamento pedagogico', centroDiCosto: 'ED-COO-00', resp: RESPONSABILI.gallo!, coord: RESPONSABILI.gallo!, attiva: true },
];

/** [nome, cognome, sesso, struttura, casella aziendale] */
const LAVORATORI: Array<[string, string, 'M' | 'F', string, boolean]> = [
  ['Giulia', 'Bianchi', 'F', 's1', false],
  ['Luca', 'Esposito', 'M', 's1', false],
  ['Sofia', 'Conti', 'F', 's1', false],
  ['Martina', 'Ferrara', 'F', 's1', false],
  ['Valentina', 'De Luca', 'F', 's1', false],
  ['Elisa', 'Costa', 'F', 's2', false],
  ['Federica', 'Rizzo', 'F', 's2', false],
  ['Matteo', 'Lombardi', 'M', 's2', false],
  ['Silvia', 'Moretti', 'F', 's2', false],
  ['Giuseppe', 'Barbieri', 'M', 's3', false],
  ['Anna', 'Santoro', 'F', 's3', false],
  ['Rosa', 'Caruso', 'F', 's3', false],
  ['Antonio', 'Mariani', 'M', 's3', false],
  ['Maria', 'Rinaldi', 'F', 's3', false],
  ['Lucia', 'Ferri', 'F', 's3', false],
  ['Paola', 'Leone', 'F', 's4', false],
  ['Roberto', 'Longo', 'M', 's4', false],
  ['Teresa', 'Gentile', 'F', 's4', false],
  ['Simona', 'Martini', 'F', 's5', false],
  ['Fabio', 'Vitale', 'M', 's5', false],
  ['Ilaria', 'Pellegrini', 'F', 's5', false],
  ['Monica', 'Serra', 'F', 's5', false],
  ['Daniele', 'Bruno', 'M', 's6', false],
  ['Giorgia', 'Galli', 'F', 's6', false],
  ['Nicola', 'Fabbri', 'M', 's6', false],
  ['Beatrice', 'Testa', 'F', 's6', false],
  ['Laura', 'Verdi', 'F', 's7', true],
  ['Cristina', 'Valentini', 'F', 's7', true],
  ['Paolo', 'Neri', 'M', 's8', true],
  ['Michele', 'Grasso', 'M', 's8', true],
  ['Marco', 'Rossi', 'M', 's9', true],
];

// ---------------------------------------------------------------------------
//  Catalogo corsi
// ---------------------------------------------------------------------------
const CATALOGO: Array<[string, string, Modalita, number, boolean, boolean, string, boolean?]> = [
  // codice, titolo, modalità, durata, gettone, più giornate, tipologia, attivo
  ['SIC-GEN-04', 'Formazione generale lavoratori (D.Lgs. 81/08)', 'A distanza - asincrona', 4, false, false, 'Sicurezza sul lavoro'],
  ['SIC-SPE-12', 'Formazione specifica rischio alto', 'In presenza', 12, true, true, 'Sicurezza sul lavoro'],
  ['SIC-AGG-06', 'Aggiornamento quinquennale sicurezza lavoratori', 'A distanza - sincrona', 6, true, false, 'Sicurezza sul lavoro'],
  ['PS-B-12', 'Primo soccorso aziendale – gruppo B', 'In presenza', 12, true, true, 'Sicurezza sul lavoro'],
  ['AI-L2-08', 'Addetti antincendio – livello 2', 'In presenza', 8, true, false, 'Sicurezza sul lavoro'],
  ['HACCP-04', 'HACCP – igiene degli alimenti', 'A distanza - asincrona', 4, false, false, 'Igiene alimentare'],
  ['BLSD-05', 'BLSD – rianimazione e uso del defibrillatore', 'In presenza', 5, true, false, 'Emergenza sanitaria'],
  ['MMC-04', 'Movimentazione manuale dei carichi e dei pazienti', 'In presenza', 4, true, false, 'Sicurezza sul lavoro'],
  ['PRIV-02', 'Privacy e protezione dei dati personali (GDPR)', 'A distanza - asincrona', 2, false, false, 'Normativa'],
  ['COM-08', 'Comunicazione efficace con le famiglie', 'In presenza', 8, true, true, 'Competenze relazionali'],
  ['STR-03', 'Gestione dello stress lavoro-correlato', 'A distanza - sincrona', 3, false, false, 'Benessere organizzativo'],
  ['ECM-OLD-10', 'Aggiornamento clinico 2024 (non più erogato)', 'In presenza', 10, true, true, 'Aggiornamento professionale', false],
];

// ---------------------------------------------------------------------------
//  Testi
// ---------------------------------------------------------------------------
const NOTE_INTEGRAZIONE_COORD = [
  "Allega l'attestato di partecipazione rilasciato dall'ente.",
  "L'ora di uscita non corrisponde al registro presenze: verifica e correggi.",
  'Indica nelle note sede e docente del corso.',
];
const NOTE_RESPINTA_COORD = [
  'Il corso non rientra nel piano formativo del servizio.',
  'La sessione risulta già rendicontata in un’altra richiesta.',
  'Formazione svolta in orario di servizio già retribuito.',
];
const NOTE_INTEGRAZIONE_HR = [
  "Manca l'attestato: caricalo per completare la validazione.",
  'Le ore gettone non sono previste per questo corso: correggi la ripartizione.',
];
const NOTE_RESPINTA_HR = ['Corso non riconosciuto ai fini contrattuali.', 'Ore già riconosciute nel mese precedente.'];

// ---------------------------------------------------------------------------
//  Generatore
// ---------------------------------------------------------------------------
export function creaDatiDemo(adesso: Date = new Date()): DatiDemo {
  const rnd = mulberry32(20261103);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const scegli = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
  const probabile = (p: number) => rnd() < p;
  let contatore = 0;
  const nuovoId = (pref: string) => `${pref}-${(++contatore).toString(36).padStart(4, '0')}`;

  const istanteAdesso = adesso.toISOString();
  const oggi = dataRomaDaIstante(istanteAdesso);
  const annoOggi = Number(oggi.slice(0, 4));
  const meseOggi = Number(oggi.slice(5, 7));

  // --- directory utenti
  const utenti: UtenteDirectory[] = [];
  const aggiungiUtente = (p: Persona, conCasella: boolean) => {
    const l = P(p);
    if (!utenti.some((u) => u.login === l)) {
      utenti.push({ login: l, nome: p.nome, cognome: p.cognome, emailAziendale: conCasella ? l : undefined });
    }
  };
  Object.values(RESPONSABILI).forEach((p) => aggiungiUtente(p, true));
  Object.values(COORDINATORI).forEach((p) => aggiungiUtente(p, true));
  LAVORATORI.forEach(([nome, cognome, sesso, , casella]) => aggiungiUtente({ nome, cognome, sesso }, casella));
  const nomeDi = (l?: string) => {
    const u = utenti.find((x) => x.login === l);
    return u ? `${u.nome} ${u.cognome}` : undefined;
  };

  const strutture: Struttura[] = STRUTTURE.map(({ resp, coord, ...s }) => ({
    ...s,
    coordinatoreResponsabileLogin: P(resp),
    coordinatoreServizioLogin: P(coord),
    emailCoordinatoreServizio: P(coord),
    dataInizioValidita: `${annoOggi - 3}-01-01`,
  }));

  // --- lavoratori
  const lavoratori: Lavoratore[] = LAVORATORI.map(([nome, cognome, sesso, sid, casella], i) => {
    const s = strutture.find((x) => x.id === sid)!;
    const l = login(nome, cognome);
    const nascita = `${1965 + ((i * 7) % 33)}-${String(1 + ((i * 5) % 12)).padStart(2, '0')}-${String(1 + ((i * 11) % 28)).padStart(2, '0')}`;
    const lav: Lavoratore = {
      id: `l${i + 1}`,
      login: l,
      cognome,
      nome,
      emailAziendale: casella ? l : undefined,
      emailContatto: casella ? l : emailPersonale(nome, cognome),
      codiceFiscale: codiceFiscale(nome, cognome, sesso, nascita),
      strutturaId: s.id,
      coordinatoreLogin: s.coordinatoreServizioLogin,
      stato: 'Attivo',
      inizioAssegnazione: `${annoOggi - 1 - (i % 4)}-${String(1 + (i % 12)).padStart(2, '0')}-01`,
      segnalazioni: [],
    };
    return lav;
  });
  const lav = (nome: string, cognome: string) => lavoratori.find((x) => x.login === login(nome, cognome))!;
  // primo accesso: profilo da completare
  Object.assign(lav('Luca', 'Esposito'), { emailContatto: undefined, codiceFiscale: undefined, inizioAssegnazione: aggiungiGiorni(oggi, -10) });
  // codice fiscale mai registrato (anomalia per HR)
  lav('Roberto', 'Longo').codiceFiscale = undefined;
  // lavoratore cessato
  Object.assign(lav('Fabio', 'Vitale'), { stato: 'Non attivo', fineAssegnazione: aggiungiGiorni(oggi, -20) });
  // segnalazione di variazione aperta
  lav('Anna', 'Santoro').segnalazioni.push({
    testo: 'Dal 1° del mese lavoro al Centro diurno Il Melograno e non più alla CRA Villa Serena.',
    data: istanteRoma(aggiungiGiorni(oggi, -2), '19:12'),
    aperta: true,
  });

  // --- ruoli applicativi
  const ruoli: AssegnazioneRuolo[] = [
    { id: 'ru1', login: login('Laura', 'Verdi'), ruolo: 'hr', attivo: true },
    { id: 'ru2', login: login('Cristina', 'Valentini'), ruolo: 'hr', attivo: true },
    { id: 'ru3', login: login('Paolo', 'Neri'), ruolo: 'admin', attivo: true },
  ];

  // --- corsi
  const corsi: Corso[] = CATALOGO.map(([codice, titolo, modalita, durataOre, gettonePrevisto, piuGiornate, tipologia, attivo], i) => ({
    id: `c${i + 1}`,
    codice,
    titolo,
    descrizione: `${titolo}. Corso del piano formativo aziendale.`,
    ente: 'Datore di lavoro',
    nomeEnte: 'Società Dolce',
    tipologia,
    modalita,
    durataOre,
    gettonePrevisto,
    attivo: attivo ?? true,
    piuGiornate,
    origine: 'Catalogo aziendale',
    statoValidazione: 'Validato',
  }));
  const esterni: Array<[string, string, Modalita, number, boolean, string, Corso['statoValidazione']]> = [
    ['Aggiornamento regionale OSS', 'Regione Emilia-Romagna', 'In presenza', 16, true, login('Rosa', 'Caruso'), 'Validato'],
    ['Seminario sui disturbi dello spettro autistico', 'AUSL di Bologna', 'A distanza - sincrona', 6, false, login('Giulia', 'Bianchi'), 'Da validare'],
    ['Convegno "Pedagogia 0-6"', 'Comune di Bologna', 'In presenza', 8, true, login('Giulia', 'Bianchi'), 'Da validare'],
  ];
  esterni.forEach(([titolo, nomeEnte, modalita, durataOre, piuGiornate, autore, statoValidazione], i) =>
    corsi.push({
      id: `ce${i + 1}`,
      codice: `EXT-${String(i + 1).padStart(6, '0')}`,
      titolo,
      ente: 'Committente o altro soggetto',
      nomeEnte,
      modalita,
      durataOre,
      gettonePrevisto: true,
      attivo: true,
      piuGiornate,
      origine: 'Inserito dal lavoratore',
      statoValidazione,
      loginAutore: autore,
    }),
  );
  const corso = (codice: string) => corsi.find((c) => c.codice === codice)!;

  // --- periodi
  const m0 = { anno: annoOggi, mese: meseOggi };
  const m1 = mesePrecedente(m0.anno, m0.mese);
  const m2 = mesePrecedente(m1.anno, m1.mese);
  const m3 = mesePrecedente(m2.anno, m2.mese);
  const chiusi = [m3, m2];

  const giorniLavorativi = (anno: number, mese: number): DataISO[] => {
    const out: DataISO[] = [];
    let d = `${anno}-${String(mese).padStart(2, '0')}-01`;
    while (Number(d.slice(5, 7)) === mese) {
      if (isGiornoLavorativo(d) && d < oggi) out.push(d);
      d = aggiungiGiorni(d, 1);
    }
    return out;
  };
  /** n-esimo giorno lavorativo del mese (o l'ultimo disponibile prima di oggi). */
  const giornoN = (anno: number, mese: number, n: number): DataISO | undefined => {
    const g = giorniLavorativi(anno, mese);
    return g[Math.min(n, g.length - 1)];
  };
  /** Giorno lavorativo `k` giorni lavorativi prima di oggi. */
  const lavorativiFa = (k: number): DataISO => {
    let d = oggi;
    let n = 0;
    while (n < k) {
      d = aggiungiGiorni(d, -1);
      if (isGiornoLavorativo(d)) n++;
    }
    return d;
  };

  const richieste: Richiesta[] = [];
  const registro: VoceRegistro[] = [];
  const notifiche: Notifica[] = [];
  const limiteNotifiche = aggiungiGiorni(oggi, -14);

  const log = (r: Richiesta, data: string, autore: string, ruolo: RuoloRegistro, azione: string, extra: Partial<VoceRegistro> = {}) =>
    registro.push({ id: nuovoId('g'), data, autore, ruolo, azione, entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, ...extra });
  const notifica = (data: string, destinatari: (string | undefined)[], m: Messaggio, richiestaId?: string) => {
    if (dataRomaDaIstante(data) < limiteNotifiche) return;
    const dest = destinatari.filter((x): x is string => !!x);
    if (dest.length) notifiche.push({ id: nuovoId('n'), data, destinatari: dest, richiestaId, ...m });
  };
  /** Istante successivo a `dopo`, entro `giorni` giorni, mai nel futuro. */
  const dopoDi = (dopo: string, giorniMin: number, giorniMax: number, ora: string): string => {
    const candidato = istanteRoma(aggiungiGiorni(dataRomaDaIstante(dopo), int(giorniMin, giorniMax)), ora);
    const limite = new Date(adesso.getTime() - 5 * 60_000).toISOString();
    if (candidato <= dopo) return new Date(new Date(dopo).getTime() + 30 * 60_000).toISOString();
    return candidato < limite ? candidato : new Date((new Date(dopo).getTime() + adesso.getTime()) / 2).toISOString();
  };
  const usati = new Set<string>();

  interface Opzioni {
    oraInizio?: string;
    durata?: number;
    ritardoIngresso?: boolean;
    gettone?: boolean;
    senzaAttestato?: boolean;
    inviatoIl?: string;
    nota?: string;
    oreCoord?: number;
    noteLavoratore?: string;
  }

  const crea = (l: Lavoratore, c: Corso, data: DataISO, stato: StatoRichiesta, o: Opzioni = {}): Richiesta | null => {
    const chiave = `${l.login}|${c.codice}|${data}`;
    if (usati.has(chiave) || data >= oggi) return null;
    usati.add(chiave);
    const s = strutture.find((x) => x.id === l.strutturaId)!;
    const durata = o.durata ?? (c.piuGiornate ? Math.min(c.durataOre, 4) : c.durataOre);
    const oraInizio = o.oraInizio ?? (durata > 5 ? '09:00' : scegli(['08:30', '09:00', '14:00', '14:30']));
    const minutiFine = Number(oraInizio.slice(0, 2)) * 60 + Number(oraInizio.slice(3)) + durata * 60;
    const oraFine = `${String(Math.floor(minutiFine / 60)).padStart(2, '0')}:${String(minutiFine % 60).padStart(2, '0')}`;
    const oraIngresso = o.ritardoIngresso ? `${oraInizio.slice(0, 3)}${String(Number(oraInizio.slice(3)) + 15).padStart(2, '0')}` : oraInizio;
    const durataSessione = oreTra(oraInizio, oraFine);
    const oreFrequentate = oreTra(oraIngresso, oraFine);
    const gettone = (o.gettone ?? (c.gettonePrevisto && probabile(0.35))) && c.gettonePrevisto;
    const creatoIl = istanteRoma(aggiungiGiorni(data, int(0, 2)), `${String(int(17, 21)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`);
    const id = nuovoId('r');
    const r: Richiesta = {
      id,
      numero: `§${id}§`, // segnaposto: il numero definitivo è assegnato in ordine di creazione
      lavoratoreId: l.id,
      login: l.login,
      cognome: l.cognome,
      nome: l.nome,
      emailAziendale: l.emailAziendale,
      emailContatto: l.emailContatto,
      area: s.area,
      servizio: s.servizio,
      centroDiCosto: s.centroDiCosto,
      strutturaId: s.id,
      coordinatoreLogin: l.coordinatoreLogin,
      coordinatoreNome: nomeDi(l.coordinatoreLogin),
      corsoId: c.id,
      codiceCorso: c.codice,
      titoloCorso: c.ente === 'Datore di lavoro' ? c.titolo : '',
      titoloCorsoLibero: c.ente === 'Datore di lavoro' ? undefined : c.titolo,
      durataCorso: c.durataOre,
      ente: c.ente,
      modalita: c.modalita,
      piuGiornate: c.piuGiornate,
      dataSessione: data,
      oraInizioSessione: oraInizio,
      oraFineSessione: oraFine,
      durataSessione,
      oraIngresso,
      oraUscita: oraFine,
      oreFrequentate,
      oreRetribuiteRichieste: gettone ? 0 : oreFrequentate,
      oreGettoneRichieste: gettone ? oreFrequentate : 0,
      allegati: [],
      noteLavoratore: o.noteLavoratore,
      stato: 'Bozza',
      creatoIl: creatoIl < istanteAdesso ? creatoIl : new Date(adesso.getTime() - 3600_000).toISOString(),
      modificatoIl: creatoIl,
      modificatoDa: l.login,
      meseCompetenza: Number(data.slice(5, 7)),
      annoCompetenza: Number(data.slice(0, 4)),
      dichiarazioni: { partecipazione: true, correttezza: true, autorizzazione: true },
      possibileDuplicato: false,
      giorniAttesa: 0,
      promemoriaInviati: [],
      segnalataHR: false,
    };
    if (!o.senzaAttestato && (stato !== 'Bozza' || probabile(0.5)) && probabile(0.9)) {
      r.allegati.push({
        id: `seed-${r.id}-a`,
        tipo: 'Attestato',
        nome: `Attestato_${c.codice}_${r.cognome}.pdf`,
        mime: 'application/pdf',
        dimensione: 48_000 + int(0, 90_000),
        caricatoIl: r.creatoIl,
      });
    }
    log(r, r.creatoIl, l.login, 'Lavoratore', 'Creazione richiesta');
    percorso(r, stato, o);
    richieste.push(r);
    return r;
  };

  const percorso = (r: Richiesta, stato: StatoRichiesta, o: Opzioni) => {
    const hr = scegli(ruoli.filter((x) => x.ruolo === 'hr')).login;
    const imposta = (nuovo: StatoRichiesta, data: string, autore: string, ruolo: RuoloRegistro, nota?: string) => {
      log(r, data, autore, ruolo, `Stato: ${nuovo}`, { campo: 'Stato', prima: r.stato, dopo: nuovo, nota });
      r.stato = nuovo;
      r.modificatoIl = data;
      r.modificatoDa = autore;
    };
    if (stato === 'Bozza') return;
    if (stato === 'Annullata' && probabile(0.5)) {
      imposta('Annullata', dopoDi(r.creatoIl, 0, 2, '08:10'), r.login, 'Lavoratore');
      return;
    }
    // invio (Flusso 1)
    const inviato = o.inviatoIl ?? dopoDi(r.creatoIl, 0, 1, '20:05');
    r.inviatoIl = inviato;
    imposta('Inviata al coordinatore', inviato, r.login, 'Lavoratore');
    imposta('In attesa del coordinatore', inviato, 'Sistema', 'Sistema');
    notifica(inviato, [r.coordinatoreLogin], messaggi.invioCoordinatore(r, false), r.id);
    if (stato === 'In attesa del coordinatore') return;
    if (stato === 'Annullata') {
      imposta('Annullata', dopoDi(inviato, 0, 1, '07:45'), r.login, 'Lavoratore');
      notifica(r.modificatoIl, [r.coordinatoreLogin], messaggi.annullamento(r), r.id);
      return;
    }
    const coord = r.coordinatoreLogin ?? 'Sistema';
    const decisione = dopoDi(inviato, 1, 4, '11:20');
    const notificaCoord = () => notifica(decisione, [r.emailContatto], messaggi.esitoCoordinatore(r), r.id);
    if (stato === 'Integrazione richiesta dal coordinatore' || stato === 'Respinta dal coordinatore') {
      r.noteCoordinatore = o.nota ?? scegli(stato === 'Respinta dal coordinatore' ? NOTE_RESPINTA_COORD : NOTE_INTEGRAZIONE_COORD);
      imposta(stato, decisione, coord, 'Coordinatore', r.noteCoordinatore);
      notificaCoord();
      return;
    }
    // approvazione coordinatore (Flusso 2)
    const riduci = probabile(0.15);
    const totaleRichiesto = r.oreRetribuiteRichieste + r.oreGettoneRichieste;
    const riconosciute = o.oreCoord ?? (riduci ? Math.max(totaleRichiesto - 0.5, 0) : totaleRichiesto);
    r.oreRetribuiteCoord = r.oreRetribuiteRichieste > 0 ? arrotonda2(riconosciute) : 0;
    r.oreGettoneCoord = r.oreRetribuiteRichieste > 0 ? 0 : arrotonda2(riconosciute);
    if (riconosciute !== totaleRichiesto) {
      r.noteCoordinatore = 'Ore ridotte: uscita anticipata rispetto al registro presenze.';
      log(r, decisione, coord, 'Coordinatore', 'Modifica ore riconosciute', {
        campo: r.oreRetribuiteRichieste > 0 ? 'Ore retribuite riconosciute' : 'Ore gettone riconosciute',
        prima: String(totaleRichiesto),
        dopo: String(riconosciute),
      });
    }
    r.approvatoCoordIl = decisione;
    imposta('Approvata dal coordinatore', decisione, coord, 'Coordinatore', r.noteCoordinatore);
    imposta('In attesa di validazione HR', decisione, 'Sistema', 'Sistema');
    notificaCoord();
    if (stato === 'In attesa di validazione HR') return;
    // decisione HR (Flusso 3)
    const decisioneHR = dopoDi(decisione, 1, 5, '15:40');
    const notificaHR = () => {
      notifica(decisioneHR, [r.emailContatto], messaggi.esitoHR(r, false), r.id);
      notifica(decisioneHR, [r.coordinatoreLogin], messaggi.esitoHR(r, true), r.id);
    };
    if (stato === 'Integrazione richiesta da HR' || stato === 'Respinta da HR') {
      r.noteHR = o.nota ?? scegli(stato === 'Respinta da HR' ? NOTE_RESPINTA_HR : NOTE_INTEGRAZIONE_HR);
      imposta(stato, decisioneHR, hr, 'Formazione HR', r.noteHR);
      notificaHR();
      return;
    }
    r.oreRetribuiteHR = r.oreRetribuiteCoord;
    r.oreGettoneHR = r.oreGettoneCoord;
    r.validatoHRIl = decisioneHR;
    imposta('Validata da HR', decisioneHR, hr, 'Formazione HR');
    notificaHR();
  };

  const statoCasuale = (mese: { anno: number; mese: number }): StatoRichiesta => {
    const x = rnd();
    if (chiusi.some((c) => c.anno === mese.anno && c.mese === mese.mese)) {
      return x < 0.86 ? 'Validata da HR' : x < 0.91 ? 'Respinta dal coordinatore' : x < 0.95 ? 'Respinta da HR' : 'Annullata';
    }
    if (mese.anno === m1.anno && mese.mese === m1.mese) {
      if (x < 0.34) return 'Validata da HR';
      if (x < 0.6) return 'In attesa di validazione HR';
      if (x < 0.74) return 'In attesa del coordinatore';
      if (x < 0.8) return 'Integrazione richiesta dal coordinatore';
      if (x < 0.85) return 'Integrazione richiesta da HR';
      if (x < 0.9) return 'Respinta dal coordinatore';
      if (x < 0.93) return 'Annullata';
      return 'Bozza';
    }
    return x < 0.45 ? 'Bozza' : 'In attesa del coordinatore';
  };

  // --- richieste "costruite" per gli account demo
  const giulia = lav('Giulia', 'Bianchi');
  const g3 = giornoN(m3.anno, m3.mese, 6);
  if (g3) crea(giulia, corso('SIC-AGG-06'), g3, 'Validata da HR', { gettone: false });
  const g2 = giornoN(m2.anno, m2.mese, 8);
  if (g2) crea(giulia, corso('PS-B-12'), g2, 'Validata da HR', { gettone: false });
  const g1a = giornoN(m1.anno, m1.mese, 3);
  if (g1a) crea(giulia, corso('PS-B-12'), g1a, 'Validata da HR', { gettone: true });
  const g1b = giornoN(m1.anno, m1.mese, 9);
  if (g1b) crea(giulia, corso('COM-08'), g1b, 'In attesa di validazione HR', { gettone: false, ritardoIngresso: true, oreCoord: 3.5 });
  const g1c = giornoN(m1.anno, m1.mese, 12);
  if (g1c) crea(giulia, corso('EXT-000002'), g1c, 'Integrazione richiesta dal coordinatore', { senzaAttestato: true, nota: "Allega l'attestato di partecipazione rilasciato dall'AUSL." });
  const g1d = giornoN(m1.anno, m1.mese, 5);
  if (g1d) crea(giulia, corso('HACCP-04'), g1d, 'Respinta dal coordinatore', { nota: 'Il corso HACCP risulta già svolto e rendicontato a inizio anno.' });
  crea(giulia, corso('BLSD-05'), lavorativiFa(1), 'In attesa del coordinatore', { gettone: false, inviatoIl: istanteRoma(lavorativiFa(1), '19:30') });
  crea(giulia, corso('PRIV-02'), lavorativiFa(2), 'Bozza', { noteLavoratore: 'Corso svolto online dalla piattaforma aziendale.' });

  // team di Marco Rossi: richieste in attesa con casi particolari
  const sofia = crea(lav('Sofia', 'Conti'), corso('SIC-SPE-12'), lavorativiFa(11), 'In attesa del coordinatore', { inviatoIl: istanteRoma(lavorativiFa(9), '18:00') });
  if (sofia) sofia.segnalataHR = true;
  crea(lav('Martina', 'Ferrara'), corso('AI-L2-08'), lavorativiFa(6), 'In attesa del coordinatore', { inviatoIl: istanteRoma(lavorativiFa(4), '17:30') });
  crea(lav('Elisa', 'Costa'), corso('MMC-04'), lavorativiFa(2), 'In attesa del coordinatore', { senzaAttestato: true, inviatoIl: istanteRoma(lavorativiFa(1), '21:10') });
  const dataDup = lavorativiFa(8);
  const dupA = crea(lav('Matteo', 'Lombardi'), corso('COM-08'), dataDup, 'In attesa di validazione HR', { gettone: false });
  const matteo = lav('Matteo', 'Lombardi');
  usati.delete(`${matteo.login}|COM-08|${dataDup}`);
  const dupB = crea(matteo, corso('COM-08'), dataDup, 'In attesa del coordinatore', { gettone: false, inviatoIl: istanteRoma(lavorativiFa(2), '20:00') });
  if (dupA && dupB) {
    dupA.possibileDuplicato = true;
    dupB.possibileDuplicato = true;
    notifica(dupB.inviatoIl!, [EMAIL_HR], messaggi.duplicatoHR(dupB, [dupA.numero]), dupB.id);
  }
  crea(lav('Valentina', 'De Luca'), corso('STR-03'), lavorativiFa(5), 'In attesa del coordinatore', { inviatoIl: istanteRoma(lavorativiFa(3), '18:45') });
  // Marco come lavoratore (approva Francesca Gallo): non può approvare se stesso
  const marco = lav('Marco', 'Rossi');
  crea(marco, corso('BLSD-05'), lavorativiFa(4), 'In attesa del coordinatore', { inviatoIl: istanteRoma(lavorativiFa(3), '19:00') });
  const gm = giornoN(m2.anno, m2.mese, 4);
  if (gm) crea(marco, corso('SIC-AGG-06'), gm, 'Validata da HR');

  // --- richieste casuali
  for (const l of lavoratori) {
    if (['Giulia', 'Luca'].includes(l.nome) && ['Bianchi', 'Esposito'].includes(l.cognome)) continue;
    for (const mese of [m3, m2, m1, m0]) {
      if (l.stato === 'Non attivo' && mese === m0) continue;
      const quante = mese === m0 ? (probabile(0.25) ? 1 : 0) : mese === m1 ? int(1, 2) : int(0, 2);
      for (let k = 0; k < quante; k++) {
        const giorni = giorniLavorativi(mese.anno, mese.mese);
        if (!giorni.length) continue;
        const candidati = corsi.filter(
          (c) => c.attivo && (c.ente === 'Datore di lavoro' || (c.loginAutore === l.login && c.statoValidazione === 'Validato')),
        );
        const c = scegli(candidati);
        const data = scegli(giorni);
        const stato = statoCasuale(mese);
        crea(l, c, data, stato, { ritardoIngresso: probabile(0.1) });
        // corso su più giornate: sessione successiva una settimana dopo
        if (c.piuGiornate && c.durataOre > 4 && probabile(0.6)) {
          const data2 = aggiungiGiorni(data, 7);
          if (data2 < oggi && isGiornoLavorativo(data2)) {
            const mese2 = { anno: Number(data2.slice(0, 4)), mese: Number(data2.slice(5, 7)) };
            crea(l, c, data2, statoCasuale(mese2));
          }
        }
      }
    }
  }

  // --- promemoria già inviati sulle richieste in attesa del coordinatore
  for (const r of richieste) {
    if (r.stato !== 'In attesa del coordinatore' || !r.inviatoIl) continue;
    const giorni = giorniLavorativiTrascorsi(dataRomaDaIstante(r.inviatoIl), oggi);
    r.giorniAttesa = giorni;
    r.promemoriaInviati = SOGLIE_PROMEMORIA.filter((s) => giorni >= s);
    r.segnalataHR = r.segnalataHR || giorni >= SOGLIA_SEGNALAZIONE_HR;
  }

  // --- numerazione in ordine di creazione
  const contatoriAnno: Record<string, number> = {};
  [...richieste]
    .sort((a, b) => a.creatoIl.localeCompare(b.creatoIl))
    .forEach((r) => {
      const anno = r.creatoIl.slice(0, 4);
      contatoriAnno[anno] = (contatoriAnno[anno] ?? 0) + 1;
      r.numero = `RF-${anno}-${String(contatoriAnno[anno]).padStart(6, '0')}`;
    });
  // le notifiche generate prima della numerazione contengono il segnaposto §id§
  const numeri = new Map(richieste.map((r) => [r.id, r.numero]));
  const sostituisci = (s: string) => s.replace(/§([^§]+)§/g, (_, id: string) => numeri.get(id) ?? id);
  for (const n of notifiche) {
    n.oggetto = sostituisci(n.oggetto);
    n.testo = sostituisci(n.testo);
  }

  // --- chiusure mensili: mesi chiusi con file paghe già inviato
  const chiusure: ChiusuraMensile[] = [];
  for (const m of chiusi) {
    const per = periodoDi(m.anno, m.mese);
    const prossimo = m.mese === 12 ? { anno: m.anno + 1, mese: 1 } : { anno: m.anno, mese: m.mese + 1 };
    const giornoChiusura = giornoN(prossimo.anno, prossimo.mese, 2) ?? aggiungiGiorni(oggi, -1);
    const dataChiusura = istanteRoma(giornoChiusura, '10:30');
    const validate = richieste.filter((r) => r.annoCompetenza === m.anno && r.meseCompetenza === m.mese && r.stato === 'Validata da HR');
    for (const r of validate) {
      r.periodoChiusura = per;
      log(r, dataChiusura, login('Laura', 'Verdi'), 'Formazione HR', 'Stato: Inclusa nel riepilogo mensile', { campo: 'Stato', prima: r.stato, dopo: 'Inclusa nel riepilogo mensile' });
      r.stato = 'Inclusa nel riepilogo mensile';
    }
    const righe = righePaghe(validate, lavoratori);
    const dataFile = new Date(new Date(dataChiusura).getTime() + 20 * 60_000).toISOString();
    for (const r of validate) {
      log(r, dataFile, login('Laura', 'Verdi'), 'Formazione HR', 'Stato: Inviata a Payroll', { campo: 'Stato', prima: r.stato, dopo: 'Inviata a Payroll' });
      r.stato = 'Inviata a Payroll';
      r.modificatoIl = dataFile;
      r.modificatoDa = login('Laura', 'Verdi');
    }
    const totaleRet = arrotonda2(righe.reduce((s, x) => s + x.oreRetribuite, 0));
    const totaleGet = arrotonda2(righe.reduce((s, x) => s + x.oreGettone, 0));
    chiusure.push({
      periodo: per,
      anno: m.anno,
      mese: m.mese,
      stato: 'Chiuso',
      dataChiusura,
      utenteChiusura: login('Laura', 'Verdi'),
      numeroRichieste: validate.length,
      totaleOreRiconosciute: totaleRet,
      totaleGettoni: totaleGet,
      filePaghe: [
        {
          id: `fp-${per}-1`,
          nome: nomeFilePaghe(per, 1),
          versione: 1,
          generatoIl: dataFile,
          generatoDa: login('Laura', 'Verdi'),
          righe: righe.length,
          totaleOreRetribuite: totaleRet,
          totaleOreGettone: totaleGet,
          contenuto: generaCsvPaghe(righe),
        },
      ],
      noteHR: 'Chiusura ordinaria.',
      riaperture: [],
    });
    registro.push({ id: nuovoId('g'), data: dataChiusura, autore: login('Laura', 'Verdi'), ruolo: 'Formazione HR', azione: 'Chiusura del mese', entita: 'Chiusura', entitaId: per });
    notifica(dataFile, [EMAIL_PAGHE, EMAIL_HR], messaggi.filePaghe(per, nomeFilePaghe(per, 1), righe.length));
  }
  chiusure.push({ periodo: periodoDi(m1.anno, m1.mese), anno: m1.anno, mese: m1.mese, stato: 'Aperto', numeroRichieste: 0, totaleOreRiconosciute: 0, totaleGettoni: 0, filePaghe: [], riaperture: [] });

  // riepilogo del mese precedente già inviato (Flusso 5) se siamo oltre il 2 del mese
  if (Number(oggi.slice(8, 10)) >= 2) {
    const dataRiep = istanteRoma(`${oggi.slice(0, 8)}02`, '07:00');
    const delMese = richieste.filter((r) => r.annoCompetenza === m1.anno && r.meseCompetenza === m1.mese && r.stato !== 'Bozza');
    notifica(
      dataRiep,
      [EMAIL_HR],
      messaggi.riepilogoMensile(
        'Ufficio HR/Formazione',
        m1.anno,
        m1.mese,
        calcolaKPI(delMese),
        delMese.filter((r) => ['In attesa del coordinatore', 'Integrazione richiesta dal coordinatore', 'Integrazione richiesta da HR', 'In attesa di validazione HR'].includes(r.stato)),
        delMese.filter((r) => r.stato.startsWith('Respinta')),
        delMese.filter((r) => !r.allegati.length && r.stato !== 'Annullata'),
      ),
    );
  }

  const contatoriAnnoFinali = { ...contatoriAnno };
  return {
    versione: VERSIONE_DATI,
    creatoIl: istanteAdesso,
    utenti,
    password: Object.fromEntries(ACCOUNT_DEMO.map((a) => [a.login, a.password])),
    ruoli,
    strutture,
    lavoratori,
    corsi,
    richieste: richieste.sort((a, b) => b.creatoIl.localeCompare(a.creatoIl)),
    chiusure,
    registro,
    notifiche: notifiche.sort((a, b) => b.data.localeCompare(a.data)),
    contatori: { richiestePerAnno: contatoriAnnoFinali, corsiEsterni: esterni.length, id: contatore },
    ultimoPromemoria: oggi,
    config: { emailHR: EMAIL_HR, destinatariPaghe: [EMAIL_PAGHE, EMAIL_HR], patroni: ['10-04'] },
  };
}

/** Contenuto PDF minimale (valido) per gli attestati simulati. */
export function pdfAttestatoSimulato(titolo: string, nominativo: string): Blob {
  const testo = `Attestato di partecipazione (DEMO) - ${nominativo} - ${titolo}`.replace(/[()\\]/g, ' ');
  const stream = `BT /F1 12 Tf 50 780 Td (${testo.slice(0, 90)}) Tj ET`;
  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offset: number[] = [];
  oggetti.forEach((o, i) => {
    offset.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n${offset.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
