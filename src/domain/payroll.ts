/**
 * File per l'Ufficio Paghe (CSV con separatore ";", UTF-8 con BOM: si apre direttamente in Excel).
 * Ogni voce ha la propria colonna: ore retribuite, ore gettone, ore non retribuite e,
 * per i permessi, ore di diritto allo studio e ore di riqualifica professionale.
 */
import { arrotonda2 } from './calcoli';
import { titoloRichiesta } from './regole';
import type { Lavoratore, Richiesta, Tipologia } from './types';

export const INTESTAZIONE_PAGHE = [
  'Codice fiscale',
  'Cognome',
  'Nome',
  'Area',
  'Servizio',
  'Centro di costo',
  'Mese',
  'Anno',
  'Tipologia',
  'Titolo corso',
  'Data corso',
  'Ore retribuite riconosciute HR',
  'Ore gettone riconosciute HR',
  'Ore non retribuite',
  'Ore diritto allo studio',
  'Ore riqualifica professionale',
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
  tipologia: Tipologia;
  /** Titolo del corso oppure attività del permesso. */
  titoloCorso: string;
  dataCorso: string; // AAAA-MM-GG
  oreRetribuite: number;
  oreGettone: number;
  oreNonRetribuite: number;
  oreDirittoStudio: number;
  oreRiqualifica: number;
  idRichiesta: string;
}

export function righePaghe(richieste: readonly Richiesta[], lavoratori: readonly Lavoratore[]): RigaPaghe[] {
  const cf = new Map(lavoratori.map((l) => [l.id, l.codiceFiscale ?? '']));
  return richieste
    .map((r) => {
      const ore = arrotonda2(r.oreRetribuiteHR ?? 0);
      return {
        codiceFiscale: cf.get(r.lavoratoreId) ?? '',
        cognome: r.cognome,
        nome: r.nome,
        area: r.area,
        servizio: r.servizio,
        centroDiCosto: r.centroDiCosto,
        mese: r.meseCompetenza,
        anno: r.annoCompetenza,
        tipologia: r.tipologia,
        titoloCorso: r.tipologia === 'Formazione' ? titoloRichiesta(r) : (r.descrizioneAttivita ?? r.tipologia),
        dataCorso: r.dataSessione,
        // per i permessi le ore validate vanno nella colonna del proprio tipo
        oreRetribuite: r.tipologia === 'Formazione' ? ore : 0,
        oreGettone: r.tipologia === 'Formazione' ? arrotonda2(r.oreGettoneHR ?? 0) : 0,
        oreNonRetribuite: arrotonda2(r.oreNonRetribuiteHR ?? 0),
        oreDirittoStudio: r.tipologia === 'Diritto allo studio' ? ore : 0,
        oreRiqualifica: r.tipologia === 'Riqualifica professionale' ? ore : 0,
        idRichiesta: r.numero,
      };
    })
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it') || a.dataCorso.localeCompare(b.dataCorso));
}

export interface TotaliPaghe {
  oreRetribuite: number;
  oreGettone: number;
  oreNonRetribuite: number;
  orePermessi: number;
}

export function totaliPaghe(righe: readonly RigaPaghe[]): TotaliPaghe {
  const somma = (sel: (r: RigaPaghe) => number) => arrotonda2(righe.reduce((t, r) => t + sel(r), 0));
  return {
    oreRetribuite: somma((r) => r.oreRetribuite),
    oreGettone: somma((r) => r.oreGettone),
    oreNonRetribuite: somma((r) => r.oreNonRetribuite),
    orePermessi: somma((r) => r.oreDirittoStudio + r.oreRiqualifica),
  };
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
      campoCsv(r.tipologia),
      campoCsv(r.titoloCorso),
      `${r.dataCorso.slice(8, 10)}/${r.dataCorso.slice(5, 7)}/${r.dataCorso.slice(0, 4)}`,
      decimaleIT(r.oreRetribuite),
      decimaleIT(r.oreGettone),
      decimaleIT(r.oreNonRetribuite),
      decimaleIT(r.oreDirittoStudio),
      decimaleIT(r.oreRiqualifica),
      campoCsv(r.idRichiesta),
    ].join(';'),
  );
  return BOM + [intestazione, ...corpo].join('\r\n') + '\r\n';
}

export function nomeFilePaghe(periodo: string, versione: number): string {
  return `Formazione_Payroll_${periodo}_v${versione}.csv`;
}
