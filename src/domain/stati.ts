/**
 * Stati della richiesta: colori, raggruppamenti e transizioni ammesse.
 */
import type { Ruolo, StatoRichiesta } from './types';

export type GruppoStato = 'bozza' | 'attesa' | 'integrazione' | 'approvata' | 'respinta' | 'chiusa' | 'annullata';

export interface InfoStato {
  stato: StatoRichiesta;
  gruppo: GruppoStato;
  /** Colore del testo / bordo del badge. */
  colore: string;
  /** Colore di sfondo del badge. */
  sfondo: string;
  descrizione: string;
}

export const INFO_STATI: Record<StatoRichiesta, InfoStato> = {
  Bozza: { stato: 'Bozza', gruppo: 'bozza', colore: '#595959', sfondo: '#ececec', descrizione: 'Salvata, non ancora inviata' },
  'Inviata al coordinatore': { stato: 'Inviata al coordinatore', gruppo: 'attesa', colore: '#0b76bd', sfondo: '#d0e5f4', descrizione: 'Inviata, controlli in corso' },
  'In attesa del coordinatore': { stato: 'In attesa del coordinatore', gruppo: 'attesa', colore: '#0b76bd', sfondo: '#d0e5f4', descrizione: 'Da approvare da parte del coordinatore' },
  'Integrazione richiesta dal coordinatore': { stato: 'Integrazione richiesta dal coordinatore', gruppo: 'integrazione', colore: '#8f4a12', sfondo: '#fff5dd', descrizione: 'Il coordinatore chiede una correzione' },
  'Respinta dal coordinatore': { stato: 'Respinta dal coordinatore', gruppo: 'respinta', colore: '#b8203b', sfondo: '#f7dbe5', descrizione: 'Respinta dal coordinatore' },
  'Approvata dal coordinatore': { stato: 'Approvata dal coordinatore', gruppo: 'approvata', colore: '#2f6e4a', sfondo: '#d0ded7', descrizione: 'Approvata dal coordinatore' },
  'In attesa di validazione HR': { stato: 'In attesa di validazione HR', gruppo: 'attesa', colore: '#514c9b', sfondo: '#e6e4f3', descrizione: 'Da validare da parte di HR' },
  'Integrazione richiesta da HR': { stato: 'Integrazione richiesta da HR', gruppo: 'integrazione', colore: '#8f4a12', sfondo: '#fff5dd', descrizione: 'HR chiede una correzione' },
  'Respinta da HR': { stato: 'Respinta da HR', gruppo: 'respinta', colore: '#b8203b', sfondo: '#f7dbe5', descrizione: 'Respinta da HR' },
  'Validata da HR': { stato: 'Validata da HR', gruppo: 'approvata', colore: '#1f5236', sfondo: '#d0ded7', descrizione: 'Ore riconosciute in via definitiva' },
  'Inclusa nel riepilogo mensile': { stato: 'Inclusa nel riepilogo mensile', gruppo: 'chiusa', colore: '#00467e', sfondo: '#b2d6ed', descrizione: 'Mese chiuso da HR' },
  'Inviata a Payroll': { stato: 'Inviata a Payroll', gruppo: 'chiusa', colore: '#00467e', sfondo: '#a1c8e7', descrizione: "Trasmessa all'Ufficio Paghe" },
  Annullata: { stato: 'Annullata', gruppo: 'annullata', colore: '#595959', sfondo: '#ececec', descrizione: 'Annullata dal lavoratore' },
};

/** Stati in cui il lavoratore può modificare e (re)inviare la richiesta. */
export const MODIFICABILI_DAL_LAVORATORE: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Bozza',
  'Integrazione richiesta dal coordinatore',
  'Integrazione richiesta da HR',
]);

/** Stati in cui il lavoratore può annullare la richiesta (non ancora approvata). */
export const ANNULLABILI_DAL_LAVORATORE: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Bozza',
  'Inviata al coordinatore',
  'In attesa del coordinatore',
  'Integrazione richiesta dal coordinatore',
  'Integrazione richiesta da HR',
]);

/** Stati in cui il coordinatore decide. */
export const IN_ATTESA_COORDINATORE: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Inviata al coordinatore',
  'In attesa del coordinatore',
]);

/** Stati in cui HR decide. */
export const IN_ATTESA_HR: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Approvata dal coordinatore',
  'In attesa di validazione HR',
]);

/** Stati "aperti": il processo non è ancora concluso. */
export const APERTI: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Bozza',
  'Inviata al coordinatore',
  'In attesa del coordinatore',
  'Integrazione richiesta dal coordinatore',
  'Approvata dal coordinatore',
  'In attesa di validazione HR',
  'Integrazione richiesta da HR',
]);

/** Stati che escludono la richiesta dai controlli di duplicato e di somma delle sessioni. */
export const ESCLUSI_DAI_CONTROLLI: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Annullata',
  'Respinta dal coordinatore',
  'Respinta da HR',
]);

/** Stati dopo la validazione HR: nessuna modifica consentita. */
export const DEFINITIVI: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>([
  'Validata da HR',
  'Inclusa nel riepilogo mensile',
  'Inviata a Payroll',
]);

export type Azione =
  | 'salva'
  | 'invia'
  | 'annulla'
  | 'approvaCoord'
  | 'respingiCoord'
  | 'integrazioneCoord'
  | 'validaHR'
  | 'respingiHR'
  | 'integrazioneHR'
  | 'chiudiMese'
  | 'inviaPayroll';

/**
 * Transizioni ammesse: stato di partenza -> azione -> stato di arrivo, con il ruolo autorizzato.
 * Gli stati "Inviata al coordinatore" e "Approvata dal coordinatore" sono attraversati
 * automaticamente (come farebbero i flussi F1 e F2): vedi `statoDopo`.
 */
export const TRANSIZIONI: ReadonlyArray<{ da: ReadonlySet<StatoRichiesta>; azione: Azione; a: StatoRichiesta; ruolo: Ruolo }> = [
  { da: MODIFICABILI_DAL_LAVORATORE, azione: 'salva', a: 'Bozza', ruolo: 'lavoratore' },
  { da: MODIFICABILI_DAL_LAVORATORE, azione: 'invia', a: 'Inviata al coordinatore', ruolo: 'lavoratore' },
  { da: ANNULLABILI_DAL_LAVORATORE, azione: 'annulla', a: 'Annullata', ruolo: 'lavoratore' },
  { da: IN_ATTESA_COORDINATORE, azione: 'approvaCoord', a: 'Approvata dal coordinatore', ruolo: 'coordinatore' },
  { da: IN_ATTESA_COORDINATORE, azione: 'respingiCoord', a: 'Respinta dal coordinatore', ruolo: 'coordinatore' },
  { da: IN_ATTESA_COORDINATORE, azione: 'integrazioneCoord', a: 'Integrazione richiesta dal coordinatore', ruolo: 'coordinatore' },
  { da: IN_ATTESA_HR, azione: 'validaHR', a: 'Validata da HR', ruolo: 'hr' },
  { da: IN_ATTESA_HR, azione: 'respingiHR', a: 'Respinta da HR', ruolo: 'hr' },
  { da: IN_ATTESA_HR, azione: 'integrazioneHR', a: 'Integrazione richiesta da HR', ruolo: 'hr' },
  { da: new Set<StatoRichiesta>(['Validata da HR']), azione: 'chiudiMese', a: 'Inclusa nel riepilogo mensile', ruolo: 'hr' },
  { da: new Set<StatoRichiesta>(['Inclusa nel riepilogo mensile']), azione: 'inviaPayroll', a: 'Inviata a Payroll', ruolo: 'hr' },
];

/** Restituisce lo stato di arrivo, o `null` se la transizione non è ammessa. */
export function statoDopo(da: StatoRichiesta, azione: Azione): StatoRichiesta | null {
  const t = TRANSIZIONI.find((x) => x.azione === azione && x.da.has(da));
  return t ? t.a : null;
}

/** Stati attraversati automaticamente dal sistema (flussi F1 e F2). */
export const PASSAGGIO_AUTOMATICO: Partial<Record<StatoRichiesta, StatoRichiesta>> = {
  'Inviata al coordinatore': 'In attesa del coordinatore',
  'Approvata dal coordinatore': 'In attesa di validazione HR',
};
