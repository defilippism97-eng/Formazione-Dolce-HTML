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
  CorrezioneCorsoInput,
  Corso,
  DatiRichiestaInput,
  ErroreValidazione,
  EsitoDecisione,
  FilePaghe,
  FiltriRichieste,
  Lavoratore,
  MonteOre,
  Notifica,
  Richiesta,
  SegnalazioneVariazione,
  SituazioneMonteOre,
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
  /**
   * Monte ore dei permessi (diritto allo studio, riqualifica professionale) attivati da HR
   * per questo lavoratore: se è vuoto, il lavoratore può rendicontare solo la formazione.
   */
  monteOre: SituazioneMonteOre[];
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
  /** Solo per i permessi: situazione del monte ore da cui si scalano le ore (senza contare questa richiesta in `oreResidue`). */
  monteOre?: SituazioneMonteOre & { oreResidueSenzaQuesta: number };
  /** Il corso prevede il gettone (per i corsi a catalogo). */
  gettonePrevisto: boolean;
  /** Nome dell'ente che ha organizzato il corso (stringa vuota se non indicato o per i permessi). */
  nomeEnteCorso: string;
}

/**
 * Decisione di coordinatore o HR. In approvazione le tre voci devono sommare alle ore frequentate.
 * Per i permessi: `oreRetribuite` = ore di permesso riconosciute (a carico del monte ore),
 * `oreNonRetribuite` = ore non riconosciute, `oreGettone` = 0.
 */
export interface DecisioneInput {
  esito: EsitoDecisione;
  oreRetribuite: number;
  oreGettone: number;
  oreNonRetribuite: number;
  nota?: string;
}

export interface DecisioneMultiplaInput {
  esito: EsitoDecisione;
  nota?: string;
  /** Ore non indicate = si usano le ore riconosciute dal coordinatore (le tre voci vanno indicate insieme). */
  voci: { id: string; oreRetribuite?: number; oreGettone?: number; oreNonRetribuite?: number }[];
}

export interface RisultatoMultiplo {
  elaborate: number;
  scartate: { id: string; numero: string; motivo: string }[];
}

export interface LavoratoreTeam {
  id: string;
  login: string;
  nominativo: string;
  area: string;
  servizio: string;
  centroDiCosto: string;
  stato: StatoLavoratore;
  /** Segnalazioni di variazione dell'organigramma ancora da gestire da parte di HR. */
  segnalazioniAperte: number;
}

/** Richieste ancora aperte di un coordinatore, per l'avviso alla chiusura del mese. */
export interface ApertePerCoordinatore {
  coordinatoreLogin?: string;
  coordinatoreNome: string;
  /** In attesa della decisione del coordinatore. */
  inAttesaCoordinatore: number;
  /** In attesa di correzione da parte del lavoratore. */
  inIntegrazione: number;
  /** Già approvate dal coordinatore, in attesa di HR. */
  inAttesaHR: number;
  totale: number;
}

export interface StatoMese {
  chiusura: ChiusuraMensile;
  /** Richieste del mese non ancora concluse (escluse le bozze). */
  aperte: Richiesta[];
  /** Le stesse richieste raggruppate per coordinatore, dal più carico al meno carico. */
  apertePerCoordinatore: ApertePerCoordinatore[];
  /** Richieste validate da HR, pronte per la chiusura. */
  validate: number;
  /** Richieste incluse nel riepilogo, pronte per il file paghe. */
  daInviare: number;
  anomalie: Anomalia[];
}

export type MonteOreInput = Pick<MonteOre, 'lavoratoreId' | 'tipo' | 'oreTotali' | 'validoDal' | 'validoAl' | 'attivo' | 'note'> & { id?: string };

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
  /**
   * Segnala a HR una variazione dei dati organizzativi (servizio, coordinatore...).
   * Senza `lavoratoreId` riguarda chi chiama; con `lavoratoreId` è il coordinatore che segnala
   * per un lavoratore del proprio team. Restituisce il profilo di chi chiama.
   */
  segnalaVariazione(testo: string, lavoratoreId?: string): Promise<Profilo>;

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
  /**
   * Corregge titolo e dati di un corso esterno inserito dal lavoratore, prima di approvare
   * (coordinatore della richiesta o HR). La correzione vale per tutte le sessioni non ancora
   * validate dello stesso corso.
   */
  correggiCorso(richiestaId: string, dati: CorrezioneCorsoInput): Promise<Richiesta>;

  // --- Monte ore dei permessi (HR)
  getMontiOre(): Promise<SituazioneMonteOre[]>;
  salvaMonteOre(m: MonteOreInput): Promise<SituazioneMonteOre>;

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
