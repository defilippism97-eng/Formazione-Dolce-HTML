/**
 * Persistenza della modalità DEMO: dati in localStorage, allegati in IndexedDB.
 * Ogni archivio ha un'alternativa in memoria (test automatici, navigazione privata).
 */
import type {
  AssegnazioneRuolo,
  ChiusuraMensile,
  Corso,
  DataISO,
  Lavoratore,
  MonteOre,
  Notifica,
  Richiesta,
  Struttura,
  UtenteDirectory,
  VoceRegistro,
} from '../../domain';

export const VERSIONE_DATI = 2;

export interface ConfigurazioneDemo {
  emailHR: string;
  destinatariPaghe: string[];
  /** Patroni locali o altri giorni non lavorativi, formato MM-GG. */
  patroni: string[];
}

export interface DatiDemo {
  versione: number;
  creatoIl: string;
  utenti: UtenteDirectory[];
  password: Record<string, string>;
  ruoli: AssegnazioneRuolo[];
  strutture: Struttura[];
  lavoratori: Lavoratore[];
  corsi: Corso[];
  /** Monte ore dei permessi (diritto allo studio, riqualifica professionale) assegnati da HR. */
  montiOre: MonteOre[];
  richieste: Richiesta[];
  chiusure: ChiusuraMensile[];
  registro: VoceRegistro[];
  notifiche: Notifica[];
  contatori: { richiestePerAnno: Record<string, number>; corsiEsterni: number; id: number };
  ultimoPromemoria?: DataISO;
  config: ConfigurazioneDemo;
}

// ---------------------------------------------------------------------------
//  Dati (JSON)
// ---------------------------------------------------------------------------
export interface Persistenza {
  carica(): DatiDemo | null;
  salva(dati: DatiDemo): void;
  cancella(): void;
}

export class PersistenzaMemoria implements Persistenza {
  private dati: DatiDemo | null = null;
  carica(): DatiDemo | null {
    return this.dati ? structuredClone(this.dati) : null;
  }
  salva(dati: DatiDemo): void {
    this.dati = structuredClone(dati);
  }
  cancella(): void {
    this.dati = null;
  }
}

export class PersistenzaLocalStorage implements Persistenza {
  constructor(private readonly chiave = 'sdf-gestione-ore-formazione-demo') {}

  carica(): DatiDemo | null {
    try {
      const testo = window.localStorage.getItem(this.chiave);
      if (!testo) return null;
      const dati = JSON.parse(testo) as DatiDemo;
      return dati.versione === VERSIONE_DATI ? dati : null;
    } catch {
      return null;
    }
  }

  salva(dati: DatiDemo): void {
    try {
      window.localStorage.setItem(this.chiave, JSON.stringify(dati));
    } catch (e) {
      // spazio esaurito o archiviazione bloccata: la demo continua in memoria
      console.warn('Impossibile salvare i dati demo nel browser', e);
    }
  }

  cancella(): void {
    try {
      window.localStorage.removeItem(this.chiave);
    } catch {
      /* ignorato */
    }
  }
}

/** Sceglie localStorage se disponibile, altrimenti la memoria. */
export function persistenzaPredefinita(): Persistenza {
  try {
    const k = '__sdf_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return new PersistenzaLocalStorage();
  } catch {
    return new PersistenzaMemoria();
  }
}

// ---------------------------------------------------------------------------
//  File allegati (Blob)
// ---------------------------------------------------------------------------
export interface ArchivioFile {
  leggi(id: string): Promise<Blob | null>;
  scrivi(id: string, contenuto: Blob): Promise<void>;
  elimina(id: string): Promise<void>;
  svuota(): Promise<void>;
}

export class ArchivioFileMemoria implements ArchivioFile {
  private readonly file = new Map<string, Blob>();
  async leggi(id: string) {
    return this.file.get(id) ?? null;
  }
  async scrivi(id: string, contenuto: Blob) {
    this.file.set(id, contenuto);
  }
  async elimina(id: string) {
    this.file.delete(id);
  }
  async svuota() {
    this.file.clear();
  }
}

export class ArchivioFileIndexedDB implements ArchivioFile {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly nomeDb = 'sdf-gestione-ore-formazione-allegati') {}

  private apri(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.nomeDb, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('file');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async operazione<T>(modo: IDBTransactionMode, azione: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.apri();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('file', modo);
      const req = azione(tx.objectStore('file'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async leggi(id: string) {
    const v = await this.operazione<unknown>('readonly', (s) => s.get(id));
    return v instanceof Blob ? v : null;
  }
  async scrivi(id: string, contenuto: Blob) {
    await this.operazione('readwrite', (s) => s.put(contenuto, id));
  }
  async elimina(id: string) {
    await this.operazione('readwrite', (s) => s.delete(id));
  }
  async svuota() {
    await this.operazione('readwrite', (s) => s.clear());
  }
}

export function archivioFilePredefinito(): ArchivioFile {
  return typeof indexedDB !== 'undefined' ? new ArchivioFileIndexedDB() : new ArchivioFileMemoria();
}

// ---------------------------------------------------------------------------
//  Sessione (utente collegato)
// ---------------------------------------------------------------------------
export interface ArchivioSessione {
  leggi(): string | null;
  scrivi(login: string | null): void;
}

export class SessioneMemoria implements ArchivioSessione {
  private login: string | null = null;
  leggi() {
    return this.login;
  }
  scrivi(login: string | null) {
    this.login = login;
  }
}

export class SessioneBrowser implements ArchivioSessione {
  private readonly chiave = 'sdf-gestione-ore-formazione-sessione';
  leggi() {
    try {
      return window.sessionStorage.getItem(this.chiave);
    } catch {
      return null;
    }
  }
  scrivi(login: string | null) {
    try {
      if (login) window.sessionStorage.setItem(this.chiave, login);
      else window.sessionStorage.removeItem(this.chiave);
    } catch {
      /* ignorato */
    }
  }
}
