/** Formattazione per l'interfaccia (lingua italiana, fuso Europe/Rome). */
import { nomeMese } from '../domain';

const fmtData = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
const fmtDataOra = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});
const fmtNumero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/** `AAAA-MM-GG` -> `GG/MM/AAAA` (senza conversioni di fuso). */
export function data(d?: string): string {
  if (!d) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return fmtData.format(new Date(d));
}

export function dataOra(istante?: string): string {
  return istante ? fmtDataOra.format(new Date(istante)) : '—';
}

export function numero(n?: number): string {
  return n === undefined || n === null || Number.isNaN(n) ? '—' : fmtNumero.format(n);
}

export function ore(n?: number): string {
  return n === undefined || n === null ? '—' : `${fmtNumero.format(n)} h`;
}

export function periodo(anno: number, mese: number): string {
  return `${nomeMese(mese)} ${anno}`;
}

export function dimensioneFile(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${fmtNumero.format(byte / 1024 / 1024)} MB`;
}

/** Converte un testo con decimali italiani ("3,5") in numero; NaN se non valido. */
export function parseNumero(testo: string): number {
  const t = testo.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
}

/** Avvia il download di un file nel browser. */
export function scaricaFile(nome: string, contenuto: Blob | string, mime = 'text/csv;charset=utf-8'): void {
  const blob = typeof contenuto === 'string' ? new Blob([contenuto], { type: mime }) : contenuto;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Apre un file (es. PDF) in una nuova scheda; se il browser lo blocca, lo scarica. */
export function apriFile(nome: string, contenuto: Blob): void {
  const url = URL.createObjectURL(contenuto);
  // senza 'noopener' nelle opzioni (altrimenti window.open restituisce sempre null): lo azzero dopo
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  else scaricaFile(nome, contenuto);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
