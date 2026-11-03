/** Hook per caricare dati ed eseguire azioni con gestione uniforme di errori e messaggi. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroreApi } from '../data/api';
import type { ErroreValidazione } from '../domain';
import { useMessaggi } from './contesto';

export interface StatoCaricamento<T> {
  dati: T | undefined;
  errore: string | null;
  caricamento: boolean;
  ricarica: () => Promise<void>;
}

/** Carica dati asincroni; si ripete quando cambiano le dipendenze. */
export function useCarica<T>(funzione: () => Promise<T>, dipendenze: unknown[] = []): StatoCaricamento<T> {
  const [dati, setDati] = useState<T>();
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const ultima = useRef(0);
  const ricarica = useCallback(async () => {
    const id = ++ultima.current;
    setCaricamento(true);
    setErrore(null);
    try {
      const r = await funzione();
      if (id === ultima.current) setDati(r);
    } catch (e) {
      if (id === ultima.current) setErrore(messaggioErrore(e));
    } finally {
      if (id === ultima.current) setCaricamento(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dipendenze);
  useEffect(() => {
    void ricarica();
  }, [ricarica]);
  return { dati, errore, caricamento, ricarica };
}

export function messaggioErrore(e: unknown): string {
  if (e instanceof ErroreApi) return e.message;
  console.error(e);
  return 'Si è verificato un errore imprevisto. Riprova; se il problema persiste contatta l’Ufficio HR/Formazione.';
}

/** Esegue un'azione mostrando messaggi di successo/errore; restituisce il risultato o undefined. */
export function useAzione() {
  const mostra = useMessaggi();
  const [inCorso, setInCorso] = useState(false);
  const [erroriCampi, setErroriCampi] = useState<ErroreValidazione[]>([]);
  const esegui = useCallback(
    async <T,>(azione: () => Promise<T>, successo?: string | ((r: T) => string)): Promise<T | undefined> => {
      setInCorso(true);
      setErroriCampi([]);
      try {
        const r = await azione();
        if (successo) mostra('successo', typeof successo === 'function' ? successo(r) : successo);
        return r;
      } catch (e) {
        if (e instanceof ErroreApi && e.dettagli.length) setErroriCampi(e.dettagli);
        if (!(e instanceof ErroreApi && e.richiestaConferma)) mostra('errore', messaggioErrore(e));
        throw e;
      } finally {
        setInCorso(false);
      }
    },
    [mostra],
  );
  /** Come `esegui` ma non rilancia l'errore (già mostrato all'utente). */
  const prova = useCallback(
    async <T,>(azione: () => Promise<T>, successo?: string | ((r: T) => string)): Promise<T | undefined> => {
      try {
        return await esegui(azione, successo);
      } catch {
        return undefined;
      }
    },
    [esegui],
  );
  const erroreDi = useCallback((campo: string) => erroriCampi.find((e) => e.campo === campo)?.messaggio, [erroriCampi]);
  return { esegui, prova, inCorso, erroriCampi, setErroriCampi, erroreDi };
}
