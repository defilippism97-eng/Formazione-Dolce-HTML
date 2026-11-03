/**
 * Contratto di accesso ai dati ("Backend").
 *
 * L'interfaccia utente usa SOLO questa interfaccia. Esistono due implementazioni:
 *  - `data/demo/backend-demo.ts`: backend simulato nel browser (modalità DEMO), che applica
 *    gli stessi controlli di autorizzazione e di processo che deve applicare il server reale;
 *  - `data/http/backend-http.ts`: client delle API REST reali (vedi docs/API.md).
 *
 * Regola d'oro per la produzione: il server ricontrolla SEMPRE identità, permessi e regole
 * (modulo `src/domain`); i controlli nel browser servono solo a dare messaggi immediati.
 */
import type {
  AssegnazioneRuolo,
  AzioniConsentite,
  ChiusuraMensile,
  Corso,
  DatiRichiestaInput,
  ErroreValidazione,
  EsitoDecisione,
  FilePaghe,
  FiltriRichieste,
  Lavoratore,
  Notifica,
  Richiesta,
  SegnalazioneVariazione,
  Sessione,
  StatoLavoratore,
  Struttura,
  TipoAllegato,
  UtenteDirectory,
  VoceRegistro,
} from '../domain';
import type { Anomalia } from '../domain/anomalie';

export type CodiceErrore = 'NON_AUTENTICATO' | 'NON_AUTORIZZATO' | 'NON_TROVATO' | 'VALIDAZIONE' | 'CONFLITTO' | 'ERRORE';

/** Errore restituito dal backend, con un messaggio già comprensibile per l'utente. */
export class ErroreApi extends Error {
  constructor(
    public readonly codice: CodiceErrore,
    messaggio: string,
    public readonly dettagli: ErroreValidazione[] = [],
    /** Richiesta di conferma esplicita (es. possibile duplicato). */
    public readonly richiestaConferma?: 'duplicato',
  ) {
    super(messaggio);
    this.name = 'ErroreApi';
  }
}

export interface Credenziali {
  login: string;
  password: string;
}

export interface Profilo {
  login: string;
  nome: string;
  cognome: string;
  emailAziendale?: string;
  emailContatto?: string;
  cfRegistrato: boolean;
  cfMascherato?: string;
  area?: string;
  servizio?: string;
  centroDiCosto?: string;
  coordinatoreNome?: string;
  coordinatoreEmail?: string;
  stato?: StatoLavoratore;
  segnalazioni: SegnalazioneVariazione[];
}

export interface FileCaricato {
  tipo: TipoAllegato;
  nome: string;
  mime: string;
  contenuto: Blob;
}

export interface SalvaRichiestaInput extends DatiRichiestaInput {
  /** Assente per una nuova richiesta. */
  id?: string;
  allegatiNuovi: FileCaricato[];
  allegatiRimossi: string[];
  /** Conferma esplicita dell'invio nonostante un possibile duplicato. */
  confermaDuplicato?: boolean;
}

export interface DettaglioRichiesta {
  richiesta: Richiesta;
  azioni: AzioniConsentite;
  meseChiuso: boolean;
  /** Storico delle modifiche (solo per HR e amministratori; vuoto per gli altri). */
  storico: VoceRegistro[];
  /** Numeri delle altre richieste con stesso lavoratore, corso e data. */
  duplicati: string[];
}

export interface DecisioneInput {
  esito: EsitoDecisione;
  oreRetribuite: number;
  oreGettone: number;
  nota?: string;
}

export interface DecisioneMultiplaInput {
  esito: EsitoDecisione;
  nota?: string;
  /** Ore non indicate = si usano le ore riconosciute dal coordinatore. */
  voci: { id: string; oreRetribuite?: number; oreGettone?: number }[];
}

export interface RisultatoMultiplo {
  elaborate: number;
  scartate: { id: string; numero: string; motivo: string }[];
}

export interface LavoratoreTeam {
  id: string;
  login: string;
  nominativo: string;
  servizio: string;
  centroDiCosto: string;
  stato: StatoLavoratore;
}

export interface StatoMese {
  chiusura: ChiusuraMensile;
  /** Richieste del mese non ancora concluse (escluse le bozze). */
  aperte: Richiesta[];
  /** Richieste validate da HR, pronte per la chiusura. */
  validate: number;
  /** Richieste incluse nel riepilogo, pronte per il file paghe. */
  daInviare: number;
  anomalie: Anomalia[];
}

export interface Anagrafiche {
  lavoratori: Lavoratore[];
  strutture: Struttura[];
  corsi: Corso[];
  ruoli: AssegnazioneRuolo[];
  utenti: UtenteDirectory[];
}

export interface AccountDemo {
  login: string;
  password: string;
  ruolo: string;
  descrizione: string;
}

export type AmbitoRichieste = 'team' | 'tutte';

export interface Backend {
  readonly modalita: 'demo' | 'produzione';

  // --- Autenticazione
  sessioneCorrente(): Promise<Sessione | null>;
  /** DEMO: credenziali degli account fantoccio. PRODUZIONE: avvia l'accesso Microsoft 365 (SSO). */
  accedi(credenziali?: Credenziali): Promise<Sessione>;
  esci(): Promise<void>;

  // --- Profilo del lavoratore
  getProfilo(): Promise<Profilo>;
  aggiornaProfilo(dati: { emailContatto?: string; codiceFiscale?: string }): Promise<Profilo>;
  segnalaVariazione(testo: string): Promise<Profilo>;

  // --- Dati di consultazione
  getCatalogo(): Promise<Corso[]>;
  getStoricoCorsiEsterni(): Promise<Corso[]>;
  getChiusure(): Promise<ChiusuraMensile[]>;

  // --- Lavoratore
  getMieRichieste(): Promise<Richiesta[]>;
  salvaRichiesta(input: SalvaRichiestaInput, azione: 'bozza' | 'invia'): Promise<Richiesta>;
  annullaRichiesta(id: string): Promise<Richiesta>;

  // --- Comuni
  getDettaglio(id: string): Promise<DettaglioRichiesta>;
  scaricaAllegato(richiestaId: string, allegatoId: string): Promise<{ nome: string; mime: string; contenuto: Blob }>;

  // --- Coordinatore e HR
  /** `team`: richieste dei lavoratori assegnati al coordinatore; `tutte`: solo HR/amministratori. */
  getRichieste(ambito: AmbitoRichieste, filtri?: FiltriRichieste): Promise<Richiesta[]>;
  getLavoratoriTeam(): Promise<LavoratoreTeam[]>;
  decisioneCoordinatore(id: string, input: DecisioneInput): Promise<Richiesta>;
  decisioneHR(input: DecisioneMultiplaInput): Promise<RisultatoMultiplo>;

  // --- Chiusura mensile e paghe (HR)
  getStatoMese(anno: number, mese: number): Promise<StatoMese>;
  chiudiMese(anno: number, mese: number, note?: string): Promise<ChiusuraMensile>;
  riapriMese(anno: number, mese: number, motivo: string): Promise<ChiusuraMensile>;
  generaFilePaghe(anno: number, mese: number): Promise<FilePaghe>;
  scaricaFilePaghe(periodo: string, fileId: string): Promise<{ nome: string; contenuto: string }>;

  // --- Amministrazione
  getAnagrafiche(): Promise<Anagrafiche>;
  salvaLavoratore(l: Omit<Lavoratore, 'id' | 'segnalazioni'> & { id?: string }): Promise<Lavoratore>;
  salvaStruttura(s: Omit<Struttura, 'id'> & { id?: string }): Promise<Struttura>;
  salvaCorso(c: Omit<Corso, 'id'> & { id?: string }): Promise<Corso>;
  salvaRuolo(r: Omit<AssegnazioneRuolo, 'id'> & { id?: string }): Promise<AssegnazioneRuolo>;
  chiudiSegnalazione(lavoratoreId: string, indice: number): Promise<void>;
  getRegistro(filtri?: { richiestaId?: string; entita?: VoceRegistro['entita'] }): Promise<VoceRegistro[]>;

  // --- Notifiche ricevute dall'utente collegato (in DEMO: posta simulata)
  getNotifiche(): Promise<Notifica[]>;

  /** Strumenti disponibili solo in modalità DEMO. */
  readonly demo?: StrumentiDemo;
}

export interface StrumentiDemo {
  account: AccountDemo[];
  /** Simula l'esecuzione giornaliera del Flusso 4 (promemoria). Restituisce il numero di notifiche inviate. */
  eseguiPromemoria(): Promise<number>;
  /** Simula il Flusso 5 (riepilogo del mese precedente a coordinatori e HR). */
  eseguiRiepilogoMensile(): Promise<number>;
  /** Ripristina i dati dimostrativi iniziali. */
  ripristina(): Promise<void>;
}
