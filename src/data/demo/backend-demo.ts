/**
 * Backend simulato della modalità DEMO.
 *
 * Gira nel browser ma si comporta come il server reale: verifica la sessione, i permessi
 * (domain/permessi) e le regole di processo (domain/regole) a OGNI chiamata, scrive il
 * registro delle modifiche e genera le notifiche dei flussi F1–F6 (visibili nella "Posta").
 * È quindi anche la specifica eseguibile di ciò che il backend di produzione deve fare.
 */
import {
  ANNULLABILI_DAL_LAVORATORE,
  APERTI,
  arrotonda2,
  azioniConsentite,
  calcolaKPI,
  calcolaOre,
  consumoMonteOre,
  dataRomaDaIstante,
  filtraRichieste,
  generaCsvPaghe,
  haRuolo,
  isCodiceFiscaleValido,
  isEmailValida,
  isGiornoLavorativo,
  isUfficioHR,
  MAX_LUNGHEZZA_NOTE,
  mascheraCodiceFiscale,
  mesePrecedente,
  MODIFICABILI_DAL_LAVORATORE,
  monteOrePerData,
  nomeFilePaghe,
  periodiSovrapposti,
  periodo as periodoDi,
  periodoDiData,
  puoVedereRichiesta,
  righePaghe,
  rilevaAnomalie,
  ruoloRegistro,
  TIPI_PERMESSO,
  titoloRichiesta,
  totaliPaghe,
  trovaDuplicati,
  validaCorrezioneCorso,
  validaDecisione,
  validaRichiesta,
  valutaPromemoria,
} from '../../domain';
import type {
  AssegnazioneRuolo,
  ChiusuraMensile,
  CorrezioneCorsoInput,
  Corso,
  FilePaghe,
  FiltriRichieste,
  Lavoratore,
  MonteOre,
  Notifica,
  Richiesta,
  RipartizioneOre,
  RuoloRegistro,
  Sessione,
  SituazioneMonteOre,
  StatoRichiesta,
  Struttura,
  TipoPermesso,
  VoceRegistro,
} from '../../domain';
import {
  ErroreApi,
  type AmbitoRichieste,
  type Anagrafiche,
  type ApertePerCoordinatore,
  type Backend,
  type Credenziali,
  type DecisioneInput,
  type DecisioneMultiplaInput,
  type DettaglioRichiesta,
  type LavoratoreTeam,
  type MonteOreInput,
  type Profilo,
  type RisultatoMultiplo,
  type SalvaRichiestaInput,
  type StatoMese,
  type StrumentiDemo,
} from '../api';
import { messaggi, type Messaggio } from './messaggi';
import { ACCOUNT_DEMO, creaDatiDemo, pdfAttestatoSimulato } from './seed';
import type { ArchivioFile, ArchivioSessione, DatiDemo, Persistenza } from './store';

export const MAX_DIMENSIONE_ALLEGATO = 10 * 1024 * 1024;
export const MAX_ALLEGATI = 5;
export const TIPI_ALLEGATO_AMMESSI = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];

export interface OpzioniBackendDemo {
  persistenza: Persistenza;
  archivio: ArchivioFile;
  sessione: ArchivioSessione;
  /** Orologio iniettabile (test). */
  adesso?: () => Date;
  /** Ritardo simulato delle chiamate in millisecondi (realismo dell'interfaccia). */
  ritardoMs?: number;
}

const NON_TROVATA = 'Richiesta non trovata o non autorizzata.';
/** Stati dopo la validazione HR: i dati della richiesta non si toccano più. */
const DEFINITIVI_HR: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>(['Validata da HR', 'Inclusa nel riepilogo mensile', 'Inviata a Payroll']);

export class BackendDemo implements Backend {
  readonly modalita = 'demo' as const;
  readonly demo: StrumentiDemo;
  private dati: DatiDemo;

  constructor(private readonly opz: OpzioniBackendDemo) {
    this.dati = opz.persistenza.carica() ?? creaDatiDemo(this.adesso());
    this.salva();
    this.demo = {
      account: ACCOUNT_DEMO,
      eseguiPromemoria: async () => {
        await this.attesa();
        this.richiediRuolo(this.richiediSessione(), 'admin', 'hr');
        return this.flussoPromemoria(true);
      },
      eseguiRiepilogoMensile: async () => {
        await this.attesa();
        this.richiediRuolo(this.richiediSessione(), 'admin', 'hr');
        return this.flussoRiepilogoMensile();
      },
      ripristina: async () => {
        await this.attesa();
        this.opz.persistenza.cancella();
        await this.opz.archivio.svuota();
        this.dati = creaDatiDemo(this.adesso());
        this.salva();
      },
    };
  }

  // =========================================================================
  //  Infrastruttura
  // =========================================================================
  private adesso(): Date {
    return this.opz.adesso?.() ?? new Date();
  }
  private ora(): string {
    return this.adesso().toISOString();
  }
  private oggi(): string {
    return dataRomaDaIstante(this.ora());
  }
  private salva(): void {
    this.opz.persistenza.salva(this.dati);
  }
  private async attesa(): Promise<void> {
    const ms = this.opz.ritardoMs ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }
  private nuovoId(prefisso: string): string {
    this.dati.contatori.id += 1;
    return `${prefisso}-${this.dati.contatori.id.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
  private copia<T>(x: T): T {
    return structuredClone(x);
  }

  private sessioneDi(login: string): Sessione | null {
    const u = this.dati.utenti.find((x) => x.login === login);
    if (!u) return null;
    const lav = this.dati.lavoratori.find((l) => l.login === login && l.stato === 'Attivo');
    const ruoli: Sessione['ruoli'] = [];
    if (lav) ruoli.push('lavoratore');
    const coordina =
      this.dati.lavoratori.some((l) => l.coordinatoreLogin === login && l.stato === 'Attivo') ||
      this.dati.strutture.some((s) => s.attiva && s.coordinatoreServizioLogin === login);
    if (coordina) ruoli.push('coordinatore');
    const assegnati = this.dati.ruoli.filter((r) => r.login === login && r.attivo).map((r) => r.ruolo);
    if (assegnati.includes('hr')) ruoli.push('hr');
    if (assegnati.includes('admin')) ruoli.push('admin');
    return {
      login,
      nome: u.nome,
      cognome: u.cognome,
      ruoli,
      lavoratoreId: lav?.id,
      profiloCompleto: !lav || (!!lav.emailContatto && !!lav.codiceFiscale),
    };
  }

  private richiediSessione(): Sessione {
    const login = this.opz.sessione.leggi();
    const s = login ? this.sessioneDi(login) : null;
    if (!s || s.ruoli.length === 0) throw new ErroreApi('NON_AUTENTICATO', 'Sessione scaduta: accedi di nuovo.');
    return s;
  }

  private richiediRuolo(s: Sessione, ...ruoli: Sessione['ruoli']): void {
    if (!ruoli.some((r) => haRuolo(s, r))) throw new ErroreApi('NON_AUTORIZZATO', 'Non hai i permessi per questa operazione.');
  }

  private lavoratoreDi(s: Sessione): Lavoratore {
    const l = this.dati.lavoratori.find((x) => x.id === s.lavoratoreId);
    if (!l) throw new ErroreApi('NON_AUTORIZZATO', 'Il tuo utente non è censito come lavoratore: contatta l’Ufficio HR/Formazione.');
    return l;
  }

  private nomeUtente(login?: string): string | undefined {
    const u = this.dati.utenti.find((x) => x.login === login);
    return u ? `${u.nome} ${u.cognome}` : undefined;
  }

  private emailUtente(login?: string): string | undefined {
    return this.dati.utenti.find((x) => x.login === login)?.emailAziendale ?? login;
  }

  private meseChiuso(anno: number, mese: number): boolean {
    return this.dati.chiusure.some((c) => c.anno === anno && c.mese === mese && c.stato === 'Chiuso');
  }

  private trovaRichiesta(s: Sessione, id: string): Richiesta {
    const r = this.dati.richieste.find((x) => x.id === id);
    if (!r || !puoVedereRichiesta(s, r)) throw new ErroreApi('NON_TROVATO', NON_TROVATA);
    return r;
  }

  private registra(v: Omit<VoceRegistro, 'id' | 'data'> & { data?: string }): void {
    // registro in ordine cronologico (voci dello stesso istante nell'ordine in cui avvengono)
    this.dati.registro.push({ id: this.nuovoId('g'), data: v.data ?? this.ora(), ...v });
  }

  private cambiaStato(r: Richiesta, nuovo: StatoRichiesta, autore: string, ruolo: RuoloRegistro, nota?: string): void {
    this.registra({ autore, ruolo, azione: `Stato: ${nuovo}`, entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, campo: 'Stato', prima: r.stato, dopo: nuovo, nota });
    r.stato = nuovo;
    r.modificatoIl = this.ora();
    r.modificatoDa = autore;
  }

  private notifica(destinatari: (string | undefined)[], m: Messaggio, richiestaId?: string): void {
    const dest = [...new Set(destinatari.filter((x): x is string => !!x))];
    if (!dest.length) return;
    const n: Notifica = { id: this.nuovoId('n'), data: this.ora(), destinatari: dest, richiestaId, ...m };
    this.dati.notifiche.unshift(n);
  }

  /** Flusso 4 automatico: una volta al giorno lavorativo, alla prima chiamata della giornata. */
  private automatismi(): void {
    const oggi = this.oggi();
    if (this.dati.ultimoPromemoria !== oggi) {
      this.dati.ultimoPromemoria = oggi;
      if (isGiornoLavorativo(oggi, this.dati.config.patroni)) this.flussoPromemoria(false);
      this.salva();
    }
  }

  // =========================================================================
  //  Autenticazione
  // =========================================================================
  async sessioneCorrente(): Promise<Sessione | null> {
    const login = this.opz.sessione.leggi();
    if (!login) return null;
    const s = this.sessioneDi(login);
    if (!s || !s.ruoli.length) return null;
    this.automatismi();
    return s;
  }

  async accedi(credenziali?: Credenziali): Promise<Sessione> {
    await this.attesa();
    const login = credenziali?.login.trim().toLowerCase() ?? '';
    const attesa = this.dati.password[login];
    if (!credenziali || !attesa || attesa !== credenziali.password) {
      throw new ErroreApi('NON_AUTENTICATO', 'Nome utente o password non corretti. In modalità DEMO usa uno degli account dimostrativi.');
    }
    const s = this.sessioneDi(login);
    if (!s || !s.ruoli.length) throw new ErroreApi('NON_AUTORIZZATO', 'Utente non abilitato all’app: contatta l’Ufficio HR/Formazione.');
    this.opz.sessione.scrivi(login);
    this.automatismi();
    return s;
  }

  async esci(): Promise<void> {
    this.opz.sessione.scrivi(null);
  }

  // =========================================================================
  //  Profilo
  // =========================================================================
  private profiloDi(s: Sessione): Profilo {
    const l = this.dati.lavoratori.find((x) => x.id === s.lavoratoreId);
    const u = this.dati.utenti.find((x) => x.login === s.login);
    const st = l ? this.dati.strutture.find((x) => x.id === l.strutturaId) : undefined;
    return {
      login: s.login,
      nome: s.nome,
      cognome: s.cognome,
      emailAziendale: u?.emailAziendale,
      emailContatto: l?.emailContatto,
      cfRegistrato: !!l?.codiceFiscale,
      cfMascherato: mascheraCodiceFiscale(l?.codiceFiscale),
      area: st?.area,
      servizio: st?.servizio,
      centroDiCosto: st?.centroDiCosto,
      coordinatoreNome: this.nomeUtente(l?.coordinatoreLogin),
      coordinatoreEmail: this.emailUtente(l?.coordinatoreLogin),
      stato: l?.stato,
      segnalazioni: this.copia(l?.segnalazioni ?? []),
      monteOre: l ? this.dati.montiOre.filter((m) => m.lavoratoreId === l.id && m.attivo).map((m) => this.situazione(m)) : [],
    };
  }

  /** Monte ore con i consumi calcolati dalle richieste. */
  private situazione(m: MonteOre): SituazioneMonteOre {
    const l = this.dati.lavoratori.find((x) => x.id === m.lavoratoreId);
    return { ...this.copia(m), nominativo: l ? `${l.cognome} ${l.nome}` : '', ...consumoMonteOre(m, this.dati.richieste) };
  }

  async getProfilo(): Promise<Profilo> {
    await this.attesa();
    return this.profiloDi(this.richiediSessione());
  }

  async aggiornaProfilo(dati: { emailContatto?: string; codiceFiscale?: string }): Promise<Profilo> {
    await this.attesa();
    const s = this.richiediSessione();
    const l = this.lavoratoreDi(s);
    const errori = [];
    if (dati.emailContatto !== undefined && !isEmailValida(dati.emailContatto)) errori.push({ campo: 'emailContatto', messaggio: 'Indirizzo e-mail non valido.' });
    const cf = dati.codiceFiscale?.trim().toUpperCase();
    if (cf !== undefined && !isCodiceFiscaleValido(cf)) errori.push({ campo: 'codiceFiscale', messaggio: 'Codice fiscale non valido: controlla i 16 caratteri.' });
    if (errori.length) throw new ErroreApi('VALIDAZIONE', 'Controlla i dati inseriti.', errori);
    if (dati.emailContatto !== undefined && dati.emailContatto.trim() !== l.emailContatto) {
      this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Aggiornamento e-mail di contatto', entita: 'Lavoratore', entitaId: l.id, campo: 'E-mail di contatto', prima: l.emailContatto, dopo: dati.emailContatto.trim() });
      l.emailContatto = dati.emailContatto.trim();
      // le richieste non ancora concluse usano il nuovo indirizzo
      this.dati.richieste.filter((r) => r.lavoratoreId === l.id && APERTI.has(r.stato)).forEach((r) => (r.emailContatto = l.emailContatto));
    }
    if (cf !== undefined && cf !== l.codiceFiscale) {
      // il valore del codice fiscale non viene scritto nel registro (minimizzazione)
      this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Aggiornamento codice fiscale', entita: 'Lavoratore', entitaId: l.id, campo: 'Codice fiscale' });
      l.codiceFiscale = cf;
    }
    this.salva();
    return this.profiloDi(this.richiediSessione());
  }

  async segnalaVariazione(testo: string, lavoratoreId?: string): Promise<Profilo> {
    await this.attesa();
    const s = this.richiediSessione();
    // senza lavoratoreId: per se stessi; con lavoratoreId: il coordinatore per un lavoratore del proprio team
    let l: Lavoratore;
    let ruolo: RuoloRegistro = 'Lavoratore';
    if (lavoratoreId && lavoratoreId !== s.lavoratoreId) {
      const trovato = this.dati.lavoratori.find((x) => x.id === lavoratoreId && x.coordinatoreLogin === s.login);
      if (!trovato) throw new ErroreApi('NON_AUTORIZZATO', 'Puoi segnalare variazioni solo per te e per i lavoratori del tuo team.');
      l = trovato;
      ruolo = 'Coordinatore';
    } else {
      l = this.lavoratoreDi(s);
    }
    const t = testo.trim();
    if (t.length < 10) throw new ErroreApi('VALIDAZIONE', 'Descrivi la variazione (almeno 10 caratteri).', [{ campo: 'segnalazione', messaggio: 'Testo troppo breve.' }]);
    if (t.length > MAX_LUNGHEZZA_NOTE) throw new ErroreApi('VALIDAZIONE', 'Testo troppo lungo.');
    const autoreNome = this.nomeUtente(s.login) ?? s.login;
    l.segnalazioni.unshift({ testo: t, data: this.ora(), aperta: true, autoreLogin: s.login, autoreNome });
    this.registra({ autore: s.login, ruolo, azione: 'Segnalazione variazione dati', entita: 'Lavoratore', entitaId: l.id, nota: t });
    this.notifica([this.dati.config.emailHR], messaggi.segnalazioneVariazione(`${l.cognome} ${l.nome}`, t, ruolo === 'Coordinatore' ? autoreNome : undefined));
    this.salva();
    return this.profiloDi(s);
  }

  // =========================================================================
  //  Consultazione
  // =========================================================================
  async getCatalogo(): Promise<Corso[]> {
    await this.attesa();
    this.richiediSessione();
    return this.copia(
      this.dati.corsi
        .filter((c) => c.ente === 'Datore di lavoro' && c.attivo && c.statoValidazione === 'Validato')
        .sort((a, b) => a.titolo.localeCompare(b.titolo, 'it')),
    );
  }

  async getStoricoCorsiEsterni(): Promise<Corso[]> {
    await this.attesa();
    const s = this.richiediSessione();
    return this.copia(
      this.dati.corsi.filter(
        (c) => c.ente === 'Committente o altro soggetto' && c.loginAutore === s.login && c.piuGiornate && c.attivo && c.statoValidazione !== 'Scartato',
      ),
    );
  }

  async getChiusure(): Promise<ChiusuraMensile[]> {
    await this.attesa();
    const s = this.richiediSessione();
    // il contenuto dei file paghe è riservato a HR
    return this.copia(this.dati.chiusure).map((c) => (isUfficioHR(s) ? c : { ...c, filePaghe: c.filePaghe.map((f) => ({ ...f, contenuto: '' })) }));
  }

  // =========================================================================
  //  Lavoratore
  // =========================================================================
  async getMieRichieste(): Promise<Richiesta[]> {
    await this.attesa();
    const s = this.richiediSessione();
    return this.copia(this.dati.richieste.filter((r) => r.login === s.login)).sort((a, b) => b.modificatoIl.localeCompare(a.modificatoIl));
  }

  async salvaRichiesta(input: SalvaRichiestaInput, azione: 'bozza' | 'invia'): Promise<Richiesta> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'lavoratore');
    const l = this.lavoratoreDi(s);
    const struttura = this.dati.strutture.find((x) => x.id === l.strutturaId);
    if (!struttura) throw new ErroreApi('CONFLITTO', 'La tua struttura organizzativa non è configurata: contatta l’Ufficio HR/Formazione.');

    // --- richiesta esistente: solo le proprie e solo negli stati modificabili
    let esistente: Richiesta | undefined;
    if (input.id) {
      esistente = this.dati.richieste.find((r) => r.id === input.id && r.login === s.login);
      if (!esistente) throw new ErroreApi('NON_TROVATO', NON_TROVATA);
      if (!MODIFICABILI_DAL_LAVORATORE.has(esistente.stato)) throw new ErroreApi('CONFLITTO', `La richiesta è nello stato "${esistente.stato}" e non può essere modificata.`);
      if (this.meseChiuso(esistente.annoCompetenza, esistente.meseCompetenza)) throw new ErroreApi('CONFLITTO', 'Il mese della richiesta è chiuso: non è più modificabile.');
    }

    const permesso = input.tipologia !== 'Formazione';
    if (esistente && esistente.tipologia !== input.tipologia) {
      throw new ErroreApi('VALIDAZIONE', 'La tipologia di una richiesta già salvata non può essere cambiata: annullala e creane una nuova.');
    }

    // --- corso (formazione) oppure monte ore (permessi)
    let corso: Corso | null = null;
    if (!permesso && input.corsoId) {
      corso = this.dati.corsi.find((c) => c.id === input.corsoId) ?? null;
      if (!corso) throw new ErroreApi('VALIDAZIONE', 'Corso non trovato.', [{ campo: 'corsoId', messaggio: 'Corso non trovato.' }]);
    }
    const monteOre = permesso ? monteOrePerData(this.dati.montiOre, l.id, input.tipologia as TipoPermesso, input.dataSessione) : undefined;
    // l'ente si deduce dal corso: a catalogo = Datore di lavoro, altrimenti Committente o altro soggetto
    const dati: SalvaRichiestaInput = permesso
      ? { ...input, oraIngresso: input.oraInizioSessione, oraUscita: input.oraFineSessione, pausaInPresenza: true }
      : { ...input, ente: corso ? corso.ente : (input.ente ?? (input.nuovoCorso ? 'Committente o altro soggetto' : undefined)) };
    const altre = this.dati.richieste.filter((r) => r.login === s.login && r.id !== input.id);
    const errori = validaRichiesta(
      dati,
      {
        login: s.login,
        corso,
        altreRichieste: altre,
        meseChiuso: (a, m) => this.meseChiuso(a, m),
        coordinatoreLogin: l.coordinatoreLogin,
        profiloCompleto: !!l.emailContatto && !!l.codiceFiscale,
        oggi: this.oggi(),
        monteOre: permesso
          ? monteOre
            ? { oreResidue: consumoMonteOre(monteOre, this.dati.richieste, input.id).oreResidue, validoDal: monteOre.validoDal, validoAl: monteOre.validoAl }
            : null
          : undefined,
      },
      azione === 'invia',
    );
    // --- allegati: l'attestato si allega solo per i corsi esterni (per quelli del datore di lavoro è già a sistema)
    const esternoPrevisto = !permesso && dati.ente === 'Committente o altro soggetto';
    const allegatiRestanti = (esistente?.allegati ?? []).filter((a) => !input.allegatiRimossi.includes(a.id));
    if (allegatiRestanti.length + input.allegatiNuovi.length > MAX_ALLEGATI) errori.push({ campo: 'allegati', messaggio: `Puoi allegare al massimo ${MAX_ALLEGATI} file.` });
    for (const f of input.allegatiNuovi) {
      if (f.contenuto.size > MAX_DIMENSIONE_ALLEGATO) errori.push({ campo: 'allegati', messaggio: `"${f.nome}" supera 10 MB.` });
      if (!TIPI_ALLEGATO_AMMESSI.includes(f.mime)) errori.push({ campo: 'allegati', messaggio: `"${f.nome}": sono ammessi solo PDF e immagini (JPG, PNG, HEIC).` });
      if (f.tipo === 'Attestato' && !esternoPrevisto) {
        errori.push({ campo: 'allegati', messaggio: 'L’attestato si allega solo per i corsi di altri enti: per i corsi di Società Dolce è già disponibile a sistema.' });
      }
    }
    if (errori.length) throw new ErroreApi('VALIDAZIONE', 'Alcuni dati non sono corretti: controlla i campi evidenziati.', errori);

    // --- corso esterno nuovo
    if (!permesso && !corso && dati.ente === 'Committente o altro soggetto' && input.nuovoCorso) {
      this.dati.contatori.corsiEsterni += 1;
      const nc = input.nuovoCorso;
      corso = {
        id: this.nuovoId('ce'),
        codice: `EXT-${String(this.dati.contatori.corsiEsterni).padStart(6, '0')}`,
        titolo: nc.titolo.trim(),
        ente: 'Committente o altro soggetto',
        nomeEnte: nc.nomeEnte?.trim() || undefined,
        modalita: nc.modalita,
        durataOre: nc.durataOre,
        gettonePrevisto: true,
        attivo: true,
        piuGiornate: nc.piuGiornate,
        origine: 'Inserito dal lavoratore',
        statoValidazione: 'Da validare',
        loginAutore: s.login,
      };
      this.dati.corsi.push(corso);
      this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Inserimento corso esterno', entita: 'Corso', entitaId: corso.id, nota: `${corso.codice} – ${corso.titolo}` });
    }
    if (!permesso && !corso) throw new ErroreApi('VALIDAZIONE', 'Indica il corso.', [{ campo: 'corsoId', messaggio: 'Indica il corso.' }]);

    // --- dati della richiesta (quelli organizzativi arrivano dal server, mai dal browser)
    const { durataSessione, oreFrequentate } = calcolaOre(dati);
    const { anno, mese } = periodoDiData(input.dataSessione);
    const ora = this.ora();
    const esterno = corso?.ente === 'Committente o altro soggetto';
    const frequentate = oreFrequentate ?? 0;
    const valori: Omit<Richiesta, 'id' | 'numero' | 'stato' | 'creatoIl' | 'allegati' | 'possibileDuplicato' | 'giorniAttesa' | 'promemoriaInviati' | 'segnalataHR'> = {
      tipologia: input.tipologia,
      monteOreId: monteOre?.id,
      descrizioneAttivita: permesso ? input.descrizioneAttivita?.trim() : undefined,
      lavoratoreId: l.id,
      login: l.login,
      cognome: l.cognome,
      nome: l.nome,
      emailAziendale: l.emailAziendale,
      emailContatto: l.emailContatto,
      area: struttura.area,
      servizio: struttura.servizio,
      centroDiCosto: struttura.centroDiCosto,
      strutturaId: struttura.id,
      coordinatoreLogin: l.coordinatoreLogin,
      coordinatoreNome: this.nomeUtente(l.coordinatoreLogin),
      corsoId: corso?.id,
      codiceCorso: corso?.codice ?? '',
      titoloCorso: corso && !esterno ? corso.titolo : '',
      titoloCorsoLibero: corso && esterno ? corso.titolo : undefined,
      durataCorso: corso?.durataOre ?? 0,
      ente: corso?.ente,
      modalita: corso?.modalita,
      piuGiornate: corso?.piuGiornate ?? false,
      dataSessione: input.dataSessione,
      oraInizioSessione: dati.oraInizioSessione,
      oraFineSessione: dati.oraFineSessione,
      pausaPrevista: !!dati.pausaPrevista,
      pausaMinuti: dati.pausaPrevista ? dati.pausaMinuti : 0,
      pausaInPresenza: dati.pausaPrevista ? calcolaOre(dati).pausaApplicata > 0 : false,
      durataSessione: durataSessione ?? 0,
      oraIngresso: dati.oraIngresso,
      oraUscita: dati.oraUscita,
      oreFrequentate: frequentate,
      // permessi: tutte le ore sono ore di permesso a carico del monte ore
      oreRetribuiteRichieste: permesso ? frequentate : arrotonda2(input.oreRetribuiteRichieste),
      oreGettoneRichieste: permesso || !corso?.gettonePrevisto ? 0 : arrotonda2(input.oreGettoneRichieste),
      oreNonRetribuiteRichieste: permesso ? 0 : arrotonda2(input.oreNonRetribuiteRichieste),
      noteLavoratore: input.noteLavoratore?.trim() || undefined,
      modificatoIl: ora,
      modificatoDa: s.login,
      meseCompetenza: mese,
      annoCompetenza: anno,
      dichiarazioni: { ...input.dichiarazioni },
    };

    // --- duplicati (R7): conferma esplicita prima dell'invio
    let duplicati: Richiesta[] = [];
    if (azione === 'invia' && corso) {
      duplicati = trovaDuplicati({ login: l.login, codiceCorso: corso.codice, dataSessione: input.dataSessione, id: input.id }, this.dati.richieste);
      if (duplicati.length && !input.confermaDuplicato) {
        throw new ErroreApi(
          'CONFLITTO',
          `Esiste già una richiesta per lo stesso corso nella stessa data (${duplicati.map((d) => d.numero).join(', ')}). Vuoi inviarla comunque?`,
          [],
          'duplicato',
        );
      }
    }

    let r: Richiesta;
    if (esistente) {
      r = esistente;
      for (const [k, v] of Object.entries(valori) as [keyof typeof valori, unknown][]) {
        const prima = r[k];
        if (k !== 'modificatoIl' && k !== 'modificatoDa' && typeof v !== 'object' && prima !== v && (prima !== undefined || v !== undefined)) {
          this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Modifica richiesta', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, campo: k, prima: String(prima ?? ''), dopo: String(v ?? '') });
        }
      }
      Object.assign(r, valori);
    } else {
      const annoNumero = ora.slice(0, 4);
      this.dati.contatori.richiestePerAnno[annoNumero] = (this.dati.contatori.richiestePerAnno[annoNumero] ?? 0) + 1;
      r = {
        ...valori,
        id: this.nuovoId('r'),
        numero: `RF-${annoNumero}-${String(this.dati.contatori.richiestePerAnno[annoNumero]).padStart(6, '0')}`,
        stato: 'Bozza',
        creatoIl: ora,
        allegati: [],
        possibileDuplicato: false,
        giorniAttesa: 0,
        promemoriaInviati: [],
        segnalataHR: false,
      };
      this.dati.richieste.unshift(r);
      this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Creazione richiesta', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id });
    }

    // --- allegati (file salvati nell'archivio, metadati sulla richiesta)
    for (const id of input.allegatiRimossi) {
      const a = r.allegati.find((x) => x.id === id);
      if (a) {
        await this.opz.archivio.elimina(id);
        this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Rimozione allegato', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, nota: a.nome });
      }
    }
    r.allegati = r.allegati.filter((a) => !input.allegatiRimossi.includes(a.id));
    for (const f of input.allegatiNuovi) {
      const id = this.nuovoId('a');
      await this.opz.archivio.scrivi(id, f.contenuto);
      r.allegati.push({ id, tipo: f.tipo, nome: f.nome, mime: f.mime, dimensione: f.contenuto.size, caricatoIl: ora });
      this.registra({ autore: s.login, ruolo: 'Lavoratore', azione: 'Caricamento allegato', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, nota: `${f.tipo}: ${f.nome}` });
    }

    // --- stato
    if (azione === 'bozza') {
      if (r.stato !== 'Bozza') this.cambiaStato(r, 'Bozza', s.login, 'Lavoratore');
    } else {
      // Flusso 1: invio, controlli, coordinatore, notifica con collegamento diretto
      this.cambiaStato(r, 'Inviata al coordinatore', s.login, 'Lavoratore');
      r.inviatoIl = ora;
      r.giorniAttesa = 0;
      r.promemoriaInviati = [];
      r.segnalataHR = false;
      r.possibileDuplicato = duplicati.length > 0;
      for (const d of duplicati) d.possibileDuplicato = true;
      this.cambiaStato(r, 'In attesa del coordinatore', 'Sistema', 'Sistema');
      this.notifica([this.emailUtente(r.coordinatoreLogin)], messaggi.invioCoordinatore(r, r.possibileDuplicato), r.id);
      if (duplicati.length) this.notifica([this.dati.config.emailHR], messaggi.duplicatoHR(r, duplicati.map((d) => d.numero)), r.id);
    }
    this.salva();
    return this.copia(r);
  }

  async annullaRichiesta(id: string): Promise<Richiesta> {
    await this.attesa();
    const s = this.richiediSessione();
    const r = this.dati.richieste.find((x) => x.id === id && x.login === s.login);
    if (!r) throw new ErroreApi('NON_TROVATO', NON_TROVATA);
    if (!ANNULLABILI_DAL_LAVORATORE.has(r.stato)) throw new ErroreApi('CONFLITTO', `Una richiesta nello stato "${r.stato}" non può essere annullata.`);
    if (this.meseChiuso(r.annoCompetenza, r.meseCompetenza)) throw new ErroreApi('CONFLITTO', 'Il mese della richiesta è chiuso.');
    const eraInviata = r.stato !== 'Bozza';
    this.cambiaStato(r, 'Annullata', s.login, 'Lavoratore');
    if (eraInviata) this.notifica([this.emailUtente(r.coordinatoreLogin)], messaggi.annullamento(r), r.id);
    this.salva();
    return this.copia(r);
  }

  // =========================================================================
  //  Comuni
  // =========================================================================
  async getDettaglio(id: string): Promise<DettaglioRichiesta> {
    await this.attesa();
    const s = this.richiediSessione();
    const r = this.trovaRichiesta(s, id);
    const meseChiuso = this.meseChiuso(r.annoCompetenza, r.meseCompetenza);
    const voci = this.dati.registro
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.richiestaId === r.id)
      .sort((a, b) => a.v.data.localeCompare(b.v.data) || a.i - b.i)
      .map(({ v }) => v);
    // lo storico completo è riservato a HR; gli altri vedono solo i cambi di stato
    const storico = isUfficioHR(s) ? voci : voci.filter((v) => v.campo === 'Stato').map((v) => ({ ...v, autore: v.ruolo, nota: undefined }));
    const duplicati = trovaDuplicati(r, this.dati.richieste).filter((d) => puoVedereRichiesta(s, d)).map((d) => d.numero);
    const m = r.monteOreId ? this.dati.montiOre.find((x) => x.id === r.monteOreId) : undefined;
    const monteOre = m ? { ...this.situazione(m), oreResidueSenzaQuesta: consumoMonteOre(m, this.dati.richieste, r.id).oreResidue } : undefined;
    const corso = this.dati.corsi.find((c) => c.id === r.corsoId);
    const gettonePrevisto = r.tipologia === 'Formazione' && (corso?.gettonePrevisto ?? true);
    // stringa vuota e non undefined: chi corregge il corso deve poter distinguere "nessun ente" da "dato non disponibile"
    const nomeEnteCorso = corso?.nomeEnte ?? '';
    return this.copia({ richiesta: r, azioni: azioniConsentite(s, r, meseChiuso), meseChiuso, storico, duplicati, monteOre, gettonePrevisto, nomeEnteCorso });
  }

  async scaricaAllegato(richiestaId: string, allegatoId: string): Promise<{ nome: string; mime: string; contenuto: Blob }> {
    await this.attesa();
    const s = this.richiediSessione();
    const r = this.trovaRichiesta(s, richiestaId);
    const a = r.allegati.find((x) => x.id === allegatoId);
    if (!a) throw new ErroreApi('NON_TROVATO', 'Allegato non trovato.');
    const blob = (await this.opz.archivio.leggi(a.id)) ?? pdfAttestatoSimulato(titoloRichiesta(r), `${r.cognome} ${r.nome}`);
    return { nome: a.nome, mime: a.mime, contenuto: blob };
  }

  // =========================================================================
  //  Coordinatore e HR
  // =========================================================================
  async getRichieste(ambito: AmbitoRichieste, filtri: FiltriRichieste = {}): Promise<Richiesta[]> {
    await this.attesa();
    const s = this.richiediSessione();
    let base: Richiesta[];
    if (ambito === 'team') {
      this.richiediRuolo(s, 'coordinatore');
      base = this.dati.richieste.filter((r) => r.coordinatoreLogin === s.login && r.login !== s.login && r.stato !== 'Bozza');
    } else {
      this.richiediRuolo(s, 'hr', 'admin');
      base = this.dati.richieste.filter((r) => r.stato !== 'Bozza');
    }
    return this.copia(filtraRichieste(base, filtri)).sort((a, b) => b.dataSessione.localeCompare(a.dataSessione) || b.numero.localeCompare(a.numero));
  }

  async getLavoratoriTeam(): Promise<LavoratoreTeam[]> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'coordinatore');
    return this.dati.lavoratori
      .filter((l) => l.coordinatoreLogin === s.login && l.login !== s.login)
      .map((l) => {
        const st = this.dati.strutture.find((x) => x.id === l.strutturaId);
        return {
          id: l.id,
          login: l.login,
          nominativo: `${l.cognome} ${l.nome}`,
          area: st?.area ?? '',
          servizio: st?.servizio ?? '',
          centroDiCosto: st?.centroDiCosto ?? '',
          stato: l.stato,
          segnalazioniAperte: l.segnalazioni.filter((x) => x.aperta).length,
        };
      })
      .sort((a, b) => a.nominativo.localeCompare(b.nominativo, 'it'));
  }

  /** Opzioni per i controlli sulla decisione: gettone previsto dal corso e, per i permessi, monte ore residuo. */
  private opzioniDecisione(r: Richiesta) {
    const m = r.monteOreId ? this.dati.montiOre.find((x) => x.id === r.monteOreId) : undefined;
    return {
      gettonePrevisto: r.tipologia === 'Formazione' ? (this.dati.corsi.find((c) => c.id === r.corsoId)?.gettonePrevisto ?? true) : false,
      oreResidueMonteOre: r.tipologia !== 'Formazione' ? (m ? consumoMonteOre(m, this.dati.richieste, r.id).oreResidue : 0) : undefined,
    };
  }

  async decisioneCoordinatore(id: string, input: DecisioneInput): Promise<Richiesta> {
    await this.attesa();
    const s = this.richiediSessione();
    const r = this.trovaRichiesta(s, id);
    const azioni = azioniConsentite(s, r, this.meseChiuso(r.annoCompetenza, r.meseCompetenza));
    if (!azioni.esitoCoordinatore) {
      throw new ErroreApi(r.coordinatoreLogin === s.login ? 'CONFLITTO' : 'NON_AUTORIZZATO', `Non puoi decidere su questa richiesta (stato: ${r.stato}).`);
    }
    const ore: RipartizioneOre = { retribuite: input.oreRetribuite, gettone: input.oreGettone, nonRetribuite: input.oreNonRetribuite };
    const errori = validaDecisione(input.esito, ore, r.oreFrequentate, input.nota, this.opzioniDecisione(r));
    if (errori.length) throw new ErroreApi('VALIDAZIONE', errori[0]!.messaggio, errori);
    const nota = input.nota?.trim() || undefined;
    if (input.esito === 'approva') {
      this.registraOre(r, s.login, 'Coordinatore', 'Ore retribuite riconosciute coordinatore', r.oreRetribuiteRichieste, ore.retribuite);
      this.registraOre(r, s.login, 'Coordinatore', 'Ore gettone riconosciute coordinatore', r.oreGettoneRichieste, ore.gettone);
      this.registraOre(r, s.login, 'Coordinatore', 'Ore non retribuite riconosciute coordinatore', r.oreNonRetribuiteRichieste, ore.nonRetribuite);
      r.oreRetribuiteCoord = arrotonda2(ore.retribuite);
      r.oreGettoneCoord = arrotonda2(ore.gettone);
      r.oreNonRetribuiteCoord = arrotonda2(ore.nonRetribuite);
      r.noteCoordinatore = nota;
      r.approvatoCoordIl = this.ora();
      this.cambiaStato(r, 'Approvata dal coordinatore', s.login, 'Coordinatore', nota);
      this.cambiaStato(r, 'In attesa di validazione HR', 'Sistema', 'Sistema'); // Flusso 2: visibile a HR
    } else {
      r.noteCoordinatore = nota;
      this.cambiaStato(r, input.esito === 'respingi' ? 'Respinta dal coordinatore' : 'Integrazione richiesta dal coordinatore', s.login, 'Coordinatore', nota);
    }
    this.notifica([r.emailContatto], messaggi.esitoCoordinatore(r), r.id);
    this.salva();
    return this.copia(r);
  }

  private registraOre(r: Richiesta, autore: string, ruolo: RuoloRegistro, campo: string, prima: number | undefined, dopo: number): void {
    if (prima !== undefined && arrotonda2(prima) !== arrotonda2(dopo)) {
      this.registra({ autore, ruolo, azione: 'Modifica ore', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, campo, prima: String(prima), dopo: String(arrotonda2(dopo)) });
    }
  }

  async decisioneHR(input: DecisioneMultiplaInput): Promise<RisultatoMultiplo> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    if (input.esito !== 'approva') {
      const err = validaDecisione(input.esito, { retribuite: 0, gettone: 0, nonRetribuite: 0 }, 0, input.nota);
      if (err.length) throw new ErroreApi('VALIDAZIONE', err[0]!.messaggio, err);
    }
    const ruolo = ruoloRegistro(s, 'hr');
    const nota = input.nota?.trim() || undefined;
    const esito: RisultatoMultiplo = { elaborate: 0, scartate: [] };
    for (const v of input.voci) {
      const r = this.dati.richieste.find((x) => x.id === v.id);
      if (!r || !puoVedereRichiesta(s, r)) {
        esito.scartate.push({ id: v.id, numero: v.id, motivo: 'Non trovata' });
        continue;
      }
      const meseChiuso = this.meseChiuso(r.annoCompetenza, r.meseCompetenza);
      if (!azioniConsentite(s, r, meseChiuso).esitoHR) {
        const motivo = r.login === s.login ? 'Non puoi validare una tua richiesta' : meseChiuso ? 'Mese chiuso' : `Stato non valido (${r.stato})`;
        esito.scartate.push({ id: r.id, numero: r.numero, motivo });
        continue;
      }
      // ore non indicate = quelle riconosciute dal coordinatore
      const indicate = v.oreRetribuite !== undefined || v.oreGettone !== undefined || v.oreNonRetribuite !== undefined;
      const ore: RipartizioneOre = indicate
        ? { retribuite: v.oreRetribuite ?? 0, gettone: v.oreGettone ?? 0, nonRetribuite: v.oreNonRetribuite ?? 0 }
        : {
            retribuite: r.oreRetribuiteCoord ?? r.oreRetribuiteRichieste,
            gettone: r.oreGettoneCoord ?? r.oreGettoneRichieste,
            nonRetribuite: r.oreNonRetribuiteCoord ?? r.oreNonRetribuiteRichieste,
          };
      const errori = validaDecisione(input.esito, ore, r.oreFrequentate, nota, this.opzioniDecisione(r));
      if (errori.length) {
        esito.scartate.push({ id: r.id, numero: r.numero, motivo: errori[0]!.messaggio });
        continue;
      }
      if (input.esito === 'approva') {
        this.registraOre(r, s.login, ruolo, 'Ore retribuite approvate HR', r.oreRetribuiteCoord, ore.retribuite);
        this.registraOre(r, s.login, ruolo, 'Ore gettone approvate HR', r.oreGettoneCoord, ore.gettone);
        this.registraOre(r, s.login, ruolo, 'Ore non retribuite approvate HR', r.oreNonRetribuiteCoord, ore.nonRetribuite);
        r.oreRetribuiteHR = arrotonda2(ore.retribuite);
        r.oreGettoneHR = arrotonda2(ore.gettone);
        r.oreNonRetribuiteHR = arrotonda2(ore.nonRetribuite);
        r.validatoHRIl = this.ora();
        r.noteHR = nota;
        this.cambiaStato(r, 'Validata da HR', s.login, ruolo, nota);
      } else {
        r.noteHR = nota;
        this.cambiaStato(r, input.esito === 'respingi' ? 'Respinta da HR' : 'Integrazione richiesta da HR', s.login, ruolo, nota);
      }
      // Flusso 3: notifica a lavoratore e coordinatore
      this.notifica([r.emailContatto], messaggi.esitoHR(r, false), r.id);
      this.notifica([this.emailUtente(r.coordinatoreLogin)], messaggi.esitoHR(r, true), r.id);
      esito.elaborate++;
    }
    this.salva();
    return esito;
  }

  async correggiCorso(richiestaId: string, dati: CorrezioneCorsoInput): Promise<Richiesta> {
    await this.attesa();
    const s = this.richiediSessione();
    const r = this.trovaRichiesta(s, richiestaId);
    const azioni = azioniConsentite(s, r, this.meseChiuso(r.annoCompetenza, r.meseCompetenza));
    if (!azioni.correzioneCorso) throw new ErroreApi('NON_AUTORIZZATO', 'Non puoi correggere i dati del corso di questa richiesta.');
    const corso = this.dati.corsi.find((c) => c.id === r.corsoId);
    if (!corso || corso.ente !== 'Committente o altro soggetto') throw new ErroreApi('CONFLITTO', 'Si possono correggere solo i corsi di altri enti inseriti dal lavoratore.');
    // sessioni dello stesso corso già dichiarate dal lavoratore: la durata non può scendere sotto
    const collegate = this.dati.richieste.filter((x) => x.corsoId === corso.id && x.stato !== 'Annullata' && !x.stato.startsWith('Respinta'));
    const oreDichiarate = arrotonda2(collegate.filter((x) => x.stato !== 'Bozza').reduce((t, x) => t + x.durataSessione, 0));
    const errori = validaCorrezioneCorso(dati, oreDichiarate);
    if (errori.length) throw new ErroreApi('VALIDAZIONE', errori[0]!.messaggio, errori);
    const ruolo: RuoloRegistro = azioni.esitoCoordinatore ? 'Coordinatore' : ruoloRegistro(s, 'hr');
    const nuovi = { titolo: dati.titolo.trim(), nomeEnte: dati.nomeEnte?.trim() || undefined, modalita: dati.modalita, durataOre: dati.durataOre, piuGiornate: dati.piuGiornate };
    const etichette: Record<keyof typeof nuovi, string> = { titolo: 'Titolo corso', nomeEnte: 'Ente organizzatore', modalita: 'Modalità di svolgimento', durataOre: 'Durata complessiva corso', piuGiornate: 'Più giornate formative' };
    let modificato = false;
    for (const k of Object.keys(nuovi) as (keyof typeof nuovi)[]) {
      if (corso[k] !== nuovi[k]) {
        modificato = true;
        this.registra({ autore: s.login, ruolo, azione: 'Correzione dati del corso', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, campo: etichette[k], prima: String(corso[k] ?? ''), dopo: String(nuovi[k] ?? '') });
      }
    }
    if (modificato) {
      Object.assign(corso, nuovi);
      // la correzione vale per tutte le sessioni dello stesso corso non ancora validate da HR
      for (const x of collegate) {
        if (DEFINITIVI_HR.has(x.stato)) continue;
        x.titoloCorsoLibero = corso.titolo;
        x.modalita = corso.modalita;
        x.durataCorso = corso.durataOre;
        x.piuGiornate = corso.piuGiornate;
      }
      r.modificatoIl = this.ora();
      r.modificatoDa = s.login;
      this.salva();
    }
    return this.copia(r);
  }

  // =========================================================================
  //  Monte ore dei permessi (diritto allo studio, riqualifica professionale)
  // =========================================================================
  async getMontiOre(): Promise<SituazioneMonteOre[]> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    return this.dati.montiOre
      .map((m) => this.situazione(m))
      .sort((a, b) => a.nominativo.localeCompare(b.nominativo, 'it') || a.tipo.localeCompare(b.tipo) || b.validoDal.localeCompare(a.validoDal));
  }

  async salvaMonteOre(dati: MonteOreInput): Promise<SituazioneMonteOre> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const esistente = dati.id ? this.dati.montiOre.find((m) => m.id === dati.id) : undefined;
    if (dati.id && !esistente) throw new ErroreApi('NON_TROVATO', 'Monte ore non trovato.');
    const errori = [];
    const l = this.dati.lavoratori.find((x) => x.id === dati.lavoratoreId);
    if (!l) errori.push({ campo: 'lavoratoreId', messaggio: 'Seleziona il lavoratore.' });
    if (!TIPI_PERMESSO.includes(dati.tipo)) errori.push({ campo: 'tipo', messaggio: 'Indica il tipo di permesso.' });
    if (!(dati.oreTotali > 0) || dati.oreTotali > 2000) errori.push({ campo: 'oreTotali', messaggio: 'Indica il monte ore assegnato (maggiore di zero).' });
    if (!dati.validoDal || !dati.validoAl || dati.validoAl < dati.validoDal) errori.push({ campo: 'validoAl', messaggio: 'Indica un periodo di validità corretto.' });
    if (esistente && (esistente.lavoratoreId !== dati.lavoratoreId || esistente.tipo !== dati.tipo)) {
      errori.push({ campo: 'tipo', messaggio: 'Lavoratore e tipo di permesso non si possono cambiare: disattiva questo monte ore e creane uno nuovo.' });
    }
    if (dati.attivo && this.dati.montiOre.some((m) => m.id !== dati.id && m.attivo && m.lavoratoreId === dati.lavoratoreId && m.tipo === dati.tipo && periodiSovrapposti(m, dati))) {
      errori.push({ campo: 'validoDal', messaggio: 'Per questo lavoratore esiste già un monte ore attivo dello stesso tipo in un periodo che si sovrappone.' });
    }
    if (esistente) {
      const consumo = consumoMonteOre(esistente, this.dati.richieste);
      const usate = arrotonda2(consumo.oreUsufruite + consumo.oreImpegnate);
      if (dati.oreTotali < usate) errori.push({ campo: 'oreTotali', messaggio: `Il monte ore non può essere inferiore alle ore già usufruite o richieste (${usate}).` });
      const fuori = this.dati.richieste.some((r) => r.monteOreId === esistente.id && r.stato !== 'Annullata' && !r.stato.startsWith('Respinta') && (r.dataSessione < dati.validoDal || r.dataSessione > dati.validoAl));
      if (fuori) errori.push({ campo: 'validoDal', messaggio: 'Ci sono permessi già richiesti fuori dal nuovo periodo di validità.' });
    }
    if (errori.length) throw new ErroreApi('VALIDAZIONE', errori[0]!.messaggio, errori);
    const ruolo = ruoloRegistro(s, haRuolo(s, 'hr') ? 'hr' : 'admin');
    const nuovo: MonteOre = {
      id: esistente?.id ?? this.nuovoId('mo'),
      lavoratoreId: dati.lavoratoreId,
      tipo: dati.tipo,
      oreTotali: arrotonda2(dati.oreTotali),
      validoDal: dati.validoDal,
      validoAl: dati.validoAl,
      attivo: dati.attivo,
      note: dati.note?.trim() || undefined,
      assegnatoDa: esistente?.assegnatoDa ?? s.login,
      assegnatoIl: esistente?.assegnatoIl ?? this.ora(),
    };
    if (esistente) {
      for (const k of ['oreTotali', 'validoDal', 'validoAl', 'attivo', 'note'] as const) {
        if (esistente[k] !== nuovo[k]) {
          this.registra({ autore: s.login, ruolo, azione: 'Modifica monte ore', entita: 'Monte ore', entitaId: nuovo.id, campo: k, prima: String(esistente[k] ?? ''), dopo: String(nuovo[k] ?? ''), nota: `${l!.cognome} ${l!.nome} – ${nuovo.tipo}` });
        }
      }
      Object.assign(esistente, nuovo);
    } else {
      this.dati.montiOre.push(nuovo);
      this.registra({ autore: s.login, ruolo, azione: 'Assegnazione monte ore', entita: 'Monte ore', entitaId: nuovo.id, nota: `${l!.cognome} ${l!.nome} – ${nuovo.tipo}: ${nuovo.oreTotali} ore dal ${nuovo.validoDal} al ${nuovo.validoAl}` });
      this.notifica([l!.emailContatto], messaggi.monteOreAssegnato(l!.nome, nuovo));
    }
    this.salva();
    return this.situazione(esistente ?? nuovo);
  }

  // =========================================================================
  //  Chiusura mensile e paghe
  // =========================================================================
  private chiusuraDi(anno: number, mese: number): ChiusuraMensile {
    let c = this.dati.chiusure.find((x) => x.anno === anno && x.mese === mese);
    if (!c) {
      c = { periodo: periodoDi(anno, mese), anno, mese, stato: 'Aperto', numeroRichieste: 0, totaleOreRiconosciute: 0, totaleGettoni: 0, totaleOreNonRetribuite: 0, totaleOrePermessi: 0, filePaghe: [], riaperture: [] };
      this.dati.chiusure.push(c);
      this.dati.chiusure.sort((a, b) => a.periodo.localeCompare(b.periodo));
    }
    return c;
  }

  private aggiornaTotali(c: ChiusuraMensile): void {
    const incluse = this.dati.richieste.filter((r) => r.periodoChiusura === c.periodo && (r.stato === 'Inclusa nel riepilogo mensile' || r.stato === 'Inviata a Payroll'));
    const totali = totaliPaghe(righePaghe(incluse, this.dati.lavoratori));
    c.numeroRichieste = incluse.length;
    c.totaleOreRiconosciute = totali.oreRetribuite;
    c.totaleGettoni = totali.oreGettone;
    c.totaleOreNonRetribuite = totali.oreNonRetribuite;
    c.totaleOrePermessi = totali.orePermessi;
  }

  async getStatoMese(anno: number, mese: number): Promise<StatoMese> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const chiusura = this.dati.chiusure.find((x) => x.anno === anno && x.mese === mese) ?? {
      periodo: periodoDi(anno, mese), anno, mese, stato: 'Aperto' as const, numeroRichieste: 0, totaleOreRiconosciute: 0, totaleGettoni: 0, totaleOreNonRetribuite: 0, totaleOrePermessi: 0, filePaghe: [], riaperture: [],
    };
    const delMese = this.dati.richieste.filter((r) => r.annoCompetenza === anno && r.meseCompetenza === mese && r.stato !== 'Bozza');
    const aperte = delMese.filter((r) => APERTI.has(r.stato));
    // raggruppamento per coordinatore: chi deve ancora esprimersi
    const gruppi = new Map<string, ApertePerCoordinatore>();
    for (const r of aperte) {
      const chiave = r.coordinatoreLogin ?? '-';
      const g = gruppi.get(chiave) ?? { coordinatoreLogin: r.coordinatoreLogin, coordinatoreNome: r.coordinatoreNome ?? 'Senza coordinatore', inAttesaCoordinatore: 0, inIntegrazione: 0, inAttesaHR: 0, totale: 0 };
      if (r.stato === 'Inviata al coordinatore' || r.stato === 'In attesa del coordinatore') g.inAttesaCoordinatore++;
      else if (r.stato === 'Integrazione richiesta dal coordinatore' || r.stato === 'Integrazione richiesta da HR') g.inIntegrazione++;
      else g.inAttesaHR++;
      g.totale++;
      gruppi.set(chiave, g);
    }
    return this.copia({
      chiusura,
      aperte,
      apertePerCoordinatore: [...gruppi.values()].sort((a, b) => b.inAttesaCoordinatore - a.inAttesaCoordinatore || b.totale - a.totale || a.coordinatoreNome.localeCompare(b.coordinatoreNome, 'it')),
      validate: delMese.filter((r) => r.stato === 'Validata da HR').length,
      daInviare: this.dati.richieste.filter((r) => r.periodoChiusura === chiusura.periodo && r.stato === 'Inclusa nel riepilogo mensile').length,
      anomalie: rilevaAnomalie(delMese, this.dati.richieste, this.dati.lavoratori),
    });
  }

  async chiudiMese(anno: number, mese: number, note?: string): Promise<ChiusuraMensile> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const c = this.chiusuraDi(anno, mese);
    if (c.stato === 'Chiuso') throw new ErroreApi('CONFLITTO', `Il periodo ${c.periodo} è già chiuso.`);
    if (`${c.periodo}-01` > this.oggi()) throw new ErroreApi('CONFLITTO', 'Non si può chiudere un mese futuro.');
    const ruolo = ruoloRegistro(s, 'hr');
    c.stato = 'Chiuso';
    c.dataChiusura = this.ora();
    c.utenteChiusura = s.login;
    if (note?.trim()) c.noteHR = note.trim();
    for (const r of this.dati.richieste.filter((x) => x.annoCompetenza === anno && x.meseCompetenza === mese && x.stato === 'Validata da HR')) {
      r.periodoChiusura = c.periodo;
      this.cambiaStato(r, 'Inclusa nel riepilogo mensile', s.login, ruolo);
    }
    this.aggiornaTotali(c);
    this.registra({ autore: s.login, ruolo, azione: 'Chiusura del mese', entita: 'Chiusura', entitaId: c.periodo, nota: c.noteHR });
    this.salva();
    return this.copia(c);
  }

  async riapriMese(anno: number, mese: number, motivo: string): Promise<ChiusuraMensile> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'admin');
    const c = this.dati.chiusure.find((x) => x.anno === anno && x.mese === mese);
    if (!c || c.stato !== 'Chiuso') throw new ErroreApi('CONFLITTO', 'Il periodo non è chiuso.');
    if (motivo.trim().length < 10) throw new ErroreApi('VALIDAZIONE', 'Indica il motivo della riapertura (almeno 10 caratteri).', [{ campo: 'motivo', messaggio: 'Motivo obbligatorio.' }]);
    c.stato = 'Riaperto';
    c.riaperture.push({ data: this.ora(), utente: s.login, motivo: motivo.trim() });
    this.registra({ autore: s.login, ruolo: 'Amministratore', azione: 'Riapertura del mese', entita: 'Chiusura', entitaId: c.periodo, nota: motivo.trim() });
    this.notifica([this.dati.config.emailHR], messaggi.riaperturaMese(c.periodo, this.nomeUtente(s.login) ?? s.login, motivo.trim()));
    this.salva();
    return this.copia(c);
  }

  async generaFilePaghe(anno: number, mese: number): Promise<FilePaghe> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const c = this.dati.chiusure.find((x) => x.anno === anno && x.mese === mese);
    if (!c || c.stato !== 'Chiuso') throw new ErroreApi('CONFLITTO', 'Prima di generare il file paghe occorre chiudere il mese.');
    // Flusso 6: solo richieste validate da HR e incluse nella chiusura
    const incluse = this.dati.richieste.filter((r) => r.periodoChiusura === c.periodo && r.stato === 'Inclusa nel riepilogo mensile');
    if (!incluse.length) throw new ErroreApi('CONFLITTO', 'Nessuna richiesta da inviare a Payroll per questo periodo.');
    const righe = righePaghe(incluse, this.dati.lavoratori);
    const senzaCf = righe.filter((x) => !x.codiceFiscale).length;
    const totali = totaliPaghe(righe);
    const versione = c.filePaghe.length + 1;
    const file: FilePaghe = {
      id: this.nuovoId('fp'),
      nome: nomeFilePaghe(c.periodo, versione),
      versione,
      generatoIl: this.ora(),
      generatoDa: s.login,
      righe: righe.length,
      totaleOreRetribuite: totali.oreRetribuite,
      totaleOreGettone: totali.oreGettone,
      totaleOreNonRetribuite: totali.oreNonRetribuite,
      totaleOrePermessi: totali.orePermessi,
      contenuto: generaCsvPaghe(righe),
    };
    c.filePaghe.push(file);
    const ruolo = ruoloRegistro(s, 'hr');
    for (const r of incluse) this.cambiaStato(r, 'Inviata a Payroll', s.login, ruolo);
    this.aggiornaTotali(c);
    this.registra({ autore: s.login, ruolo, azione: 'Generazione file paghe', entita: 'Chiusura', entitaId: c.periodo, nota: `${file.nome} (${file.righe} righe${senzaCf ? `, ${senzaCf} senza codice fiscale` : ''})` });
    this.notifica(this.dati.config.destinatariPaghe, messaggi.filePaghe(c.periodo, file.nome, file.righe));
    this.salva();
    return this.copia(file);
  }

  async scaricaFilePaghe(periodo: string, fileId: string): Promise<{ nome: string; contenuto: string }> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const f = this.dati.chiusure.find((c) => c.periodo === periodo)?.filePaghe.find((x) => x.id === fileId);
    if (!f) throw new ErroreApi('NON_TROVATO', 'File non trovato.');
    return { nome: f.nome, contenuto: f.contenuto };
  }

  // =========================================================================
  //  Amministrazione
  // =========================================================================
  async getAnagrafiche(): Promise<Anagrafiche> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const { lavoratori, strutture, corsi, ruoli, utenti } = this.dati;
    return this.copia({ lavoratori, strutture, corsi, ruoli, utenti });
  }

  private diff<T extends object>(prima: T | undefined, dopo: T, entita: VoceRegistro['entita'], id: string, autore: string, azione: string): void {
    if (!prima) {
      this.registra({ autore, ruolo: 'Amministratore', azione, entita, entitaId: id });
      return;
    }
    for (const k of Object.keys(dopo) as (keyof T)[]) {
      const a = prima[k];
      const b = dopo[k];
      if (typeof b === 'object' || k === 'id') continue;
      if (a !== b && (a !== undefined || b !== undefined)) {
        const sensibile = k === 'codiceFiscale';
        this.registra({ autore, ruolo: 'Amministratore', azione, entita, entitaId: id, campo: String(k), prima: sensibile ? undefined : String(a ?? ''), dopo: sensibile ? undefined : String(b ?? '') });
      }
    }
  }

  async salvaLavoratore(dati: Omit<Lavoratore, 'id' | 'segnalazioni'> & { id?: string }): Promise<Lavoratore> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'admin');
    const login = dati.login.trim().toLowerCase();
    const errori = [];
    if (!this.dati.utenti.some((u) => u.login === login)) errori.push({ campo: 'login', messaggio: 'Utente Microsoft 365 non trovato nella directory.' });
    if (this.dati.lavoratori.some((l) => l.login === login && l.id !== dati.id)) errori.push({ campo: 'login', messaggio: 'Esiste già un lavoratore con questo login.' });
    if (!dati.cognome.trim() || !dati.nome.trim()) errori.push({ campo: 'nome', messaggio: 'Nome e cognome sono obbligatori.' });
    if (!this.dati.strutture.some((x) => x.id === dati.strutturaId)) errori.push({ campo: 'strutturaId', messaggio: 'Seleziona la struttura.' });
    if (dati.coordinatoreLogin && !this.dati.utenti.some((u) => u.login === dati.coordinatoreLogin)) errori.push({ campo: 'coordinatoreLogin', messaggio: 'Coordinatore non trovato.' });
    if (dati.coordinatoreLogin === login) errori.push({ campo: 'coordinatoreLogin', messaggio: 'Un lavoratore non può essere coordinatore di se stesso.' });
    if (dati.codiceFiscale && !isCodiceFiscaleValido(dati.codiceFiscale)) errori.push({ campo: 'codiceFiscale', messaggio: 'Codice fiscale non valido.' });
    if (dati.inizioAssegnazione && dati.fineAssegnazione && dati.fineAssegnazione < dati.inizioAssegnazione) errori.push({ campo: 'fineAssegnazione', messaggio: 'La data di fine precede la data di inizio.' });
    if (errori.length) throw new ErroreApi('VALIDAZIONE', 'Controlla i dati del lavoratore.', errori);

    const esistente = dati.id ? this.dati.lavoratori.find((l) => l.id === dati.id) : undefined;
    if (dati.id && !esistente) throw new ErroreApi('NON_TROVATO', 'Lavoratore non trovato.');
    const coordinatorePrecedente = esistente?.coordinatoreLogin;
    const nuovo: Lavoratore = {
      ...dati,
      id: esistente?.id ?? this.nuovoId('l'),
      login,
      codiceFiscale: dati.codiceFiscale?.trim().toUpperCase() || undefined,
      segnalazioni: esistente?.segnalazioni ?? [],
    };
    this.diff(esistente, nuovo, 'Lavoratore', nuovo.id, s.login, esistente ? 'Modifica lavoratore' : 'Nuovo lavoratore');
    if (esistente) Object.assign(esistente, nuovo);
    else this.dati.lavoratori.push(nuovo);

    // cambio coordinatore: le richieste aperte passano al nuovo coordinatore (equivalente del flusso F7)
    if (esistente && nuovo.coordinatoreLogin && nuovo.coordinatoreLogin !== coordinatorePrecedente) {
      const aperte = this.dati.richieste.filter((r) => r.lavoratoreId === nuovo.id && APERTI.has(r.stato) && r.coordinatoreLogin !== nuovo.coordinatoreLogin);
      for (const r of aperte) {
        this.registra({ autore: s.login, ruolo: 'Amministratore', azione: 'Cambio coordinatore', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, campo: 'Coordinatore', prima: r.coordinatoreNome, dopo: this.nomeUtente(nuovo.coordinatoreLogin) });
        r.coordinatoreLogin = nuovo.coordinatoreLogin;
        r.coordinatoreNome = this.nomeUtente(nuovo.coordinatoreLogin);
      }
      if (aperte.length) this.notifica([this.emailUtente(nuovo.coordinatoreLogin)], messaggi.cambioCoordinatore(`${nuovo.cognome} ${nuovo.nome}`, aperte.length));
    }
    this.salva();
    return this.copia(esistente ?? nuovo);
  }

  async salvaStruttura(dati: Omit<Struttura, 'id'> & { id?: string }): Promise<Struttura> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'admin');
    const errori = [];
    if (!dati.servizio.trim()) errori.push({ campo: 'servizio', messaggio: 'Indica il servizio.' });
    if (!dati.centroDiCosto.trim()) errori.push({ campo: 'centroDiCosto', messaggio: 'Indica il centro di costo.' });
    if (this.dati.strutture.some((x) => x.centroDiCosto === dati.centroDiCosto.trim() && x.id !== dati.id)) errori.push({ campo: 'centroDiCosto', messaggio: 'Centro di costo già usato da un’altra struttura.' });
    if (dati.dataInizioValidita && dati.dataFineValidita && dati.dataFineValidita < dati.dataInizioValidita) errori.push({ campo: 'dataFineValidita', messaggio: 'La data di fine precede la data di inizio.' });
    if (errori.length) throw new ErroreApi('VALIDAZIONE', 'Controlla i dati della struttura.', errori);
    const esistente = dati.id ? this.dati.strutture.find((x) => x.id === dati.id) : undefined;
    const nuova: Struttura = {
      ...dati,
      id: esistente?.id ?? this.nuovoId('s'),
      servizio: dati.servizio.trim(),
      centroDiCosto: dati.centroDiCosto.trim(),
      emailCoordinatoreServizio: this.emailUtente(dati.coordinatoreServizioLogin),
    };
    this.diff(esistente, nuova, 'Struttura', nuova.id, s.login, esistente ? 'Modifica struttura' : 'Nuova struttura');
    if (esistente) Object.assign(esistente, nuova);
    else this.dati.strutture.push(nuova);
    this.salva();
    return this.copia(nuova);
  }

  async salvaCorso(dati: Omit<Corso, 'id'> & { id?: string }): Promise<Corso> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'admin');
    const errori = [];
    if (!dati.codice.trim()) errori.push({ campo: 'codice', messaggio: 'Indica il codice del corso.' });
    if (this.dati.corsi.some((c) => c.codice === dati.codice.trim() && c.id !== dati.id)) errori.push({ campo: 'codice', messaggio: 'Codice già usato da un altro corso.' });
    if (dati.titolo.trim().length < 3) errori.push({ campo: 'titolo', messaggio: 'Indica il titolo del corso.' });
    if (!(dati.durataOre > 0)) errori.push({ campo: 'durataOre', messaggio: 'La durata deve essere maggiore di zero.' });
    if (errori.length) throw new ErroreApi('VALIDAZIONE', 'Controlla i dati del corso.', errori);
    const esistente = dati.id ? this.dati.corsi.find((c) => c.id === dati.id) : undefined;
    const nuovo: Corso = { ...dati, id: esistente?.id ?? this.nuovoId('c'), codice: dati.codice.trim(), titolo: dati.titolo.trim() };
    this.diff(esistente, nuovo, 'Corso', nuovo.id, s.login, esistente ? 'Modifica corso' : 'Nuovo corso');
    if (esistente) Object.assign(esistente, nuovo);
    else this.dati.corsi.push(nuovo);
    this.salva();
    return this.copia(nuovo);
  }

  async salvaRuolo(dati: Omit<AssegnazioneRuolo, 'id'> & { id?: string }): Promise<AssegnazioneRuolo> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'admin');
    const login = dati.login.trim().toLowerCase();
    if (!this.dati.utenti.some((u) => u.login === login)) throw new ErroreApi('VALIDAZIONE', 'Utente non trovato nella directory.', [{ campo: 'login', messaggio: 'Utente non trovato.' }]);
    if (this.dati.ruoli.some((r) => r.login === login && r.ruolo === dati.ruolo && r.id !== dati.id)) throw new ErroreApi('VALIDAZIONE', 'Ruolo già assegnato a questo utente.');
    const esistente = dati.id ? this.dati.ruoli.find((r) => r.id === dati.id) : undefined;
    const nuovo: AssegnazioneRuolo = { id: esistente?.id ?? this.nuovoId('ru'), login, ruolo: dati.ruolo, attivo: dati.attivo };
    const adminAttivi = this.dati.ruoli.filter((r) => r.ruolo === 'admin' && r.attivo && r.id !== nuovo.id).length + (nuovo.ruolo === 'admin' && nuovo.attivo ? 1 : 0);
    if (adminAttivi === 0) throw new ErroreApi('CONFLITTO', 'Deve restare almeno un amministratore attivo.');
    this.diff(esistente, nuovo, 'Ruolo', nuovo.id, s.login, esistente ? 'Modifica ruolo' : 'Assegnazione ruolo');
    if (esistente) Object.assign(esistente, nuovo);
    else this.dati.ruoli.push(nuovo);
    this.salva();
    return this.copia(nuovo);
  }

  async chiudiSegnalazione(lavoratoreId: string, indice: number): Promise<void> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    const seg = this.dati.lavoratori.find((l) => l.id === lavoratoreId)?.segnalazioni[indice];
    if (!seg) throw new ErroreApi('NON_TROVATO', 'Segnalazione non trovata.');
    seg.aperta = false;
    seg.gestitaDa = s.login;
    seg.gestitaIl = this.ora();
    this.registra({ autore: s.login, ruolo: ruoloRegistro(s, haRuolo(s, 'hr') ? 'hr' : 'admin'), azione: 'Segnalazione gestita', entita: 'Lavoratore', entitaId: lavoratoreId, nota: seg.testo });
    this.salva();
  }

  async getRegistro(filtri: { richiestaId?: string; entita?: VoceRegistro['entita'] } = {}): Promise<VoceRegistro[]> {
    await this.attesa();
    const s = this.richiediSessione();
    this.richiediRuolo(s, 'hr', 'admin');
    return this.copia(
      this.dati.registro
        .map((v, i) => ({ v, i }))
        .filter(({ v }) => (!filtri.richiestaId || v.richiestaId === filtri.richiestaId) && (!filtri.entita || v.entita === filtri.entita))
        .sort((a, b) => b.v.data.localeCompare(a.v.data) || b.i - a.i)
        .slice(0, 1000)
        .map(({ v }) => v),
    );
  }

  // =========================================================================
  //  Notifiche (posta simulata)
  // =========================================================================
  async getNotifiche(): Promise<Notifica[]> {
    await this.attesa();
    const s = this.richiediSessione();
    const l = this.dati.lavoratori.find((x) => x.login === s.login);
    const caselle = new Set([s.login, this.emailUtente(s.login), l?.emailContatto].filter(Boolean) as string[]);
    if (isUfficioHR(s)) {
      caselle.add(this.dati.config.emailHR);
      this.dati.config.destinatariPaghe.forEach((x) => caselle.add(x));
    }
    return this.copia(this.dati.notifiche.filter((n) => n.destinatari.some((d) => caselle.has(d))).slice(0, 300));
  }

  // =========================================================================
  //  Flussi pianificati (F4, F5)
  // =========================================================================
  private flussoPromemoria(salva: boolean): number {
    const oggi = this.oggi();
    let inviate = 0;
    for (const r of this.dati.richieste) {
      const e = valutaPromemoria(r, oggi, this.dati.config.patroni);
      if (r.stato !== 'In attesa del coordinatore') continue;
      r.giorniAttesa = e.giorni;
      for (const soglia of e.promemoria) {
        r.promemoriaInviati.push(soglia);
        this.notifica([this.emailUtente(r.coordinatoreLogin)], messaggi.promemoria(r, e.giorni), r.id);
        inviate++;
      }
      if (e.segnalaHR) {
        r.segnalataHR = true;
        this.notifica([this.emailUtente(r.coordinatoreLogin), this.dati.config.emailHR], messaggi.segnalazioneHR(r, e.giorni), r.id);
        this.registra({ autore: 'Sistema', ruolo: 'Sistema', azione: 'Sollecito segnalato a HR', entita: 'Richiesta', entitaId: r.id, richiestaId: r.id, nota: `${e.giorni} giorni lavorativi in attesa` });
        inviate++;
      }
    }
    if (salva) this.salva();
    return inviate;
  }

  private flussoRiepilogoMensile(): number {
    const oggi = this.oggi();
    const { anno, mese } = mesePrecedente(Number(oggi.slice(0, 4)), Number(oggi.slice(5, 7)));
    const delMese = this.dati.richieste.filter((r) => r.annoCompetenza === anno && r.meseCompetenza === mese && r.stato !== 'Bozza');
    const aperte = (x: Richiesta[]) => x.filter((r) => APERTI.has(r.stato));
    const respinte = (x: Richiesta[]) => x.filter((r) => r.stato === 'Respinta dal coordinatore' || r.stato === 'Respinta da HR');
    const incomplete = (x: Richiesta[]) => x.filter((r) => r.stato !== 'Annullata' && (r.possibileDuplicato || !r.coordinatoreLogin));
    let inviate = 0;
    const coordinatori = [...new Set(delMese.map((r) => r.coordinatoreLogin).filter((x): x is string => !!x))];
    for (const c of coordinatori) {
      const gruppo = delMese.filter((r) => r.coordinatoreLogin === c);
      this.notifica([this.emailUtente(c)], messaggi.riepilogoMensile(`gruppo di ${this.nomeUtente(c)}`, anno, mese, calcolaKPI(gruppo), aperte(gruppo), respinte(gruppo), incomplete(gruppo)));
      inviate++;
    }
    this.notifica([this.dati.config.emailHR], messaggi.riepilogoMensile('quadro completo', anno, mese, calcolaKPI(delMese), aperte(delMese), respinte(delMese), incomplete(delMese)));
    this.salva();
    return inviate + 1;
  }
}
