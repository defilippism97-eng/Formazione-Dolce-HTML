/**
 * Filtri e indicatori del riepilogo mensile.
 */
import { arrotonda2 } from './calcoli';
import { DEFINITIVI } from './stati';
import type { Area, Richiesta, StatoRichiesta } from './types';

export interface FiltriRichieste {
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
        `${r.cognome} ${r.nome} ${r.numero} ${r.titoloCorso} ${r.codiceCorso}`.toLowerCase().includes(testo)),
  );
}

export interface KPI {
  lavoratori: number;
  richieste: number;
  oreFrequentate: number;
  oreRetribuiteRichieste: number;
  oreGettoneRichieste: number;
  oreRetribuiteCoord: number;
  oreGettoneCoord: number;
  oreRetribuiteHR: number;
  oreGettoneHR: number;
}

/** Indicatori (le richieste annullate e le bozze sono escluse). */
export function calcolaKPI(richieste: readonly Richiesta[]): KPI {
  const valide = richieste.filter((r) => r.stato !== 'Annullata' && r.stato !== 'Bozza');
  const somma = (sel: (r: Richiesta) => number | undefined, filtro: (r: Richiesta) => boolean = () => true) =>
    arrotonda2(valide.filter(filtro).reduce((s, r) => s + (sel(r) ?? 0), 0));
  return {
    lavoratori: new Set(valide.map((r) => r.login)).size,
    richieste: valide.length,
    oreFrequentate: somma((r) => r.oreFrequentate),
    oreRetribuiteRichieste: somma((r) => r.oreRetribuiteRichieste),
    oreGettoneRichieste: somma((r) => r.oreGettoneRichieste),
    oreRetribuiteCoord: somma((r) => r.oreRetribuiteCoord, (r) => r.approvatoCoordIl !== undefined),
    oreGettoneCoord: somma((r) => r.oreGettoneCoord, (r) => r.approvatoCoordIl !== undefined),
    oreRetribuiteHR: somma((r) => r.oreRetribuiteHR, (r) => DEFINITIVI.has(r.stato)),
    oreGettoneHR: somma((r) => r.oreGettoneHR, (r) => DEFINITIVI.has(r.stato)),
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
