/**
 * Regole e controlli sulle richieste (R1–R12 di docs/ARCHITETTURA.md).
 *
 * Funzioni pure: le usa l'interfaccia per i messaggi immediati e le DEVE usare
 * il backend per i controlli vincolanti (il browser non è affidabile).
 */
import { arrotonda2, isDataValida, isOrarioValido, oreTra, periodoDiData } from './calcoli';
import { ESCLUSI_DAI_CONTROLLI } from './stati';
import type { Corso, DataISO, Dichiarazioni, EnteErogatore, Modalita, Richiesta } from './types';

export interface NuovoCorsoInput {
  titolo: string;
  modalita: Modalita;
  durataOre: number;
  piuGiornate: boolean;
  nomeEnte?: string;
}

/** Dati inseriti dal lavoratore nel modulo "Nuova richiesta". */
export interface DatiRichiestaInput {
  ente: EnteErogatore;
  /** Corso a catalogo (Datore di lavoro) o corso esterno già usato (storico). */
  corsoId?: string;
  /** Corso esterno nuovo (solo per "Committente o altro soggetto"). */
  nuovoCorso?: NuovoCorsoInput;
  dataSessione: DataISO;
  oraInizioSessione: string;
  oraFineSessione: string;
  oraIngresso: string;
  oraUscita: string;
  oreRetribuiteRichieste: number;
  oreGettoneRichieste: number;
  noteLavoratore?: string;
  dichiarazioni: Dichiarazioni;
}

export interface ErroreValidazione {
  campo: string;
  messaggio: string;
}

export interface ContestoValidazione {
  login: string;
  /** Corso risolto (catalogo o storico); `null` se si sta creando un corso esterno nuovo. */
  corso: Corso | null;
  /** Altre richieste dello stesso lavoratore (esclusa quella in modifica). */
  altreRichieste: readonly Richiesta[];
  meseChiuso: (anno: number, mese: number) => boolean;
  coordinatoreLogin?: string;
  profiloCompleto: boolean;
  oggi: DataISO;
}

export const MAX_LUNGHEZZA_NOTE = 2000;
const TOLLERANZA = 0.001;

/** Durata della sessione e ore frequentate calcolate dagli orari (null se orari non validi). */
export function calcolaOre(input: Pick<DatiRichiestaInput, 'oraInizioSessione' | 'oraFineSessione' | 'oraIngresso' | 'oraUscita'>): {
  durataSessione: number | null;
  oreFrequentate: number | null;
} {
  const durataSessione =
    isOrarioValido(input.oraInizioSessione) && isOrarioValido(input.oraFineSessione)
      ? oreTra(input.oraInizioSessione, input.oraFineSessione)
      : null;
  const oreFrequentate =
    isOrarioValido(input.oraIngresso) && isOrarioValido(input.oraUscita) ? oreTra(input.oraIngresso, input.oraUscita) : null;
  return { durataSessione, oreFrequentate };
}

function numeroValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Somma delle durate di sessione già dichiarate dal lavoratore per lo stesso codice corso. */
export function sessioniGiaDichiarate(altre: readonly Richiesta[], codiceCorso: string): number {
  return arrotonda2(
    altre
      .filter((r) => r.codiceCorso === codiceCorso && !ESCLUSI_DAI_CONTROLLI.has(r.stato))
      .reduce((s, r) => s + r.durataSessione, 0),
  );
}

/** Richieste che sarebbero duplicate (stesso lavoratore, stesso corso, stessa data). R7 */
export function trovaDuplicati(
  rif: { login: string; codiceCorso: string; dataSessione: DataISO; id?: string },
  richieste: readonly Richiesta[],
): Richiesta[] {
  return richieste.filter(
    (r) =>
      r.id !== rif.id &&
      r.login === rif.login &&
      r.codiceCorso === rif.codiceCorso &&
      r.dataSessione === rif.dataSessione &&
      r.stato !== 'Bozza' &&
      !ESCLUSI_DAI_CONTROLLI.has(r.stato),
  );
}

/**
 * Valida i dati della richiesta.
 * @param perInvio `true` per l'invio al coordinatore (controlli completi), `false` per il salvataggio in bozza.
 */
export function validaRichiesta(input: DatiRichiestaInput, ctx: ContestoValidazione, perInvio: boolean): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });

  // --- Corso
  if (input.ente !== 'Datore di lavoro' && input.ente !== 'Committente o altro soggetto') {
    err('ente', "Indica l'ente erogatore.");
  }
  let durataCorso: number | null = null;
  let codiceCorso: string | null = null;
  let gettonePrevisto = true;
  if (input.ente === 'Datore di lavoro') {
    if (!ctx.corso) {
      err('corsoId', 'Seleziona il corso dal catalogo.');
    } else if (ctx.corso.ente !== 'Datore di lavoro' || !ctx.corso.attivo || ctx.corso.statoValidazione !== 'Validato') {
      err('corsoId', 'Il corso selezionato non è più disponibile a catalogo.');
    } else {
      durataCorso = ctx.corso.durataOre;
      codiceCorso = ctx.corso.codice;
      gettonePrevisto = ctx.corso.gettonePrevisto;
    }
  } else if (input.ente === 'Committente o altro soggetto') {
    if (ctx.corso) {
      if (ctx.corso.ente !== 'Committente o altro soggetto' || ctx.corso.loginAutore !== ctx.login || !ctx.corso.attivo) {
        err('corsoId', 'Il corso selezionato non è nel tuo storico.');
      } else {
        durataCorso = ctx.corso.durataOre;
        codiceCorso = ctx.corso.codice;
      }
    } else if (!input.nuovoCorso) {
      err('corsoId', 'Indica il titolo del corso oppure selezionalo dallo storico.');
    } else {
      const nc = input.nuovoCorso;
      if (!nc.titolo || nc.titolo.trim().length < 3) err('nuovoCorso.titolo', 'Inserisci il titolo del corso (almeno 3 caratteri).');
      if (!nc.modalita) err('nuovoCorso.modalita', 'Indica la modalità di svolgimento.');
      if (!numeroValido(nc.durataOre) || nc.durataOre <= 0) err('nuovoCorso.durataOre', 'Indica la durata complessiva del corso in ore.');
      else durataCorso = nc.durataOre;
    }
  }

  // --- Data (R9, R12)
  if (!isDataValida(input.dataSessione)) {
    err('dataSessione', 'Indica la data della sessione formativa.');
  } else {
    if (input.dataSessione > ctx.oggi) err('dataSessione', 'La data della sessione non può essere nel futuro.');
    const { anno, mese } = periodoDiData(input.dataSessione);
    if (ctx.meseChiuso(anno, mese)) err('dataSessione', 'Il mese della sessione è già chiuso: rivolgiti all’Ufficio HR/Formazione.');
  }

  // --- Orari (R1, R2)
  const campiOra = ['oraInizioSessione', 'oraFineSessione', 'oraIngresso', 'oraUscita'] as const;
  for (const c of campiOra) {
    if (!isOrarioValido(input[c])) err(c, 'Orario non valido (formato HH:mm).');
  }
  const { durataSessione, oreFrequentate } = calcolaOre(input);
  if (durataSessione !== null && durataSessione <= 0) {
    err('oraFineSessione', "L'ora di fine sessione deve essere successiva all'ora di inizio.");
  }
  if (oreFrequentate !== null && oreFrequentate <= 0) {
    err('oraUscita', "L'ora di uscita deve essere successiva all'ora di ingresso.");
  }
  if (durataSessione !== null && oreFrequentate !== null && durataSessione > 0 && oreFrequentate > durataSessione + TOLLERANZA) {
    err('oraUscita', `Le ore frequentate (${oreFrequentate}) non possono superare la durata della sessione (${durataSessione}).`);
  }

  // --- Ore richieste (R3, R5)
  const ret = input.oreRetribuiteRichieste;
  const get = input.oreGettoneRichieste;
  if (!numeroValido(ret) || ret < 0) err('oreRetribuiteRichieste', 'Le ore retribuite non possono essere negative.');
  if (!numeroValido(get) || get < 0) err('oreGettoneRichieste', 'Le ore gettone non possono essere negative.');
  if (!gettonePrevisto && numeroValido(get) && get > 0) {
    err('oreGettoneRichieste', 'Per questo corso il gettone non è previsto.');
  }
  if (numeroValido(ret) && numeroValido(get) && oreFrequentate !== null && oreFrequentate > 0 && ret + get > oreFrequentate + TOLLERANZA) {
    err('oreRetribuiteRichieste', `Le ore richieste (${arrotonda2(ret + get)}) non possono superare le ore frequentate (${oreFrequentate}).`);
  }

  // --- Durata complessiva del corso (R6)
  if (durataSessione !== null && durataSessione > 0 && durataCorso !== null) {
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

  if ((input.noteLavoratore ?? '').length > MAX_LUNGHEZZA_NOTE) err('noteLavoratore', `Le note non possono superare ${MAX_LUNGHEZZA_NOTE} caratteri.`);

  // --- Controlli aggiuntivi per l'invio (R11)
  if (perInvio) {
    if (numeroValido(ret) && numeroValido(get) && ret + get <= 0) err('oreRetribuiteRichieste', 'Indica le ore retribuite o le ore gettone richieste.');
    if (!input.dichiarazioni.partecipazione) err('dichiarazioni.partecipazione', 'Conferma la partecipazione al corso.');
    if (!input.dichiarazioni.correttezza) err('dichiarazioni.correttezza', 'Conferma la correttezza dei dati.');
    if (!input.dichiarazioni.autorizzazione) err('dichiarazioni.autorizzazione', "Autorizza l'invio della richiesta.");
    if (!ctx.coordinatoreLogin) err('coordinatore', "Non hai un coordinatore assegnato: segnala la variazione all'Ufficio HR/Formazione.");
    if (!ctx.profiloCompleto) err('profilo', 'Completa il profilo (e-mail di contatto e codice fiscale) prima di inviare.');
  }
  return errori;
}

export type EsitoDecisione = 'approva' | 'respingi' | 'integrazione';

/** Controlli sulla decisione di coordinatore o HR (R4 e motivazione obbligatoria). */
export function validaDecisione(
  esito: EsitoDecisione,
  oreRetribuite: number,
  oreGettone: number,
  oreFrequentate: number,
  nota: string | undefined,
): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  if (esito === 'approva') {
    if (!numeroValido(oreRetribuite) || oreRetribuite < 0) errori.push({ campo: 'oreRetribuite', messaggio: 'Le ore retribuite non possono essere negative.' });
    if (!numeroValido(oreGettone) || oreGettone < 0) errori.push({ campo: 'oreGettone', messaggio: 'Le ore gettone non possono essere negative.' });
    if (numeroValido(oreRetribuite) && numeroValido(oreGettone) && oreRetribuite + oreGettone > oreFrequentate + TOLLERANZA) {
      errori.push({ campo: 'oreRetribuite', messaggio: `Le ore riconosciute non possono superare le ore frequentate (${oreFrequentate}).` });
    }
  } else if (!nota || nota.trim().length < 5) {
    errori.push({
      campo: 'nota',
      messaggio: esito === 'respingi' ? 'Indica la motivazione del respingimento.' : 'Indica cosa deve essere integrato o corretto.',
    });
  }
  if ((nota ?? '').length > MAX_LUNGHEZZA_NOTE) errori.push({ campo: 'nota', messaggio: `La nota non può superare ${MAX_LUNGHEZZA_NOTE} caratteri.` });
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
