/**
 * Elementi comuni alle schermate di gestione (coordinatore, HR, amministratore):
 * opzioni dei filtri, segnali di anomalia sulle richieste, esportazione CSV.
 */
import {
  campoCsv,
  decimaleIT,
  ESCLUSI_DAI_CONTROLLI,
  ETICHETTA_ANOMALIA,
  IN_ATTESA_COORDINATORE,
  NOMI_MESI,
  oggiRoma,
  type ChiusuraMensile,
  type Richiesta,
  type UtenteDirectory,
} from '../../../domain';
import { Icona, type NomeIcona } from '../../components/Icona';
import { Etichetta, type Opzione } from '../../components/ui';
import * as f from '../../format';

/** Tolleranza per i confronti tra ore decimali (stessa del dominio). */
export const TOLLERANZA_ORE = 0.001;

export const nominativo = (p: { cognome: string; nome: string }) => `${p.cognome} ${p.nome}`;
export const titoloCorso = (r: Pick<Richiesta, 'titoloCorso' | 'titoloCorsoLibero'>) => r.titoloCorsoLibero || r.titoloCorso;
export const haAttestato = (r: Richiesta) => r.allegati.some((a) => a.tipo === 'Attestato');

/** Anno e mese correnti nel fuso di Roma. */
export function oggiAnnoMese(): { anno: number; mese: number } {
  const oggi = oggiRoma();
  return { anno: Number(oggi.slice(0, 4)), mese: Number(oggi.slice(5, 7)) };
}

export const OPZIONI_MESI: Opzione[] = NOMI_MESI.map((m, i) => ({ valore: String(i + 1), etichetta: m }));

/** Anni selezionabili: l'anno corrente, i precedenti e quelli presenti nei dati (dal più recente). */
export function opzioniAnni(presenti: readonly number[] = [], indietro = 3): Opzione[] {
  const { anno } = oggiAnnoMese();
  const anni = new Set<number>(presenti);
  for (let a = anno; a >= anno - indietro; a--) anni.add(a);
  return [...anni].sort((a, b) => b - a).map((a) => ({ valore: String(a), etichetta: String(a) }));
}

/** Valori distinti (es. servizi presenti nelle richieste) ordinati per etichetta. */
export function opzioniDistinte<T>(elenco: readonly T[], chiave: (x: T) => string | undefined | null, etichetta?: (x: T) => string): Opzione[] {
  const m = new Map<string, string>();
  for (const x of elenco) {
    const k = chiave(x);
    if (k && !m.has(k)) m.set(k, etichetta ? etichetta(x) : k);
  }
  return [...m.entries()].map(([valore, e]) => ({ valore, etichetta: e })).sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));
}

/** Unisce più elenchi di opzioni senza duplicati (vince la prima etichetta). */
export function unisciOpzioni(...elenchi: Opzione[][]): Opzione[] {
  const m = new Map<string, string>();
  for (const e of elenchi) for (const o of e) if (!m.has(o.valore)) m.set(o.valore, o.etichetta);
  return [...m.entries()].map(([valore, etichetta]) => ({ valore, etichetta })).sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));
}

export function nomeUtente(utenti: readonly UtenteDirectory[] | undefined, login?: string): string {
  if (!login) return '—';
  const u = utenti?.find((x) => x.login === login);
  return u ? `${u.cognome} ${u.nome}` : login;
}

export function meseChiusoIn(chiusure: readonly ChiusuraMensile[] | undefined, anno: number, mese: number): boolean {
  return !!chiusure?.some((c) => c.anno === anno && c.mese === mese && c.stato === 'Chiuso');
}

// ---------------------------------------------------------------------------
//  Segnali sulle richieste
// ---------------------------------------------------------------------------
export interface Segnale {
  chiave: string;
  testo: string;
  tono: 'pericolo' | 'avviso' | 'info';
  icona: NomeIcona;
}

export function segnaliRichiesta(r: Richiesta, extra: { cfMancante?: boolean; oreRidotte?: boolean } = {}): Segnale[] {
  const out: Segnale[] = [];
  const controllata = r.stato !== 'Bozza' && r.stato !== 'Annullata' && !ESCLUSI_DAI_CONTROLLI.has(r.stato);
  if (r.possibileDuplicato && controllata) out.push({ chiave: 'duplicato', testo: ETICHETTA_ANOMALIA.duplicato, tono: 'pericolo', icona: 'duplicato' });
  if (controllata && !haAttestato(r)) out.push({ chiave: 'attestato', testo: ETICHETTA_ANOMALIA.attestatoMancante, tono: 'avviso', icona: 'allegato' });
  if (IN_ATTESA_COORDINATORE.has(r.stato)) {
    if (r.segnalataHR) out.push({ chiave: 'sollecito', testo: `Segnalata a HR (${r.giorniAttesa} gg lavorativi)`, tono: 'pericolo', icona: 'orologio' });
    else if (r.giorniAttesa >= 3) out.push({ chiave: 'attesa', testo: `In attesa da ${r.giorniAttesa} gg lavorativi`, tono: 'avviso', icona: 'orologio' });
  }
  if (!r.coordinatoreLogin && controllata) out.push({ chiave: 'coordinatore', testo: ETICHETTA_ANOMALIA.senzaCoordinatore, tono: 'pericolo', icona: 'team' });
  if (extra.cfMancante) out.push({ chiave: 'cf', testo: ETICHETTA_ANOMALIA.codiceFiscaleMancante, tono: 'pericolo', icona: 'utente' });
  if (extra.oreRidotte) out.push({ chiave: 'ridotte', testo: 'Ore ridotte dal coordinatore rispetto alla richiesta', tono: 'info', icona: 'info' });
  return out;
}

/** Il coordinatore ha riconosciuto meno ore di quelle richieste. */
export function oreRidotteDalCoordinatore(r: Richiesta): boolean {
  if (r.oreRetribuiteCoord === undefined && r.oreGettoneCoord === undefined) return false;
  const richieste = r.oreRetribuiteRichieste + r.oreGettoneRichieste;
  const riconosciute = (r.oreRetribuiteCoord ?? 0) + (r.oreGettoneCoord ?? 0);
  return riconosciute + TOLLERANZA_ORE < richieste;
}

/** Segnali come etichette (testo visibile) o come icone compatte con descrizione accessibile. */
export function Segnali({ segnali, compatto }: { segnali: Segnale[]; compatto?: boolean }) {
  if (!segnali.length) return null;
  if (compatto) {
    return (
      <span className="segnali segnali-compatti">
        {segnali.map((s) => (
          <span key={s.chiave} className={`segnale segnale-${s.tono}`}>
            <Icona nome={s.icona} dimensione={15} titolo={s.testo} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="segnali">
      {segnali.map((s) => (
        <Etichetta key={s.chiave} tono={s.tono}>
          <Icona nome={s.icona} dimensione={13} /> {s.testo}
        </Etichetta>
      ))}
    </span>
  );
}

/** Legenda delle icone compatte. */
export function LegendaSegnali() {
  const voci: Segnale[] = [
    { chiave: 'duplicato', testo: ETICHETTA_ANOMALIA.duplicato, tono: 'pericolo', icona: 'duplicato' },
    { chiave: 'attestato', testo: ETICHETTA_ANOMALIA.attestatoMancante, tono: 'avviso', icona: 'allegato' },
    { chiave: 'cf', testo: ETICHETTA_ANOMALIA.codiceFiscaleMancante, tono: 'pericolo', icona: 'utente' },
    { chiave: 'sollecito', testo: 'Attesa prolungata / segnalata a HR', tono: 'avviso', icona: 'orologio' },
    { chiave: 'ridotte', testo: 'Ore ridotte dal coordinatore', tono: 'info', icona: 'info' },
    { chiave: 'chiuso', testo: 'Mese chiuso', tono: 'info', icona: 'lucchetto' },
  ];
  return (
    <p className="legenda" aria-label="Legenda delle icone">
      <strong>Legenda:</strong>
      {voci.map((v) => (
        <span key={v.chiave}>
          <span className={`segnale segnale-${v.tono}`} aria-hidden>
            <Icona nome={v.icona} dimensione={15} />
          </span>
          {v.testo}
        </span>
      ))}
    </p>
  );
}

/** Ore retribuite e gettone su due righe (cella numerica). */
export function CoppiaOre({ retribuite, gettone }: { retribuite?: number; gettone?: number }) {
  if (retribuite === undefined && gettone === undefined) return <span className="testo-secondario">—</span>;
  return (
    <span className="ore-coppia">
      <span>
        {f.numero(retribuite ?? 0)} <small>retr.</small>
      </span>
      <span>
        {f.numero(gettone ?? 0)} <small>gett.</small>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
//  Esportazione CSV (separatore ";", UTF-8 con BOM, virgola decimale: si apre in Excel)
// ---------------------------------------------------------------------------
export const INTESTAZIONE_CSV_RICHIESTE = [
  'ID richiesta',
  'Cognome',
  'Nome',
  'Utente Microsoft 365',
  'Area',
  'Servizio',
  'Centro di costo',
  'Coordinatore',
  'Codice corso',
  'Titolo corso',
  'Ente erogatore',
  'Modalità',
  'Data corso',
  'Mese',
  'Anno',
  'Ore frequentate',
  'Ore retribuite richieste',
  'Ore gettone richieste',
  'Ore retribuite approvate coordinatore',
  'Ore gettone approvate coordinatore',
  'Ore retribuite approvate HR',
  'Ore gettone approvate HR',
  'Stato',
  'Ultima modifica',
] as const;

export function csvRichieste(righe: readonly Richiesta[]): string {
  const num = (n?: number) => (n === undefined || n === null ? '' : decimaleIT(n));
  const corpo = righe.map((r) =>
    [
      campoCsv(r.numero),
      campoCsv(r.cognome),
      campoCsv(r.nome),
      campoCsv(r.login),
      campoCsv(r.area),
      campoCsv(r.servizio),
      campoCsv(r.centroDiCosto),
      campoCsv(r.coordinatoreNome ?? ''),
      campoCsv(r.codiceCorso),
      campoCsv(titoloCorso(r)),
      campoCsv(r.ente),
      campoCsv(r.modalita),
      f.data(r.dataSessione),
      String(r.meseCompetenza),
      String(r.annoCompetenza),
      num(r.oreFrequentate),
      num(r.oreRetribuiteRichieste),
      num(r.oreGettoneRichieste),
      num(r.oreRetribuiteCoord),
      num(r.oreGettoneCoord),
      num(r.oreRetribuiteHR),
      num(r.oreGettoneHR),
      campoCsv(r.stato),
      campoCsv(f.dataOra(r.modificatoIl)),
    ].join(';'),
  );
  return '﻿' + [INTESTAZIONE_CSV_RICHIESTE.join(';'), ...corpo].join('\r\n') + '\r\n';
}
