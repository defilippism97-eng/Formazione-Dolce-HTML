/**
 * Filtri e indicatori del riepilogo mensile.
 */
import { arrotonda2 } from './calcoli';
import { DEFINITIVI } from './stati';
import { titoloRichiesta } from './regole';
import type { Area, Richiesta, StatoRichiesta, Tipologia } from './types';

export interface FiltriRichieste {
  tipologia?: Tipologia;
  anno?: number;
  mese?: number;
  area?: Area;
  servizio?: string;
  centroDiCosto?: string;
  coordinatoreLogin?: string;
  login?: string;
  codiceCorso?: string;
  stato?: StatoRichiesta;
  /** Ricerca libera su nominativo, numero richiesta e titolo del corso. */
  testo?: string;
}

export function filtraRichieste(richieste: readonly Richiesta[], f: FiltriRichieste): Richiesta[] {
  const testo = f.testo?.trim().toLowerCase();
  return richieste.filter(
    (r) =>
      (!f.tipologia || r.tipologia === f.tipologia) &&
      (f.anno === undefined || r.annoCompetenza === f.anno) &&
      (f.mese === undefined || r.meseCompetenza === f.mese) &&
      (!f.area || r.area === f.area) &&
      (!f.servizio || r.servizio === f.servizio) &&
      (!f.centroDiCosto || r.centroDiCosto === f.centroDiCosto) &&
      (!f.coordinatoreLogin || r.coordinatoreLogin === f.coordinatoreLogin) &&
      (!f.login || r.login === f.login) &&
      (!f.codiceCorso || r.codiceCorso === f.codiceCorso) &&
      (!f.stato || r.stato === f.stato) &&
      (!testo ||
        `${r.cognome} ${r.nome} ${r.numero} ${titoloRichiesta(r)} ${r.codiceCorso}`.toLowerCase().includes(testo)),
  );
}

export interface KPI {
  lavoratori: number;
  richieste: number;
  oreFrequentate: number;
  // --- Formazione
  oreRetribuiteRichieste: number;
  oreGettoneRichieste: number;
  oreNonRetribuiteRichieste: number;
  oreRetribuiteCoord: number;
  oreGettoneCoord: number;
  oreNonRetribuiteCoord: number;
  oreRetribuiteHR: number;
  oreGettoneHR: number;
  oreNonRetribuiteHR: number;
  // --- Permessi (diritto allo studio + riqualifica professionale)
  orePermessiRichieste: number;
  orePermessiCoord: number;
  orePermessiHR: number;
}

/** Indicatori (le richieste annullate e le bozze sono escluse). */
export function calcolaKPI(richieste: readonly Richiesta[]): KPI {
  const valide = richieste.filter((r) => r.stato !== 'Annullata' && r.stato !== 'Bozza');
  const formazione = (r: Richiesta) => r.tipologia === 'Formazione';
  const permesso = (r: Richiesta) => r.tipologia !== 'Formazione';
  const approvataCoord = (r: Richiesta) => r.approvatoCoordIl !== undefined;
  const definitiva = (r: Richiesta) => DEFINITIVI.has(r.stato);
  const somma = (sel: (r: Richiesta) => number | undefined, ...filtri: ((r: Richiesta) => boolean)[]) =>
    arrotonda2(valide.filter((r) => filtri.every((f) => f(r))).reduce((s, r) => s + (sel(r) ?? 0), 0));
  return {
    lavoratori: new Set(valide.map((r) => r.login)).size,
    richieste: valide.length,
    oreFrequentate: somma((r) => r.oreFrequentate),
    oreRetribuiteRichieste: somma((r) => r.oreRetribuiteRichieste, formazione),
    oreGettoneRichieste: somma((r) => r.oreGettoneRichieste, formazione),
    oreNonRetribuiteRichieste: somma((r) => r.oreNonRetribuiteRichieste, formazione),
    oreRetribuiteCoord: somma((r) => r.oreRetribuiteCoord, formazione, approvataCoord),
    oreGettoneCoord: somma((r) => r.oreGettoneCoord, formazione, approvataCoord),
    oreNonRetribuiteCoord: somma((r) => r.oreNonRetribuiteCoord, formazione, approvataCoord),
    oreRetribuiteHR: somma((r) => r.oreRetribuiteHR, formazione, definitiva),
    oreGettoneHR: somma((r) => r.oreGettoneHR, formazione, definitiva),
    oreNonRetribuiteHR: somma((r) => r.oreNonRetribuiteHR, formazione, definitiva),
    orePermessiRichieste: somma((r) => r.oreRetribuiteRichieste, permesso),
    orePermessiCoord: somma((r) => r.oreRetribuiteCoord, permesso, approvataCoord),
    orePermessiHR: somma((r) => r.oreRetribuiteHR, permesso, definitiva),
  };
}

export type Raggruppamento = 'coordinatore' | 'servizio' | 'centroDiCosto' | 'area';

export interface RigaRaggruppata extends KPI {
  chiave: string;
  etichetta: string;
}

/** Totali per coordinatore, servizio, centro di costo o area (divisione). */
export function raggruppa(richieste: readonly Richiesta[], per: Raggruppamento): RigaRaggruppata[] {
  const gruppi = new Map<string, { etichetta: string; righe: Richiesta[] }>();
  for (const r of richieste) {
    const [chiave, etichetta] =
      per === 'coordinatore'
        ? [r.coordinatoreLogin ?? '-', r.coordinatoreNome ?? 'Senza coordinatore']
        : per === 'servizio'
          ? [r.servizio, r.servizio]
          : per === 'centroDiCosto'
            ? [r.centroDiCosto, r.centroDiCosto]
            : [r.area, r.area];
    const g = gruppi.get(chiave) ?? { etichetta, righe: [] };
    g.righe.push(r);
    gruppi.set(chiave, g);
  }
  return [...gruppi.entries()]
    .map(([chiave, g]) => ({ chiave, etichetta: g.etichetta, ...calcolaKPI(g.righe) }))
    .filter((r) => r.richieste > 0)
    .sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));
}
