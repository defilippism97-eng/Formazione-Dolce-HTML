/**
 * Monte ore dei permessi (diritto allo studio, riqualifica professionale).
 *
 * HR assegna a un lavoratore un monte ore per un periodo; le ore dei permessi richiesti
 * si scalano dal monte ore fino a esaurimento:
 *  - ore USUFRUITE: permessi validati da HR;
 *  - ore IMPEGNATE: permessi inviati e ancora in attesa di coordinatore o HR;
 *  - ore RESIDUE = totale − usufruite − impegnate.
 * Bozze, richieste respinte e annullate non consumano ore.
 */
import { arrotonda2 } from './calcoli';
import { DEFINITIVI, ESCLUSI_DAI_CONTROLLI } from './stati';
import type { DataISO, MonteOre, Richiesta, TipoPermesso } from './types';

/** Ore di permesso attualmente a carico del monte ore per una richiesta (l'ultimo valore deciso). */
export function orePermesso(r: Richiesta): number {
  return r.oreRetribuiteHR ?? r.oreRetribuiteCoord ?? r.oreRetribuiteRichieste;
}

export interface ConsumoMonteOre {
  oreUsufruite: number;
  oreImpegnate: number;
  oreResidue: number;
}

/**
 * Consumo di un monte ore.
 * @param escludiRichiestaId richiesta da non contare (quella che si sta modificando o decidendo)
 */
export function consumoMonteOre(m: Pick<MonteOre, 'id' | 'oreTotali'>, richieste: readonly Richiesta[], escludiRichiestaId?: string): ConsumoMonteOre {
  let usufruite = 0;
  let impegnate = 0;
  for (const r of richieste) {
    if (r.monteOreId !== m.id || r.id === escludiRichiestaId) continue;
    if (r.stato === 'Bozza' || ESCLUSI_DAI_CONTROLLI.has(r.stato)) continue;
    if (DEFINITIVI.has(r.stato)) usufruite += orePermesso(r);
    else impegnate += orePermesso(r);
  }
  usufruite = arrotonda2(usufruite);
  impegnate = arrotonda2(impegnate);
  return { oreUsufruite: usufruite, oreImpegnate: impegnate, oreResidue: arrotonda2(m.oreTotali - usufruite - impegnate) };
}

/** Monte ore attivo di un lavoratore per un tipo di permesso e una data. */
export function monteOrePerData<T extends MonteOre>(monti: readonly T[], lavoratoreId: string, tipo: TipoPermesso, data: DataISO): T | undefined {
  return monti.find((m) => m.attivo && m.lavoratoreId === lavoratoreId && m.tipo === tipo && data >= m.validoDal && data <= m.validoAl);
}

/** Due periodi di validità si sovrappongono? */
export function periodiSovrapposti(a: Pick<MonteOre, 'validoDal' | 'validoAl'>, b: Pick<MonteOre, 'validoDal' | 'validoAl'>): boolean {
  return a.validoDal <= b.validoAl && b.validoDal <= a.validoAl;
}
