/**
 * Riga di controllo della ripartizione delle ore: quante ore sono state ripartite tra le voci
 * (retribuite, a gettone, da non retribuire) e quante ne mancano o avanzano rispetto alle ore
 * frequentate. La somma deve essere UGUALE alle ore frequentate.
 */
import type { ReactNode } from 'react';
import { arrotonda2 } from '../../../domain';
import * as f from '../../format';
import { numeroCampo } from './statoModulo';

export type StatoRipartizione = 'ok' | 'mancano' | 'avanzano';

/** Testo della scorciatoia che sposta le ore mancanti in una voce, es. "Metti le 0,5 ore mancanti". */
export function oreMancanti(diff: number): string {
  return diff === 1 ? 'Metti l’ora mancante' : `Metti le ${f.numero(diff)} ore mancanti`;
}

export function Ripartizione({
  valori,
  frequentate,
  senzaOrari = 'Indica gli orari: qui vedrai quante ore restano da ripartire.',
  azioni,
}: {
  /** Testi digitati nei campi delle ore (vuoto = 0). */
  valori: string[];
  frequentate: number | null;
  /** Testo mostrato finché le ore frequentate non sono calcolabili. */
  senzaOrari?: string;
  /** Scorciatoie mostrate quando mancano ore (`diff` = ore mancanti, `vuoti` = nessun campo compilato). */
  azioni?: (diff: number, vuoti: boolean) => ReactNode;
}) {
  if (frequentate === null || frequentate <= 0) {
    return (
      <p className="ripartizione" aria-live="polite">
        {senzaOrari}
      </p>
    );
  }
  const totale = arrotonda2(valori.reduce((t, v) => t + numeroCampo(v), 0));
  if (!Number.isFinite(totale)) {
    return (
      <p className="ripartizione ripartizione-avanzano" aria-live="polite">
        Controlla le ore inserite: uno dei valori non è un numero.
      </p>
    );
  }
  const diff = arrotonda2(frequentate - totale);
  const stato: StatoRipartizione = Math.abs(diff) < 0.005 ? 'ok' : diff > 0 ? 'mancano' : 'avanzano';
  const scorciatoie = stato === 'mancano' && azioni ? azioni(diff, valori.every((v) => !v.trim())) : null;
  return (
    <div className={`ripartizione ripartizione-${stato}`}>
      <p aria-live="polite">
        Ripartite <strong>{f.numero(totale)}</strong> di <strong>{f.numero(frequentate)}</strong> ore frequentate
        {stato === 'ok' && ' – tutte le ore sono ripartite.'}
        {stato === 'mancano' && (
          <>
            {' '}
            – {diff === 1 ? 'ne manca' : 'ne mancano'} <strong>{f.numero(diff)}</strong>.
          </>
        )}
        {stato === 'avanzano' && (
          <>
            {' '}
            – {diff === -1 ? 'ne avanza' : 'ne avanzano'} <strong>{f.numero(-diff)}</strong>: riduci le ore indicate.
          </>
        )}
      </p>
      {scorciatoie && <div className="ripartizione-azioni">{scorciatoie}</div>}
    </div>
  );
}
