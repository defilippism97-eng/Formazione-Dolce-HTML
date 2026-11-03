/**
 * Client delle API REST di produzione (contratto: docs/API.md).
 *
 * Il server deve: autenticare l'utente con Microsoft Entra ID, calcolare i ruoli,
 * applicare permessi e regole del modulo `src/domain` a ogni chiamata, salvare dati
 * e allegati (es. liste e raccolte SharePoint tramite Microsoft Graph, oppure un database),
 * scrivere il registro delle modifiche e inviare le notifiche.
 */
import type {
  AssegnazioneRuolo,
  ChiusuraMensile,
  Corso,
  FilePaghe,
  FiltriRichieste,
  Lavoratore,
  Notifica,
  Richiesta,
  Sessione,
  Struttura,
  VoceRegistro,
} from '../../domain';
import {
  ErroreApi,
  type AmbitoRichieste,
  type Anagrafiche,
  type Backend,
  type CodiceErrore,
  type DecisioneInput,
  type DecisioneMultiplaInput,
  type DettaglioRichiesta,
  type LavoratoreTeam,
  type Profilo,
  type RisultatoMultiplo,
  type SalvaRichiestaInput,
  type StatoMese,
} from '../api';
import type { ProviderAccesso } from './auth';

export interface OpzioniBackendHttp {
  baseUrl: string;
  accesso: ProviderAccesso;
  /** Timeout delle chiamate in millisecondi. */
  timeoutMs?: number;
}

const CODICI_PER_STATO: Record<number, CodiceErrore> = { 400: 'VALIDAZIONE', 401: 'NON_AUTENTICATO', 403: 'NON_AUTORIZZATO', 404: 'NON_TROVATO', 409: 'CONFLITTO', 422: 'VALIDAZIONE' };

export class BackendHttp implements Backend {
  readonly modalita = 'produzione' as const;
  private readonly base: string;

  constructor(private readonly opz: OpzioniBackendHttp) {
    this.base = opz.baseUrl.replace(/\/$/, '');
  }

  // ------------------------------------------------------------------ http
  private async chiama<T>(metodo: string, percorso: string, corpo?: unknown, opzioni: { ok404?: boolean; blob?: boolean } = {}): Promise<T> {
    const intestazioni: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    const token = await this.opz.accesso.token();
    if (token) intestazioni.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (corpo instanceof FormData) body = corpo;
    else if (corpo !== undefined) {
      intestazioni['Content-Type'] = 'application/json';
      body = JSON.stringify(corpo);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opz.timeoutMs ?? 60_000);
    let risposta: Response;
    try {
      risposta = await fetch(`${this.base}${percorso}`, { method: metodo, headers: intestazioni, body, credentials: 'include', signal: controller.signal });
    } catch {
      throw new ErroreApi('ERRORE', 'Impossibile contattare il server: verifica la connessione e riprova.');
    } finally {
      clearTimeout(timer);
    }
    if (risposta.status === 404 && opzioni.ok404) return null as T;
    if (!risposta.ok) {
      let dati: { codice?: CodiceErrore; messaggio?: string; dettagli?: ErroreApi['dettagli']; richiestaConferma?: 'duplicato' } = {};
      try {
        dati = await risposta.json();
      } catch {
        /* corpo non JSON */
      }
      throw new ErroreApi(
        dati.codice ?? CODICI_PER_STATO[risposta.status] ?? 'ERRORE',
        dati.messaggio ?? 'Si è verificato un errore. Riprova più tardi.',
        dati.dettagli ?? [],
        dati.richiestaConferma,
      );
    }
    if (opzioni.blob) return (await risposta.blob()) as T;
    if (risposta.status === 204) return undefined as T;
    return (await risposta.json()) as T;
  }

  private qs(parametri: object): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(parametri)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  // ---------------------------------------------------------- autenticazione
  async sessioneCorrente(): Promise<Sessione | null> {
    try {
      return await this.chiama<Sessione>('GET', '/me');
    } catch (e) {
      if (e instanceof ErroreApi && e.codice === 'NON_AUTENTICATO') return null;
      throw e;
    }
  }
  accedi(): Promise<Sessione> {
    return this.opz.accesso.accedi();
  }
  async esci(): Promise<void> {
    await this.opz.accesso.esci();
  }

  // ----------------------------------------------------------------- profilo
  getProfilo() {
    return this.chiama<Profilo>('GET', '/profilo');
  }
  aggiornaProfilo(dati: { emailContatto?: string; codiceFiscale?: string }) {
    return this.chiama<Profilo>('PATCH', '/profilo', dati);
  }
  segnalaVariazione(testo: string) {
    return this.chiama<Profilo>('POST', '/profilo/segnalazioni', { testo });
  }

  // ----------------------------------------------------------- consultazione
  getCatalogo() {
    return this.chiama<Corso[]>('GET', '/catalogo');
  }
  getStoricoCorsiEsterni() {
    return this.chiama<Corso[]>('GET', '/catalogo/storico-esterni');
  }
  getChiusure() {
    return this.chiama<ChiusuraMensile[]>('GET', '/chiusure');
  }

  // -------------------------------------------------------------- lavoratore
  getMieRichieste() {
    return this.chiama<Richiesta[]>('GET', '/richieste/mie');
  }
  salvaRichiesta(input: SalvaRichiestaInput, azione: 'bozza' | 'invia') {
    const { allegatiNuovi, ...dati } = input;
    const form = new FormData();
    form.set('dati', JSON.stringify(dati));
    allegatiNuovi.forEach((f, i) => {
      form.set(`allegato_${i}`, f.contenuto, f.nome);
      form.set(`tipo_${i}`, f.tipo);
    });
    const percorso = input.id ? `/richieste/${encodeURIComponent(input.id)}` : '/richieste';
    return this.chiama<Richiesta>(input.id ? 'PUT' : 'POST', `${percorso}${this.qs({ azione })}`, form);
  }
  annullaRichiesta(id: string) {
    return this.chiama<Richiesta>('POST', `/richieste/${encodeURIComponent(id)}/annulla`);
  }

  // ------------------------------------------------------------------ comuni
  getDettaglio(id: string) {
    return this.chiama<DettaglioRichiesta>('GET', `/richieste/${encodeURIComponent(id)}`);
  }
  async scaricaAllegato(richiestaId: string, allegatoId: string) {
    const d = await this.getDettaglio(richiestaId);
    const a = d.richiesta.allegati.find((x) => x.id === allegatoId);
    const contenuto = await this.chiama<Blob>('GET', `/richieste/${encodeURIComponent(richiestaId)}/allegati/${encodeURIComponent(allegatoId)}`, undefined, { blob: true });
    return { nome: a?.nome ?? 'allegato', mime: a?.mime ?? contenuto.type, contenuto };
  }

  // ------------------------------------------------------ coordinatore e HR
  getRichieste(ambito: AmbitoRichieste, filtri: FiltriRichieste = {}) {
    return this.chiama<Richiesta[]>('GET', `/richieste${this.qs({ ambito, ...filtri })}`);
  }
  getLavoratoriTeam() {
    return this.chiama<LavoratoreTeam[]>('GET', '/team/lavoratori');
  }
  decisioneCoordinatore(id: string, input: DecisioneInput) {
    return this.chiama<Richiesta>('POST', `/richieste/${encodeURIComponent(id)}/decisione-coordinatore`, input);
  }
  decisioneHR(input: DecisioneMultiplaInput) {
    return this.chiama<RisultatoMultiplo>('POST', '/richieste/decisione-hr', input);
  }

  // ----------------------------------------------------- chiusure e paghe
  getStatoMese(anno: number, mese: number) {
    return this.chiama<StatoMese>('GET', `/chiusure/${anno}/${mese}`);
  }
  chiudiMese(anno: number, mese: number, note?: string) {
    return this.chiama<ChiusuraMensile>('POST', `/chiusure/${anno}/${mese}/chiudi`, { note });
  }
  riapriMese(anno: number, mese: number, motivo: string) {
    return this.chiama<ChiusuraMensile>('POST', `/chiusure/${anno}/${mese}/riapri`, { motivo });
  }
  generaFilePaghe(anno: number, mese: number) {
    return this.chiama<FilePaghe>('POST', `/chiusure/${anno}/${mese}/file-paghe`);
  }
  async scaricaFilePaghe(periodo: string, fileId: string) {
    const blob = await this.chiama<Blob>('GET', `/chiusure/${encodeURIComponent(periodo)}/file-paghe/${encodeURIComponent(fileId)}`, undefined, { blob: true });
    return { nome: `Formazione_Payroll_${periodo}.csv`, contenuto: await blob.text() };
  }

  // ---------------------------------------------------------- amministrazione
  getAnagrafiche() {
    return this.chiama<Anagrafiche>('GET', '/anagrafiche');
  }
  salvaLavoratore(l: Omit<Lavoratore, 'id' | 'segnalazioni'> & { id?: string }) {
    return l.id ? this.chiama<Lavoratore>('PUT', `/lavoratori/${encodeURIComponent(l.id)}`, l) : this.chiama<Lavoratore>('POST', '/lavoratori', l);
  }
  salvaStruttura(s: Omit<Struttura, 'id'> & { id?: string }) {
    return s.id ? this.chiama<Struttura>('PUT', `/strutture/${encodeURIComponent(s.id)}`, s) : this.chiama<Struttura>('POST', '/strutture', s);
  }
  salvaCorso(c: Omit<Corso, 'id'> & { id?: string }) {
    return c.id ? this.chiama<Corso>('PUT', `/corsi/${encodeURIComponent(c.id)}`, c) : this.chiama<Corso>('POST', '/corsi', c);
  }
  salvaRuolo(r: Omit<AssegnazioneRuolo, 'id'> & { id?: string }) {
    return r.id ? this.chiama<AssegnazioneRuolo>('PUT', `/ruoli/${encodeURIComponent(r.id)}`, r) : this.chiama<AssegnazioneRuolo>('POST', '/ruoli', r);
  }
  chiudiSegnalazione(lavoratoreId: string, indice: number) {
    return this.chiama<void>('POST', `/lavoratori/${encodeURIComponent(lavoratoreId)}/segnalazioni/${indice}/chiudi`);
  }
  getRegistro(filtri: { richiestaId?: string; entita?: VoceRegistro['entita'] } = {}) {
    return this.chiama<VoceRegistro[]>('GET', `/registro${this.qs(filtri)}`);
  }

  // ---------------------------------------------------------------- notifiche
  getNotifiche() {
    return this.chiama<Notifica[]>('GET', '/notifiche');
  }
}
