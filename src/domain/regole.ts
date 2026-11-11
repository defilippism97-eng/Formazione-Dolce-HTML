/**
 * Regole e controlli sulle richieste (R1–R14 di docs/ARCHITETTURA.md).
 *
 * Funzioni pure: le usa l'interfaccia per i messaggi immediati e le DEVE usare
 * il backend per i controlli vincolanti (il browser non è affidabile).
 */
import { arrotonda2, isDataValida, isOrarioValido, minuti, periodoDiData } from './calcoli';
import { ESCLUSI_DAI_CONTROLLI } from './stati';
import type { Corso, DataISO, Dichiarazioni, EnteErogatore, Modalita, Richiesta, Tipologia } from './types';

export interface NuovoCorsoInput {
  titolo: string;
  modalita: Modalita;
  durataOre: number;
  piuGiornate: boolean;
  nomeEnte?: string;
}

/** Dati inseriti dal lavoratore nel modulo "Nuova richiesta". */
export interface DatiRichiestaInput {
  tipologia: Tipologia;
  // --- Formazione
  /** Dedotto dalla scelta del corso: a catalogo = Datore di lavoro, altrimenti Committente o altro soggetto. */
  ente?: EnteErogatore;
  /** Corso a catalogo (Datore di lavoro) o corso esterno già inserito in precedenza. */
  corsoId?: string;
  /** Corso esterno nuovo (solo per "Committente o altro soggetto"). */
  nuovoCorso?: NuovoCorsoInput;
  // --- Permessi (diritto allo studio, riqualifica professionale)
  /** Attività svolta con il permesso (es. "Esame di Pedagogia generale"). */
  descrizioneAttivita?: string;
  // --- Sessione
  dataSessione: DataISO;
  oraInizioSessione: string;
  oraFineSessione: string;
  pausaPrevista: boolean;
  pausaMinuti: number;
  /** La pausa cade nell'orario di presenza (conta solo se ingresso/uscita differiscono dalla sessione). */
  pausaInPresenza: boolean;
  /** Per i permessi coincidono con inizio e fine. */
  oraIngresso: string;
  oraUscita: string;
  // --- Ripartizione delle ore frequentate (per i permessi la calcola il server)
  oreRetribuiteRichieste: number;
  oreGettoneRichieste: number;
  oreNonRetribuiteRichieste: number;
  noteLavoratore?: string;
  dichiarazioni: Dichiarazioni;
}

export interface ErroreValidazione {
  campo: string;
  messaggio: string;
}

/** Disponibilità del monte ore per la data del permesso. */
export interface DisponibilitaMonteOre {
  /** Ore ancora disponibili, senza contare la richiesta in modifica. */
  oreResidue: number;
  validoDal: DataISO;
  validoAl: DataISO;
}

export interface ContestoValidazione {
  login: string;
  /** Corso risolto (catalogo o già inserito); `null` se si sta creando un corso esterno nuovo o per i permessi. */
  corso: Corso | null;
  /** Altre richieste dello stesso lavoratore (esclusa quella in modifica). */
  altreRichieste: readonly Richiesta[];
  meseChiuso: (anno: number, mese: number) => boolean;
  coordinatoreLogin?: string;
  profiloCompleto: boolean;
  oggi: DataISO;
  /** Solo per i permessi: monte ore attivo per il tipo e la data richiesti (`null` = nessuno). */
  monteOre?: DisponibilitaMonteOre | null;
}

export interface RipartizioneOre {
  retribuite: number;
  gettone: number;
  nonRetribuite: number;
}

export const MAX_LUNGHEZZA_NOTE = 2000;
export const MAX_PAUSA_MINUTI = 240;
const TOLLERANZA = 0.005;

export function isPermesso(r: { tipologia: Tipologia }): boolean {
  return r.tipologia !== 'Formazione';
}

/** Titolo da mostrare per una richiesta: corso oppure attività del permesso. */
export function titoloRichiesta(r: Pick<Richiesta, 'tipologia' | 'titoloCorso' | 'titoloCorsoLibero' | 'descrizioneAttivita'>): string {
  if (r.tipologia !== 'Formazione') return r.descrizioneAttivita ? `${r.tipologia} – ${r.descrizioneAttivita}` : r.tipologia;
  return r.titoloCorsoLibero || r.titoloCorso;
}

type OrariInput = Pick<DatiRichiestaInput, 'oraInizioSessione' | 'oraFineSessione' | 'oraIngresso' | 'oraUscita'> &
  Partial<Pick<DatiRichiestaInput, 'pausaPrevista' | 'pausaMinuti' | 'pausaInPresenza'>>;

/**
 * Durata della sessione e ore frequentate, al netto della pausa (null se gli orari non sono validi).
 * La pausa si toglie dalle ore frequentate se la presenza coincide con la sessione, oppure se il
 * lavoratore dichiara di averla fatta durante la propria presenza.
 */
export function calcolaOre(input: OrariInput): {
  durataSessione: number | null;
  oreFrequentate: number | null;
  /** Minuti di pausa tolti dalle ore frequentate. */
  pausaApplicata: number;
} {
  const pausa = input.pausaPrevista && Number.isFinite(input.pausaMinuti) && (input.pausaMinuti ?? 0) > 0 ? (input.pausaMinuti as number) : 0;
  const sessioneValida = isOrarioValido(input.oraInizioSessione) && isOrarioValido(input.oraFineSessione);
  const presenzaValida = isOrarioValido(input.oraIngresso) && isOrarioValido(input.oraUscita);
  const durataSessione = sessioneValida ? arrotonda2((minuti(input.oraFineSessione) - minuti(input.oraInizioSessione) - pausa) / 60) : null;
  const coincide = input.oraIngresso === input.oraInizioSessione && input.oraUscita === input.oraFineSessione;
  const pausaApplicata = pausa > 0 && (coincide || input.pausaInPresenza !== false) ? pausa : 0;
  const oreFrequentate = presenzaValida ? arrotonda2((minuti(input.oraUscita) - minuti(input.oraIngresso) - pausaApplicata) / 60) : null;
  return { durataSessione, oreFrequentate, pausaApplicata };
}

function numeroValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Somma delle durate di sessione già dichiarate dal lavoratore per lo stesso codice corso. */
export function sessioniGiaDichiarate(altre: readonly Richiesta[], codiceCorso: string): number {
  if (!codiceCorso) return 0;
  return arrotonda2(
    altre
      .filter((r) => r.tipologia === 'Formazione' && r.codiceCorso === codiceCorso && !ESCLUSI_DAI_CONTROLLI.has(r.stato))
      .reduce((s, r) => s + r.durataSessione, 0),
  );
}

/** Richieste di formazione che sarebbero duplicate (stesso lavoratore, stesso corso, stessa data). R7 */
export function trovaDuplicati(
  rif: { login: string; codiceCorso: string; dataSessione: DataISO; id?: string; tipologia?: Tipologia },
  richieste: readonly Richiesta[],
): Richiesta[] {
  if ((rif.tipologia ?? 'Formazione') !== 'Formazione' || !rif.codiceCorso) return [];
  return richieste.filter(
    (r) =>
      r.id !== rif.id &&
      r.tipologia === 'Formazione' &&
      r.login === rif.login &&
      r.codiceCorso === rif.codiceCorso &&
      r.dataSessione === rif.dataSessione &&
      r.stato !== 'Bozza' &&
      !ESCLUSI_DAI_CONTROLLI.has(r.stato),
  );
}

/** Controlla la ripartizione delle ore: valori non negativi e somma uguale alle ore frequentate. */
function validaRipartizione(
  ore: RipartizioneOre,
  oreFrequentate: number | null,
  campi: { retribuite: string; gettone: string; nonRetribuite: string },
  /** `true`: la somma deve essere uguale; `false` (bozza): basta che non superi. */
  uguale: boolean,
  err: (campo: string, messaggio: string) => void,
): void {
  let valide = true;
  for (const [k, etichetta] of [['retribuite', 'retribuite'], ['gettone', 'gettone'], ['nonRetribuite', 'da non retribuire']] as const) {
    if (!numeroValido(ore[k]) || ore[k] < 0) {
      err(campi[k], `Le ore ${etichetta} non possono essere negative.`);
      valide = false;
    }
  }
  if (!valide || oreFrequentate === null || oreFrequentate <= 0) return;
  const somma = arrotonda2(ore.retribuite + ore.gettone + ore.nonRetribuite);
  if (somma > oreFrequentate + TOLLERANZA) {
    err(campi.retribuite, `Le ore indicate (${somma}) superano le ore frequentate (${oreFrequentate}).`);
  } else if (uguale && somma < oreFrequentate - TOLLERANZA) {
    err(
      campi.retribuite,
      `Devi ripartire tutte le ore frequentate (${oreFrequentate}) tra retribuite, gettone e da non retribuire: ne mancano ${arrotonda2(oreFrequentate - somma)}.`,
    );
  }
}

/**
 * Valida i dati della richiesta.
 * @param perInvio `true` per l'invio al coordinatore (controlli completi), `false` per il salvataggio in bozza.
 */
export function validaRichiesta(input: DatiRichiestaInput, ctx: ContestoValidazione, perInvio: boolean): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });
  const permesso = input.tipologia !== 'Formazione';

  // --- Corso (solo formazione)
  let durataCorso: number | null = null;
  let codiceCorso: string | null = null;
  let gettonePrevisto = true;
  if (!permesso) {
    if (input.ente !== 'Datore di lavoro' && input.ente !== 'Committente o altro soggetto') {
      err('corsoId', 'Scegli il corso dal catalogo oppure indica che è un corso di un altro ente.');
    } else if (input.ente === 'Datore di lavoro') {
      if (!ctx.corso) {
        err('corsoId', 'Seleziona il corso dal catalogo.');
      } else if (ctx.corso.ente !== 'Datore di lavoro' || !ctx.corso.attivo || ctx.corso.statoValidazione !== 'Validato') {
        err('corsoId', 'Il corso selezionato non è più disponibile a catalogo.');
      } else {
        durataCorso = ctx.corso.durataOre;
        codiceCorso = ctx.corso.codice;
        gettonePrevisto = ctx.corso.gettonePrevisto;
      }
    } else if (ctx.corso) {
      if (ctx.corso.ente !== 'Committente o altro soggetto' || ctx.corso.loginAutore !== ctx.login || !ctx.corso.attivo) {
        err('corsoId', 'Il corso selezionato non è tra quelli che hai già inserito.');
      } else {
        durataCorso = ctx.corso.durataOre;
        codiceCorso = ctx.corso.codice;
      }
    } else if (!input.nuovoCorso) {
      err('corsoId', 'Indica il titolo del corso oppure scegli un corso che hai già inserito.');
    } else {
      const nc = input.nuovoCorso;
      if (!nc.titolo || nc.titolo.trim().length < 3) err('nuovoCorso.titolo', 'Inserisci il titolo del corso (almeno 3 caratteri).');
      if (!nc.modalita) err('nuovoCorso.modalita', 'Indica la modalità di svolgimento.');
      if (!numeroValido(nc.durataOre) || nc.durataOre <= 0) err('nuovoCorso.durataOre', 'Indica la durata complessiva del corso in ore.');
      else durataCorso = nc.durataOre;
    }
  } else if (!input.descrizioneAttivita || input.descrizioneAttivita.trim().length < 3) {
    err('descrizioneAttivita', 'Descrivi l’attività svolta (es. esame, lezione, tirocinio).');
  }

  // --- Data (R9, R12)
  let dataValida = false;
  if (!isDataValida(input.dataSessione)) {
    err('dataSessione', permesso ? 'Indica la data del permesso.' : 'Indica la data della sessione formativa.');
  } else {
    dataValida = true;
    if (input.dataSessione > ctx.oggi) err('dataSessione', 'La data non può essere nel futuro.');
    const { anno, mese } = periodoDiData(input.dataSessione);
    if (ctx.meseChiuso(anno, mese)) err('dataSessione', 'Il mese indicato è già chiuso: rivolgiti all’Ufficio HR/Formazione.');
  }

  // --- Orari (R1)
  const campiOra = ['oraInizioSessione', 'oraFineSessione', 'oraIngresso', 'oraUscita'] as const;
  let orariValidi = true;
  for (const c of campiOra) {
    if (!isOrarioValido(input[c])) {
      err(c, 'Orario non valido (formato HH:mm).');
      orariValidi = false;
    }
  }
  const lordoSessione = orariValidi ? minuti(input.oraFineSessione) - minuti(input.oraInizioSessione) : null;
  const lordoPresenza = orariValidi ? minuti(input.oraUscita) - minuti(input.oraIngresso) : null;
  if (lordoSessione !== null && lordoSessione <= 0) err('oraFineSessione', "L'ora di fine deve essere successiva all'ora di inizio.");
  if (lordoPresenza !== null && lordoPresenza <= 0) err('oraUscita', "L'ora di uscita deve essere successiva all'ora di ingresso.");

  // --- Pausa (R13)
  if (input.pausaPrevista) {
    if (!Number.isInteger(input.pausaMinuti) || input.pausaMinuti < 5 || input.pausaMinuti > MAX_PAUSA_MINUTI) {
      err('pausaMinuti', `Indica la durata della pausa in minuti (da 5 a ${MAX_PAUSA_MINUTI}).`);
    } else if (lordoSessione !== null && lordoSessione > 0 && input.pausaMinuti >= lordoSessione) {
      err('pausaMinuti', 'La pausa deve essere più breve della sessione.');
    }
  }

  // --- Ore frequentate (R2)
  const { durataSessione, oreFrequentate } = calcolaOre(input);
  const oreOk = lordoSessione !== null && lordoSessione > 0 && lordoPresenza !== null && lordoPresenza > 0;
  if (oreOk && oreFrequentate !== null && oreFrequentate <= 0) {
    err('pausaMinuti', 'Tolta la pausa non restano ore frequentate: controlla orari e pausa.');
  }
  if (oreOk && durataSessione !== null && oreFrequentate !== null && durataSessione > 0 && oreFrequentate > durataSessione + TOLLERANZA) {
    err('oraUscita', `Le ore frequentate (${oreFrequentate}) non possono superare la durata della sessione (${durataSessione}).`);
  }

  if (!permesso) {
    // --- Ripartizione delle ore (R3, R5): tutte le ore frequentate vanno ripartite
    if (!gettonePrevisto && numeroValido(input.oreGettoneRichieste) && input.oreGettoneRichieste > 0) {
      err('oreGettoneRichieste', 'Per questo corso il gettone non è previsto.');
    }
    validaRipartizione(
      { retribuite: input.oreRetribuiteRichieste, gettone: input.oreGettoneRichieste, nonRetribuite: input.oreNonRetribuiteRichieste },
      oreOk ? oreFrequentate : null,
      { retribuite: 'oreRetribuiteRichieste', gettone: 'oreGettoneRichieste', nonRetribuite: 'oreNonRetribuiteRichieste' },
      perInvio,
      err,
    );

    // --- Durata complessiva del corso (R6)
    if (oreOk && durataSessione !== null && durataSessione > 0 && durataCorso !== null) {
      if (durataSessione > durataCorso + TOLLERANZA) {
        err('oraFineSessione', `La sessione (${durataSessione} h) supera la durata complessiva del corso (${durataCorso} h).`);
      } else if (codiceCorso) {
        const gia = sessioniGiaDichiarate(ctx.altreRichieste, codiceCorso);
        if (gia + durataSessione > durataCorso + TOLLERANZA) {
          err(
            'oraFineSessione',
            `Con questa sessione le ore del corso diventano ${arrotonda2(gia + durataSessione)}, oltre la durata complessiva di ${durataCorso} h.`,
          );
        }
      }
    }
  } else {
    // --- Monte ore del permesso (R14): le ore si scalano e, a monte ore esaurito, la richiesta è bloccata
    if (ctx.monteOre === null || ctx.monteOre === undefined) {
      err('tipologia', `Non hai un monte ore attivo per "${input.tipologia}": rivolgiti all’Ufficio HR/Formazione.`);
    } else if (dataValida && (input.dataSessione < ctx.monteOre.validoDal || input.dataSessione > ctx.monteOre.validoAl)) {
      err('dataSessione', 'La data è fuori dal periodo di validità del tuo monte ore.');
    } else if (oreOk && oreFrequentate !== null && oreFrequentate > ctx.monteOre.oreResidue + TOLLERANZA) {
      err(
        'oraFineSessione',
        ctx.monteOre.oreResidue <= 0
          ? 'Il tuo monte ore è esaurito: non puoi richiedere altre ore.'
          : `Stai chiedendo ${oreFrequentate} ore ma nel tuo monte ore ne restano ${arrotonda2(ctx.monteOre.oreResidue)}.`,
      );
    }
  }

  if ((input.noteLavoratore ?? '').length > MAX_LUNGHEZZA_NOTE) err('noteLavoratore', `Le note non possono superare ${MAX_LUNGHEZZA_NOTE} caratteri.`);

  // --- Controlli aggiuntivi per l'invio (R11)
  if (perInvio) {
    if (!input.dichiarazioni.partecipazione) err('dichiarazioni.partecipazione', permesso ? 'Conferma di aver usufruito del permesso.' : 'Conferma la partecipazione al corso.');
    if (!input.dichiarazioni.correttezza) err('dichiarazioni.correttezza', 'Conferma la correttezza dei dati.');
    if (!input.dichiarazioni.autorizzazione) err('dichiarazioni.autorizzazione', "Autorizza l'invio della richiesta.");
    if (!ctx.coordinatoreLogin) err('coordinatore', "Non hai un coordinatore assegnato: segnala la variazione all'Ufficio HR/Formazione.");
    if (!ctx.profiloCompleto) err('profilo', 'Completa il profilo (e-mail di contatto e codice fiscale) prima di inviare.');
  }
  return errori;
}

export type EsitoDecisione = 'approva' | 'respingi' | 'integrazione';

export interface OpzioniDecisione {
  /** Falso se il corso a catalogo non prevede il gettone. */
  gettonePrevisto?: boolean;
  /** Per i permessi: ore ancora disponibili nel monte ore, senza contare questa richiesta. */
  oreResidueMonteOre?: number;
}

/**
 * Controlli sulla decisione di coordinatore o HR (R4 e motivazione obbligatoria).
 * In approvazione le tre voci devono sommare esattamente alle ore frequentate.
 * Per i permessi: `retribuite` = ore di permesso riconosciute, `nonRetribuite` = ore non riconosciute.
 */
export function validaDecisione(
  esito: EsitoDecisione,
  ore: RipartizioneOre,
  oreFrequentate: number,
  nota: string | undefined,
  opzioni: OpzioniDecisione = {},
): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });
  if (esito === 'approva') {
    validaRipartizione(ore, oreFrequentate, { retribuite: 'oreRetribuite', gettone: 'oreGettone', nonRetribuite: 'oreNonRetribuite' }, true, err);
    if (opzioni.gettonePrevisto === false && numeroValido(ore.gettone) && ore.gettone > 0) err('oreGettone', 'Per questo corso il gettone non è previsto.');
    if (opzioni.oreResidueMonteOre !== undefined) {
      if (numeroValido(ore.gettone) && ore.gettone > 0) err('oreGettone', 'Per i permessi il gettone non è previsto.');
      if (numeroValido(ore.retribuite) && ore.retribuite > opzioni.oreResidueMonteOre + TOLLERANZA) {
        err('oreRetribuite', `Le ore di permesso (${ore.retribuite}) superano il monte ore residuo (${arrotonda2(opzioni.oreResidueMonteOre)}).`);
      }
    }
  } else if (!nota || nota.trim().length < 5) {
    err('nota', esito === 'respingi' ? 'Indica la motivazione del respingimento.' : 'Indica cosa deve essere integrato o corretto.');
  }
  if ((nota ?? '').length > MAX_LUNGHEZZA_NOTE) err('nota', `La nota non può superare ${MAX_LUNGHEZZA_NOTE} caratteri.`);
  return errori;
}

export interface CorrezioneCorsoInput {
  titolo: string;
  nomeEnte?: string;
  modalita: Modalita;
  durataOre: number;
  piuGiornate: boolean;
}

/** Controlli sulla correzione dei dati di un corso esterno da parte di coordinatore o HR. */
export function validaCorrezioneCorso(dati: CorrezioneCorsoInput, oreGiaDichiarate: number): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  if (!dati.titolo || dati.titolo.trim().length < 3) errori.push({ campo: 'titolo', messaggio: 'Inserisci il titolo del corso (almeno 3 caratteri).' });
  if (!dati.modalita) errori.push({ campo: 'modalita', messaggio: 'Indica la modalità di svolgimento.' });
  if (!numeroValido(dati.durataOre) || dati.durataOre <= 0) {
    errori.push({ campo: 'durataOre', messaggio: 'Indica la durata complessiva del corso in ore.' });
  } else if (dati.durataOre + TOLLERANZA < oreGiaDichiarate) {
    errori.push({ campo: 'durataOre', messaggio: `La durata non può essere inferiore alle ore di sessione già dichiarate (${oreGiaDichiarate}).` });
  }
  return errori;
}

const CF_DISPARI: Record<string, number> = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20,
  O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/** Carattere di controllo del codice fiscale calcolato sui primi 15 caratteri. */
export function carattereControlloCF(primi15: string): string {
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const c = primi15[i] ?? '';
    if (i % 2 === 0) somma += CF_DISPARI[c] ?? 0;
    else somma += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (somma % 26));
}

/** Codice fiscale italiano (controllo formale con carattere di controllo; ammette l'omocodia). */
export function isCodiceFiscaleValido(cf: string): boolean {
  const v = cf.trim().toUpperCase();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v)) return false;
  return carattereControlloCF(v.slice(0, 15)) === v[15];
}

export function isEmailValida(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Codice fiscale mascherato per la visualizzazione al lavoratore. */
export function mascheraCodiceFiscale(cf: string | undefined): string {
  if (!cf) return '';
  return `${cf.slice(0, 3)}**********${cf.slice(-3)}`;
}
