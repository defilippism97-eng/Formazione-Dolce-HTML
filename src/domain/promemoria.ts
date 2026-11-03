/**
 * Flusso 4 – Promemoria: dopo 3 e 5 giorni lavorativi senza approvazione promemoria
 * al coordinatore; dopo 7 segnalazione anche a HR.
 */
import { dataRomaDaIstante, giorniLavorativiTrascorsi } from './calcoli';
import type { DataISO, Richiesta } from './types';

export const SOGLIE_PROMEMORIA = [3, 5] as const;
export const SOGLIA_SEGNALAZIONE_HR = 7;

export interface EsitoPromemoria {
  giorni: number;
  /** Soglie di promemoria raggiunte e non ancora inviate. */
  promemoria: number[];
  segnalaHR: boolean;
}

export function valutaPromemoria(r: Richiesta, oggi: DataISO, patroni: string[] = []): EsitoPromemoria {
  if (r.stato !== 'In attesa del coordinatore' || !r.inviatoIl) return { giorni: 0, promemoria: [], segnalaHR: false };
  const giorni = giorniLavorativiTrascorsi(dataRomaDaIstante(r.inviatoIl), oggi, patroni);
  return {
    giorni,
    promemoria: SOGLIE_PROMEMORIA.filter((s) => giorni >= s && !r.promemoriaInviati.includes(s)),
    segnalaHR: giorni >= SOGLIA_SEGNALAZIONE_HR && !r.segnalataHR,
  };
}
