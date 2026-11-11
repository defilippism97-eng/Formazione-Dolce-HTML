/**
 * Stato del modulo "Nuova richiesta": conversione da/verso i dati di dominio
 * e controlli di formato che precedono le regole di `validaRichiesta`.
 */
import type { Corso, DatiRichiestaInput, Dichiarazioni, EnteErogatore, ErroreValidazione, Modalita, Richiesta, Tipologia } from '../../../domain';
import { parseNumero } from '../../format';
import { testoNumero } from './comuni';

export const DATORE: EnteErogatore = 'Datore di lavoro';
export const ESTERNO: EnteErogatore = 'Committente o altro soggetto';

/** Da dove arriva il corso: catalogo aziendale (Datore di lavoro) oppure corso esterno (altro ente). */
export type OrigineCorso = 'catalogo' | 'esterno';
export type SceltaEsterno = 'storico' | 'nuovo';
export type SiNo = '' | 'si' | 'no';

/** Valori dei campi così come digitati (testi), per non perdere ciò che l'utente scrive. */
export interface StatoModulo {
  tipologia: Tipologia;
  // --- formazione
  origineCorso: OrigineCorso;
  corsoCatalogoId: string;
  sceltaEsterno: SceltaEsterno;
  corsoStoricoId: string;
  nuovoTitolo: string;
  nuovoNomeEnte: string;
  nuovaModalita: Modalita | '';
  nuovaDurata: string;
  nuovoPiuGiornate: SiNo;
  // --- permessi
  descrizioneAttivita: string;
  // --- sessione
  dataSessione: string;
  oraInizioSessione: string;
  oraFineSessione: string;
  /** Vuoto finché il lavoratore non risponde (la risposta serve per l'invio). */
  pausaPrevista: SiNo;
  pausaMinuti: string;
  /** Conta solo se ingresso/uscita differiscono dagli orari della sessione. */
  pausaInPresenza: 'si' | 'no';
  oraIngresso: string;
  oraUscita: string;
  // --- ripartizione delle ore
  oreRetribuite: string;
  oreGettone: string;
  oreNonRetribuite: string;
  note: string;
  dichiarazioni: Dichiarazioni;
}

export function moduloVuoto(storicoPresente: boolean): StatoModulo {
  return {
    tipologia: 'Formazione',
    origineCorso: 'catalogo',
    corsoCatalogoId: '',
    sceltaEsterno: storicoPresente ? 'storico' : 'nuovo',
    corsoStoricoId: '',
    nuovoTitolo: '',
    nuovoNomeEnte: '',
    nuovaModalita: '',
    nuovaDurata: '',
    nuovoPiuGiornate: '',
    descrizioneAttivita: '',
    dataSessione: '',
    oraInizioSessione: '',
    oraFineSessione: '',
    pausaPrevista: '',
    pausaMinuti: '',
    pausaInPresenza: 'si',
    oraIngresso: '',
    oraUscita: '',
    oreRetribuite: '',
    oreGettone: '',
    oreNonRetribuite: '',
    note: '',
    dichiarazioni: { partecipazione: false, correttezza: false, autorizzazione: false },
  };
}

/** La richiesta riguarda un permesso (diritto allo studio, riqualifica professionale). */
export const moduloPermesso = (s: Pick<StatoModulo, 'tipologia'>) => s.tipologia !== 'Formazione';

/** Ente erogatore dedotto dalla scelta del corso (il lavoratore non lo indica più a mano). */
export function enteDi(s: Pick<StatoModulo, 'origineCorso'>): EnteErogatore {
  return s.origineCorso === 'catalogo' ? DATORE : ESTERNO;
}

/** Ingresso e uscita diversi dagli orari della sessione (arrivo in ritardo o uscita anticipata). */
export function presenzaParziale(s: Pick<StatoModulo, 'oraInizioSessione' | 'oraFineSessione' | 'oraIngresso' | 'oraUscita'>): boolean {
  return !!s.oraIngresso && !!s.oraUscita && (s.oraIngresso !== s.oraInizioSessione || s.oraUscita !== s.oraFineSessione);
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
    ente: r.ente ?? ESTERNO,
    modalita: r.modalita ?? 'In presenza',
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
  if (!r || r.tipologia !== 'Formazione' || r.ente !== ESTERNO || !r.corsoId || storico.some((c) => c.id === r.corsoId)) return storico;
  return [...storico, corsoDaRichiesta(r, login)];
}

export function statoDaRichiesta(r: Richiesta, catalogo: Corso[]): StatoModulo {
  const base = moduloVuoto(true);
  const esterno = r.tipologia === 'Formazione' && r.ente === ESTERNO;
  const aCatalogo = r.tipologia === 'Formazione' && !esterno && catalogo.some((c) => c.id === r.corsoId);
  const parziale = presenzaParziale(r);
  return {
    ...base,
    tipologia: r.tipologia,
    origineCorso: esterno ? 'esterno' : 'catalogo',
    corsoCatalogoId: aCatalogo ? r.corsoId ?? '' : '',
    sceltaEsterno: 'storico',
    corsoStoricoId: esterno ? r.corsoId ?? '' : '',
    descrizioneAttivita: r.descrizioneAttivita ?? '',
    dataSessione: r.dataSessione,
    oraInizioSessione: r.oraInizioSessione,
    oraFineSessione: r.oraFineSessione,
    pausaPrevista: r.pausaPrevista ? 'si' : 'no',
    pausaMinuti: r.pausaPrevista && r.pausaMinuti > 0 ? String(r.pausaMinuti) : '',
    pausaInPresenza: r.pausaPrevista && parziale && !r.pausaInPresenza ? 'no' : 'si',
    oraIngresso: r.oraIngresso,
    oraUscita: r.oraUscita,
    oreRetribuite: testoNumero(r.oreRetribuiteRichieste),
    oreGettone: testoNumero(r.oreGettoneRichieste),
    oreNonRetribuite: testoNumero(r.oreNonRetribuiteRichieste),
    note: r.noteLavoratore ?? '',
    dichiarazioni: { ...r.dichiarazioni },
  };
}

/** Numero da un campo di testo: vuoto = 0; NaN se il testo non è un numero. */
export function numeroCampo(testo: string): number {
  return testo.trim() === '' ? 0 : parseNumero(testo);
}

/** Minuti di pausa digitati: numero intero, NaN se vuoto o non valido. */
export function minutiPausa(testo: string): number {
  const t = testo.trim();
  return /^\d{1,4}$/.test(t) ? Number(t) : NaN;
}

export function corsoIdScelto(s: StatoModulo): string | undefined {
  if (moduloPermesso(s)) return undefined;
  if (s.origineCorso === 'catalogo') return s.corsoCatalogoId || undefined;
  if (s.sceltaEsterno === 'storico') return s.corsoStoricoId || undefined;
  return undefined;
}

export function inputDaStato(s: StatoModulo, gettoneNonPrevisto: boolean): DatiRichiestaInput {
  const pausa = s.pausaPrevista === 'si';
  const sessione = {
    dataSessione: s.dataSessione,
    oraInizioSessione: s.oraInizioSessione,
    oraFineSessione: s.oraFineSessione,
    pausaPrevista: pausa,
    pausaMinuti: pausa ? minutiPausa(s.pausaMinuti) : 0,
    noteLavoratore: s.note.trim() || undefined,
    dichiarazioni: { ...s.dichiarazioni },
  };
  if (moduloPermesso(s)) {
    // permessi: presenza = orario del permesso; le ore le calcola il server (tutte a carico del monte ore)
    return {
      ...sessione,
      tipologia: s.tipologia,
      descrizioneAttivita: s.descrizioneAttivita.trim(),
      pausaInPresenza: true,
      oraIngresso: s.oraInizioSessione,
      oraUscita: s.oraFineSessione,
      oreRetribuiteRichieste: 0,
      oreGettoneRichieste: 0,
      oreNonRetribuiteRichieste: 0,
    };
  }
  const nuovo = s.origineCorso === 'esterno' && s.sceltaEsterno === 'nuovo';
  return {
    ...sessione,
    tipologia: 'Formazione',
    ente: enteDi(s),
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
    pausaInPresenza: !pausa || !presenzaParziale(s) || s.pausaInPresenza === 'si',
    oraIngresso: s.oraIngresso,
    oraUscita: s.oraUscita,
    oreRetribuiteRichieste: numeroCampo(s.oreRetribuite),
    oreGettoneRichieste: gettoneNonPrevisto ? 0 : numeroCampo(s.oreGettone),
    oreNonRetribuiteRichieste: numeroCampo(s.oreNonRetribuite),
  };
}

const NUMERO_NON_VALIDO = 'Inserisci un numero valido (es. 2,5).';

/**
 * Controlli di compilazione con messaggi più chiari di quelli generici
 * (campo vuoto, testo non numerico). Vengono mostrati prima di quelli di `validaRichiesta`.
 */
export function validaCompilazione(s: StatoModulo, gettoneNonPrevisto: boolean, perInvio: boolean): ErroreValidazione[] {
  const errori: ErroreValidazione[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });
  const permesso = moduloPermesso(s);
  if (!permesso && s.origineCorso === 'esterno') {
    if (s.sceltaEsterno === 'nuovo') {
      if (s.nuovaDurata.trim() && Number.isNaN(parseNumero(s.nuovaDurata))) err('nuovoCorso.durataOre', 'Inserisci la durata in ore (es. 7,5).');
      if (!s.nuovoPiuGiornate) err('nuovoCorso.piuGiornate', 'Indica se sono previste più giornate formative.');
    } else if (!s.corsoStoricoId) {
      err('corsoId', 'Seleziona il corso esterno che hai già inserito oppure scegli «Un nuovo corso esterno».');
    }
  }
  const vuoti: [keyof StatoModulo, string][] = permesso
    ? [
        ['oraInizioSessione', 'Indica l’ora di inizio del permesso.'],
        ['oraFineSessione', 'Indica l’ora di fine del permesso.'],
      ]
    : [
        ['oraInizioSessione', 'Indica l’ora di inizio della sessione.'],
        ['oraFineSessione', 'Indica l’ora di fine della sessione.'],
        ['oraIngresso', 'Indica l’ora in cui sei entrato/a.'],
        ['oraUscita', 'Indica l’ora in cui sei uscito/a.'],
      ];
  for (const [campo, messaggio] of vuoti) if (!s[campo]) err(campo, messaggio);
  if (perInvio && !s.pausaPrevista) err('pausaPrevista', 'Indica se era prevista una pausa.');
  if (s.pausaPrevista === 'si' && s.pausaMinuti.trim() && Number.isNaN(minutiPausa(s.pausaMinuti))) {
    err('pausaMinuti', 'Inserisci la durata della pausa in minuti interi (es. 30 oppure 60).');
  }
  if (!permesso) {
    if (Number.isNaN(numeroCampo(s.oreRetribuite))) err('oreRetribuiteRichieste', NUMERO_NON_VALIDO);
    if (!gettoneNonPrevisto && Number.isNaN(numeroCampo(s.oreGettone))) err('oreGettoneRichieste', NUMERO_NON_VALIDO);
    if (Number.isNaN(numeroCampo(s.oreNonRetribuite))) err('oreNonRetribuiteRichieste', NUMERO_NON_VALIDO);
  }
  return errori;
}
