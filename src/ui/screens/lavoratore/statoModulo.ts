/**
 * Stato del modulo "Nuova richiesta": conversione da/verso i dati di dominio
 * e controlli di formato che precedono le regole di `validaRichiesta`.
 */
import type { Corso, DatiRichiestaInput, Dichiarazioni, EnteErogatore, ErroreValidazione, Modalita, Richiesta } from '../../../domain';
import { parseNumero } from '../../format';
import { testoNumero } from './comuni';

export const DATORE: EnteErogatore = 'Datore di lavoro';
export const ESTERNO: EnteErogatore = 'Committente o altro soggetto';

export type SceltaEsterno = 'storico' | 'nuovo';

/** Valori dei campi così come digitati (testi), per non perdere ciò che l'utente scrive. */
export interface StatoModulo {
  ente: EnteErogatore | '';
  corsoCatalogoId: string;
  sceltaEsterno: SceltaEsterno;
  corsoStoricoId: string;
  nuovoTitolo: string;
  nuovoNomeEnte: string;
  nuovaModalita: Modalita | '';
  nuovaDurata: string;
  nuovoPiuGiornate: '' | 'si' | 'no';
  dataSessione: string;
  oraInizioSessione: string;
  oraFineSessione: string;
  oraIngresso: string;
  oraUscita: string;
  oreRetribuite: string;
  oreGettone: string;
  note: string;
  dichiarazioni: Dichiarazioni;
}

export function moduloVuoto(storicoPresente: boolean): StatoModulo {
  return {
    ente: '',
    corsoCatalogoId: '',
    sceltaEsterno: storicoPresente ? 'storico' : 'nuovo',
    corsoStoricoId: '',
    nuovoTitolo: '',
    nuovoNomeEnte: '',
    nuovaModalita: '',
    nuovaDurata: '',
    nuovoPiuGiornate: '',
    dataSessione: '',
    oraInizioSessione: '',
    oraFineSessione: '',
    oraIngresso: '',
    oraUscita: '',
    oreRetribuite: '',
    oreGettone: '',
    note: '',
    dichiarazioni: { partecipazione: false, correttezza: false, autorizzazione: false },
  };
}

/**
 * Corso esterno ricostruito dai dati della richiesta. Serve quando il corso non compare
 * nello storico (es. corso di una sola giornata, o appena creato salvando la bozza).
 */
export function corsoDaRichiesta(r: Richiesta, login: string): Corso {
  return {
    id: r.corsoId ?? '',
    codice: r.codiceCorso,
    titolo: r.titoloCorsoLibero || r.titoloCorso,
    ente: r.ente,
    modalita: r.modalita,
    durataOre: r.durataCorso,
    gettonePrevisto: true,
    attivo: true,
    piuGiornate: r.piuGiornate,
    origine: 'Inserito dal lavoratore',
    statoValidazione: 'Da validare',
    loginAutore: login,
  };
}

/** Storico dei corsi esterni, completato con il corso della richiesta in modifica. */
export function storicoCon(storico: Corso[], r: Richiesta | undefined, login: string): Corso[] {
  if (!r || r.ente !== ESTERNO || !r.corsoId || storico.some((c) => c.id === r.corsoId)) return storico;
  return [...storico, corsoDaRichiesta(r, login)];
}

export function statoDaRichiesta(r: Richiesta, catalogo: Corso[]): StatoModulo {
  const base = moduloVuoto(true);
  const aCatalogo = r.ente === DATORE && catalogo.some((c) => c.id === r.corsoId);
  return {
    ...base,
    ente: r.ente,
    corsoCatalogoId: aCatalogo ? r.corsoId ?? '' : '',
    sceltaEsterno: 'storico',
    corsoStoricoId: r.ente === ESTERNO ? r.corsoId ?? '' : '',
    dataSessione: r.dataSessione,
    oraInizioSessione: r.oraInizioSessione,
    oraFineSessione: r.oraFineSessione,
    oraIngresso: r.oraIngresso,
    oraUscita: r.oraUscita,
    oreRetribuite: testoNumero(r.oreRetribuiteRichieste),
    oreGettone: testoNumero(r.oreGettoneRichieste),
    note: r.noteLavoratore ?? '',
    dichiarazioni: { ...r.dichiarazioni },
  };
}

/** Numero da un campo di testo: vuoto = 0; NaN se il testo non è un numero. */
export function numeroCampo(testo: string): number {
  return testo.trim() === '' ? 0 : parseNumero(testo);
}

export function corsoIdScelto(s: StatoModulo): string | undefined {
  if (s.ente === DATORE) return s.corsoCatalogoId || undefined;
  if (s.ente === ESTERNO && s.sceltaEsterno === 'storico') return s.corsoStoricoId || undefined;
  return undefined;
}

export function inputDaStato(s: StatoModulo, gettoneNonPrevisto: boolean): DatiRichiestaInput {
  const nuovo = s.ente === ESTERNO && s.sceltaEsterno === 'nuovo';
  return {
    ente: s.ente as EnteErogatore,
    corsoId: corsoIdScelto(s),
    nuovoCorso: nuovo
      ? {
          titolo: s.nuovoTitolo.trim(),
          nomeEnte: s.nuovoNomeEnte.trim() || undefined,
          modalita: s.nuovaModalita as Modalita,
          durataOre: parseNumero(s.nuovaDurata),
          piuGiornate: s.nuovoPiuGiornate === 'si',
        }
      : undefined,
    dataSessione: s.dataSessione,
    oraInizioSessione: s.oraInizioSessione,
    oraFineSessione: s.oraFineSessione,
    oraIngresso: s.oraIngresso,
    oraUscita: s.oraUscita,
    oreRetribuiteRichieste: numeroCampo(s.oreRetribuite),
    oreGettoneRichieste: gettoneNonPrevisto ? 0 : numeroCampo(s.oreGettone),
    noteLavoratore: s.note.trim() || undefined,
    dichiarazioni: { ...s.dichiarazioni },
  };
}

const NUMERO_NON_VALIDO = 'Inserisci un numero valido (es. 2,5).';

/**
 * Controlli di compilazione con messaggi più chiari di quelli generici
 * (campo vuoto, testo non numerico). Vengono mostrati prima di quelli di `validaRichiesta`.
 */
export function validaCompilazione(s: StatoModulo, gettoneNonPrevisto: boolean): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });
  if (s.ente === ESTERNO && s.sceltaEsterno === 'nuovo') {
    if (s.nuovaDurata.trim() && Number.isNaN(parseNumero(s.nuovaDurata))) err('nuovoCorso.durataOre', 'Inserisci la durata in ore (es. 7,5).');
    if (!s.nuovoPiuGiornate) err('nuovoCorso.piuGiornate', 'Indica se sono previste più giornate formative.');
  }
  if (s.ente === ESTERNO && s.sceltaEsterno === 'storico' && !s.corsoStoricoId) err('corsoId', 'Seleziona il corso dal tuo storico oppure scegli «Nuovo corso».');
  const vuoti: [keyof StatoModulo, string][] = [
    ['oraInizioSessione', 'Indica l’ora di inizio della sessione.'],
    ['oraFineSessione', 'Indica l’ora di fine della sessione.'],
    ['oraIngresso', 'Indica l’ora in cui sei entrato/a.'],
    ['oraUscita', 'Indica l’ora in cui sei uscito/a.'],
  ];
  for (const [campo, messaggio] of vuoti) if (!s[campo]) err(campo, messaggio);
  if (Number.isNaN(numeroCampo(s.oreRetribuite))) err('oreRetribuiteRichieste', NUMERO_NON_VALIDO);
  if (!gettoneNonPrevisto && Number.isNaN(numeroCampo(s.oreGettone))) err('oreGettoneRichieste', NUMERO_NON_VALIDO);
  return errori;
}
