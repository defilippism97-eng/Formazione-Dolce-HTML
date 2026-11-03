/**
 * File per l'Ufficio Paghe (CSV con separatore ";", UTF-8 con BOM: si apre direttamente in Excel).
 */
import { arrotonda2 } from './calcoli';
import type { Lavoratore, Richiesta } from './types';

export const INTESTAZIONE_PAGHE = [
  'Codice fiscale',
  'Cognome',
  'Nome',
  'Area',
  'Servizio',
  'Centro di costo',
  'Mese',
  'Anno',
  'Titolo corso',
  'Data corso',
  'Ore retribuite riconosciute HR',
  'Ore gettone riconosciute HR',
  'ID richiesta',
] as const;

export interface RigaPaghe {
  codiceFiscale: string;
  cognome: string;
  nome: string;
  area: string;
  servizio: string;
  centroDiCosto: string;
  mese: number;
  anno: number;
  titoloCorso: string;
  dataCorso: string; // AAAA-MM-GG
  oreRetribuite: number;
  oreGettone: number;
  idRichiesta: string;
}

export function righePaghe(richieste: readonly Richiesta[], lavoratori: readonly Lavoratore[]): RigaPaghe[] {
  const cf = new Map(lavoratori.map((l) => [l.id, l.codiceFiscale ?? '']));
  return richieste
    .map((r) => ({
      codiceFiscale: cf.get(r.lavoratoreId) ?? '',
      cognome: r.cognome,
      nome: r.nome,
      area: r.area,
      servizio: r.servizio,
      centroDiCosto: r.centroDiCosto,
      mese: r.meseCompetenza,
      anno: r.annoCompetenza,
      titoloCorso: r.titoloCorsoLibero || r.titoloCorso,
      dataCorso: r.dataSessione,
      oreRetribuite: arrotonda2(r.oreRetribuiteHR ?? 0),
      oreGettone: arrotonda2(r.oreGettoneHR ?? 0),
      idRichiesta: r.numero,
    }))
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it') || a.dataCorso.localeCompare(b.dataCorso));
}

/** Numero con la virgola decimale (formato italiano, senza separatore delle migliaia). */
export function decimaleIT(n: number): string {
  return arrotonda2(n).toString().replace('.', ',');
}

/** Racchiude un testo tra doppi apici e raddoppia quelli interni; neutralizza le formule di Excel. */
export function campoCsv(valore: string): string {
  let v = valore ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // prevenzione "CSV injection"
  return `"${v.replace(/"/g, '""')}"`;
}

export function generaCsvPaghe(righe: readonly RigaPaghe[]): string {
  const BOM = '﻿';
  const intestazione = INTESTAZIONE_PAGHE.join(';');
  const corpo = righe.map((r) =>
    [
      campoCsv(r.codiceFiscale),
      campoCsv(r.cognome),
      campoCsv(r.nome),
      campoCsv(r.area),
      campoCsv(r.servizio),
      campoCsv(r.centroDiCosto),
      String(r.mese),
      String(r.anno),
      campoCsv(r.titoloCorso),
      `${r.dataCorso.slice(8, 10)}/${r.dataCorso.slice(5, 7)}/${r.dataCorso.slice(0, 4)}`,
      decimaleIT(r.oreRetribuite),
      decimaleIT(r.oreGettone),
      campoCsv(r.idRichiesta),
    ].join(';'),
  );
  return BOM + [intestazione, ...corpo].join('\r\n') + '\r\n';
}

export function nomeFilePaghe(periodo: string, versione: number): string {
  return `Formazione_Payroll_${periodo}_v${versione}.csv`;
}
