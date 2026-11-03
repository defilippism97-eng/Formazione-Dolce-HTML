/**
 * Calcoli su orari, date, periodi e giorni lavorativi. Funzioni pure.
 */
import type { DataISO, Orario } from './types';

const RE_ORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function isOrarioValido(ora: string | undefined | null): ora is Orario {
  return typeof ora === 'string' && RE_ORA.test(ora);
}

export function isDataValida(data: string | undefined | null): data is DataISO {
  if (typeof data !== 'string' || !RE_DATA.test(data)) return false;
  const d = parseData(data);
  return formatData(d) === data;
}

/** Minuti dalla mezzanotte di un orario `HH:mm`. */
export function minuti(ora: Orario): number {
  const m = RE_ORA.exec(ora);
  if (!m) throw new Error(`Orario non valido: ${ora}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Arrotonda a 2 decimali evitando errori di virgola mobile (es. 1.005 -> 1.01). */
export function arrotonda2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Ore (decimali, 2 cifre) tra due orari dello stesso giorno. Negativo se `fine` precede `inizio`. */
export function oreTra(inizio: Orario, fine: Orario): number {
  return arrotonda2((minuti(fine) - minuti(inizio)) / 60);
}

/** Converte `AAAA-MM-GG` in Date a mezzanotte UTC (nessun effetto del fuso orario). */
export function parseData(data: DataISO): Date {
  const [a, m, g] = data.split('-').map(Number);
  return new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, g ?? 1));
}

export function formatData(d: Date): DataISO {
  return d.toISOString().slice(0, 10);
}

/** Data di oggi nel fuso Europe/Rome. */
export function oggiRoma(adesso: Date = new Date()): DataISO {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);
  return parti; // en-CA produce AAAA-MM-GG
}

export function aggiungiGiorni(data: DataISO, giorni: number): DataISO {
  const d = parseData(data);
  d.setUTCDate(d.getUTCDate() + giorni);
  return formatData(d);
}

export function periodo(anno: number, mese: number): string {
  return `${anno}-${String(mese).padStart(2, '0')}`;
}

export function periodoDiData(data: DataISO): { anno: number; mese: number; periodo: string } {
  const anno = Number(data.slice(0, 4));
  const mese = Number(data.slice(5, 7));
  return { anno, mese, periodo: periodo(anno, mese) };
}

export function mesePrecedente(anno: number, mese: number): { anno: number; mese: number } {
  return mese === 1 ? { anno: anno - 1, mese: 12 } : { anno, mese: mese - 1 };
}

export const NOMI_MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
] as const;

export function nomeMese(mese: number): string {
  return NOMI_MESI[mese - 1] ?? String(mese);
}

/** Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher, calendario gregoriano). */
export function pasqua(anno: number): DataISO {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

/**
 * Festività nazionali italiane dell'anno, più eventuali giorni aggiuntivi
 * (es. patrono locale, nel formato `MM-GG`).
 */
export function festivitaItaliane(anno: number, aggiuntive: string[] = []): Set<DataISO> {
  const fisse = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26', ...aggiuntive];
  const res = new Set<DataISO>(fisse.map((md) => `${anno}-${md}`));
  res.add(aggiungiGiorni(pasqua(anno), 1)); // Lunedì dell'Angelo
  return res;
}

export function isGiornoLavorativo(data: DataISO, patroni: string[] = []): boolean {
  const giorno = parseData(data).getUTCDay();
  if (giorno === 0 || giorno === 6) return false;
  return !festivitaItaliane(Number(data.slice(0, 4)), patroni).has(data);
}

/**
 * Giorni lavorativi trascorsi dopo `da` fino a `a` compreso
 * (es. inviata lunedì, oggi giovedì -> 3).
 */
export function giorniLavorativiTrascorsi(da: DataISO, a: DataISO, patroni: string[] = []): number {
  if (a <= da) return 0;
  let n = 0;
  let d = aggiungiGiorni(da, 1);
  while (d <= a) {
    if (isGiornoLavorativo(d, patroni)) n++;
    d = aggiungiGiorni(d, 1);
  }
  return n;
}

/** Converte un istante ISO nella data di calendario di Roma. */
export function dataRomaDaIstante(istante: string): DataISO {
  return oggiRoma(new Date(istante));
}
