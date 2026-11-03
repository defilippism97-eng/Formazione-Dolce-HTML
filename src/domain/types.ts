/**
 * Modello dati di dominio dell'app "Gestione ore formazione".
 *
 * Questi tipi sono il contratto condiviso tra interfaccia, backend simulato (DEMO)
 * e backend reale (vedi docs/API.md). Non dipendono da React né dal browser.
 */

export const AREE = [
  'Area Nord Ovest',
  'Area Centro',
  'Area Educativa',
  'Area Socio Sanitaria',
  'Area Staff',
] as const;
export type Area = (typeof AREE)[number];

export const MODALITA = ['In presenza', 'A distanza - sincrona', 'A distanza - asincrona'] as const;
export type Modalita = (typeof MODALITA)[number];

export const ENTI = ['Datore di lavoro', 'Committente o altro soggetto'] as const;
/** Datore di lavoro = corso interno a catalogo; Committente o altro soggetto = corso esterno. */
export type EnteErogatore = (typeof ENTI)[number];

export type StatoLavoratore = 'Attivo' | 'Non attivo';
export type OrigineCorso = 'Catalogo aziendale' | 'Inserito dal lavoratore';
export type StatoValidazioneCorso = 'Da validare' | 'Validato' | 'Scartato';
export type StatoPeriodo = 'Aperto' | 'Chiuso' | 'Riaperto';
export type TipoAllegato = 'Attestato' | 'Altra documentazione';

/** Ruoli applicativi. Un utente può averne più di uno (es. coordinatore che è anche lavoratore). */
export type Ruolo = 'lavoratore' | 'coordinatore' | 'hr' | 'admin';
export const ETICHETTA_RUOLO: Record<Ruolo, string> = {
  lavoratore: 'Lavoratore',
  coordinatore: 'Coordinatore',
  hr: 'Formazione HR',
  admin: 'Amministratore',
};

/** Data di calendario in formato ISO `AAAA-MM-GG` (senza fuso orario). */
export type DataISO = string;
/** Istante in formato ISO 8601 UTC, es. `2026-10-14T08:30:00.000Z`. */
export type IstanteISO = string;
/** Orario `HH:mm`. */
export type Orario = string;

/** Utente della directory aziendale (in produzione: Microsoft Entra ID). */
export interface UtenteDirectory {
  login: string; // UPN Microsoft 365 in minuscolo
  nome: string;
  cognome: string;
  emailAziendale?: string; // assente per chi non ha la casella di posta
}

/** Assegnazione dei ruoli HR/Amministratore (il ruolo coordinatore deriva dall'organigramma). */
export interface AssegnazioneRuolo {
  id: string;
  login: string;
  ruolo: 'hr' | 'admin';
  attivo: boolean;
}

export interface Struttura {
  id: string;
  area: Area;
  servizio: string;
  centroDiCosto: string;
  coordinatoreResponsabileLogin?: string;
  coordinatoreServizioLogin?: string;
  emailCoordinatoreServizio?: string;
  dataInizioValidita?: DataISO;
  dataFineValidita?: DataISO;
  attiva: boolean;
}

export interface SegnalazioneVariazione {
  testo: string;
  data: IstanteISO;
  aperta: boolean;
  gestitaDa?: string;
  gestitaIl?: IstanteISO;
}

export interface Lavoratore {
  id: string;
  login: string;
  cognome: string;
  nome: string;
  emailAziendale?: string;
  /** E-mail di contatto inserita dal lavoratore al primo accesso: riceve le notifiche. */
  emailContatto?: string;
  /** Visibile in chiaro solo a HR e amministratori. */
  codiceFiscale?: string;
  strutturaId: string;
  coordinatoreLogin?: string;
  stato: StatoLavoratore;
  inizioAssegnazione?: DataISO;
  fineAssegnazione?: DataISO;
  segnalazioni: SegnalazioneVariazione[];
}

export interface Corso {
  id: string;
  codice: string;
  titolo: string;
  descrizione?: string;
  ente: EnteErogatore;
  nomeEnte?: string;
  tipologia?: string;
  modalita: Modalita;
  durataOre: number;
  gettonePrevisto: boolean;
  attivo: boolean;
  piuGiornate: boolean;
  origine: OrigineCorso;
  statoValidazione: StatoValidazioneCorso;
  /** Per i corsi esterni: lavoratore che li ha inseriti (storico personale). */
  loginAutore?: string;
}

export interface Allegato {
  id: string;
  tipo: TipoAllegato;
  nome: string;
  mime: string;
  dimensione: number;
  caricatoIl: IstanteISO;
}

export interface Dichiarazioni {
  partecipazione: boolean;
  correttezza: boolean;
  autorizzazione: boolean;
}

export const STATI_RICHIESTA = [
  'Bozza',
  'Inviata al coordinatore',
  'In attesa del coordinatore',
  'Integrazione richiesta dal coordinatore',
  'Respinta dal coordinatore',
  'Approvata dal coordinatore',
  'In attesa di validazione HR',
  'Integrazione richiesta da HR',
  'Respinta da HR',
  'Validata da HR',
  'Inclusa nel riepilogo mensile',
  'Inviata a Payroll',
  'Annullata',
] as const;
export type StatoRichiesta = (typeof STATI_RICHIESTA)[number];

export interface Richiesta {
  id: string;
  /** Numero leggibile, es. RF-2026-000123. */
  numero: string;
  // --- Lavoratore (copia al momento della richiesta: conserva lo storico organizzativo)
  lavoratoreId: string;
  login: string;
  cognome: string;
  nome: string;
  emailAziendale?: string;
  emailContatto?: string;
  area: Area;
  servizio: string;
  centroDiCosto: string;
  strutturaId: string;
  coordinatoreLogin?: string;
  coordinatoreNome?: string;
  // --- Corso
  corsoId?: string;
  codiceCorso: string;
  titoloCorso: string;
  /** Valorizzato solo per i corsi non presenti a catalogo. */
  titoloCorsoLibero?: string;
  durataCorso: number;
  ente: EnteErogatore;
  modalita: Modalita;
  piuGiornate: boolean;
  // --- Sessione e presenza
  dataSessione: DataISO;
  oraInizioSessione: Orario;
  oraFineSessione: Orario;
  durataSessione: number;
  oraIngresso: Orario;
  oraUscita: Orario;
  oreFrequentate: number;
  // --- Ore
  oreRetribuiteRichieste: number;
  oreGettoneRichieste: number;
  oreRetribuiteCoord?: number;
  oreGettoneCoord?: number;
  oreRetribuiteHR?: number;
  oreGettoneHR?: number;
  // --- Allegati e note
  allegati: Allegato[];
  noteLavoratore?: string;
  noteCoordinatore?: string;
  noteHR?: string;
  // --- Stato e date
  stato: StatoRichiesta;
  creatoIl: IstanteISO;
  inviatoIl?: IstanteISO;
  approvatoCoordIl?: IstanteISO;
  validatoHRIl?: IstanteISO;
  modificatoIl: IstanteISO;
  modificatoDa: string;
  meseCompetenza: number;
  annoCompetenza: number;
  periodoChiusura?: string;
  dichiarazioni: Dichiarazioni;
  // --- Controlli e promemoria
  possibileDuplicato: boolean;
  giorniAttesa: number;
  promemoriaInviati: number[];
  segnalataHR: boolean;
}

export interface FilePaghe {
  id: string;
  nome: string;
  versione: number;
  generatoIl: IstanteISO;
  generatoDa: string;
  righe: number;
  totaleOreRetribuite: number;
  totaleOreGettone: number;
  contenuto: string;
}

export interface Riapertura {
  data: IstanteISO;
  utente: string;
  motivo: string;
}

export interface ChiusuraMensile {
  periodo: string; // AAAA-MM
  anno: number;
  mese: number;
  stato: StatoPeriodo;
  dataChiusura?: IstanteISO;
  utenteChiusura?: string;
  numeroRichieste: number;
  totaleOreRiconosciute: number;
  totaleGettoni: number;
  filePaghe: FilePaghe[];
  noteHR?: string;
  riaperture: Riapertura[];
}

export type RuoloRegistro = 'Lavoratore' | 'Coordinatore' | 'Formazione HR' | 'Amministratore' | 'Sistema';

export interface VoceRegistro {
  id: string;
  data: IstanteISO;
  autore: string;
  ruolo: RuoloRegistro;
  azione: string;
  entita: 'Richiesta' | 'Lavoratore' | 'Struttura' | 'Corso' | 'Ruolo' | 'Chiusura';
  entitaId: string;
  richiestaId?: string;
  campo?: string;
  prima?: string;
  dopo?: string;
  nota?: string;
}

/** Notifica e-mail (in DEMO viene mostrata nella "Posta simulata"). */
export interface Notifica {
  id: string;
  data: IstanteISO;
  flusso: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'Sistema';
  destinatari: string[];
  oggetto: string;
  testo: string;
  richiestaId?: string;
}

/** Utente collegato con i ruoli calcolati dal server. */
export interface Sessione {
  login: string;
  nome: string;
  cognome: string;
  ruoli: Ruolo[];
  lavoratoreId?: string;
  /** Profilo completo = e-mail di contatto e codice fiscale presenti (obbligatori al primo accesso). */
  profiloCompleto: boolean;
}
