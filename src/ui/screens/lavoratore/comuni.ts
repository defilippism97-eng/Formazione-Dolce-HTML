/**
 * Funzioni di supporto condivise dalle schermate Profilo, Modulo richiesta, Dettaglio e Posta.
 */
import { useCallback, useState } from 'react';
import type { Allegato, ChiusuraMensile, Richiesta } from '../../../domain';
import { useApp, useMessaggi } from '../../contesto';
import { scaricaFile } from '../../format';
import { messaggioErrore } from '../../hooks';

/** Mese di competenza chiuso da HR. */
export function isMeseChiuso(chiusure: readonly ChiusuraMensile[], anno: number, mese: number): boolean {
  return chiusure.some((c) => c.anno === anno && c.mese === mese && c.stato === 'Chiuso');
}

/** Numero in formato italiano per i campi di testo (es. 2.5 -> "2,5"). */
export function testoNumero(n: number | undefined | null): string {
  return n === undefined || n === null || !Number.isFinite(n) ? '' : String(n).replace('.', ',');
}

/**
 * Va a un percorso SOSTITUENDO la voce corrente della cronologia: dopo l'invio di un modulo
 * il pulsante "Indietro" del browser non deve riportare al modulo già inviato.
 */
export function sostituisciPercorso(percorso: string): void {
  window.location.replace(`#${percorso}`);
}

/** Torna alla schermata precedente; se la pagina è stata aperta direttamente usa `alternativa`. */
export function tornaIndietro(alternativa: string): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = alternativa;
}

/**
 * Apre un file in una nuova scheda; se il browser blocca la finestra, lo scarica.
 * Nota: non si passa "noopener" a window.open perché in quel caso restituisce sempre null
 * e non si potrebbe capire se la scheda è stata bloccata.
 */
export function apriInNuovaScheda(nome: string, contenuto: Blob): void {
  const url = URL.createObjectURL(contenuto);
  const finestra = window.open(url, '_blank');
  if (finestra) finestra.opener = null;
  else scaricaFile(nome, contenuto);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Apertura e scaricamento degli allegati di una richiesta (con messaggi di errore). */
export function useAllegatiRichiesta() {
  const { backend } = useApp();
  const mostra = useMessaggi();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const esegui = useCallback(
    async (richiestaId: string, a: Allegato, modo: 'apri' | 'scarica') => {
      setInCorso(a.id);
      try {
        const file = await backend.scaricaAllegato(richiestaId, a.id);
        // il tipo serve al browser per mostrare il PDF o l'immagine invece di scaricarli
        const blob = file.contenuto.type ? file.contenuto : new Blob([file.contenuto], { type: file.mime || a.mime });
        if (modo === 'apri') apriInNuovaScheda(file.nome, blob);
        else scaricaFile(file.nome, blob);
      } catch (e) {
        mostra('errore', messaggioErrore(e));
      } finally {
        setInCorso(null);
      }
    },
    [backend, mostra],
  );
  return {
    apri: (richiestaId: string, a: Allegato) => esegui(richiestaId, a, 'apri'),
    scarica: (richiestaId: string, a: Allegato) => esegui(richiestaId, a, 'scarica'),
    inCorso,
  };
}

/** Sposta il fuoco sul primo campo con errore (dopo il rendering dei messaggi). */
export function focusPrimoErrore(contenitore: HTMLElement | null, riserva?: HTMLElement | null): void {
  setTimeout(() => {
    const campo = contenitore?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const bersaglio = campo ?? riserva;
    if (!bersaglio) return;
    bersaglio.focus({ preventScroll: true });
    bersaglio.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 40);
}

/** Etichette leggibili dei campi registrati nello storico delle modifiche. */
export const ETICHETTE_CAMPI: Record<string, string> = {
  dataSessione: 'Data sessione',
  oraInizioSessione: 'Ora inizio sessione',
  oraFineSessione: 'Ora fine sessione',
  durataSessione: 'Durata sessione',
  oraIngresso: 'Ora ingresso',
  oraUscita: 'Ora uscita',
  oreFrequentate: 'Ore frequentate',
  oreRetribuiteRichieste: 'Ore retribuite richieste',
  oreGettoneRichieste: 'Ore a gettone richieste',
  oreNonRetribuiteRichieste: 'Ore da non retribuire richieste',
  tipologia: 'Tipologia',
  descrizioneAttivita: 'Attività del permesso',
  monteOreId: 'Monte ore',
  pausaPrevista: 'Pausa prevista',
  pausaMinuti: 'Durata della pausa (minuti)',
  pausaInPresenza: 'Presente a cavallo della pausa',
  noteLavoratore: 'Note del lavoratore',
  corsoId: 'Corso',
  codiceCorso: 'Codice corso',
  titoloCorso: 'Titolo corso',
  titoloCorsoLibero: 'Titolo corso',
  durataCorso: 'Durata del corso',
  ente: 'Ente erogatore',
  modalita: 'Modalità',
  piuGiornate: 'Più giornate',
  meseCompetenza: 'Mese di competenza',
  annoCompetenza: 'Anno di competenza',
  emailContatto: 'E-mail di contatto',
};
