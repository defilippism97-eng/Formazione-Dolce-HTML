/**
 * Elementi comuni alle sezioni dell'amministrazione.
 */
import { useMemo, useState } from 'react';
import type { Anagrafiche } from '../../../data/api';
import type { UtenteDirectory } from '../../../domain';
import { CampoSelezione, CampoTesto, type Opzione } from '../../components/ui';

/** Proprietà comuni delle sezioni: anagrafiche già caricate e funzione per ricaricarle. */
export interface PropsSezione {
  anagrafiche: Anagrafiche;
  ricarica: () => Promise<void>;
}

/** Testo vuoto -> undefined (i campi facoltativi non si salvano come stringhe vuote). */
export function vuotoInNullo(s: string | undefined | null): string | undefined {
  const t = (s ?? '').trim();
  return t === '' ? undefined : t;
}

export function opzioniUtenti(utenti: readonly UtenteDirectory[]): Opzione[] {
  return [...utenti]
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'))
    .map((u) => ({ valore: u.login, etichetta: `${u.cognome} ${u.nome}` }));
}

/**
 * Scelta di un utente della directory aziendale (Microsoft 365): campo di ricerca + elenco.
 * Restituisce due campi, da inserire in una griglia.
 */
export function SceltaUtente({
  etichetta,
  utenti,
  valore,
  onCambia,
  errore,
  obbligatorio,
  aiuto,
  etichettaUtente,
}: {
  etichetta: string;
  utenti: readonly UtenteDirectory[];
  valore: string;
  onCambia: (login: string) => void;
  errore?: string;
  obbligatorio?: boolean;
  aiuto?: string;
  /** Testo aggiuntivo per un utente (es. "già censito"). */
  etichettaUtente?: (u: UtenteDirectory) => string | undefined;
}) {
  const [cerca, setCerca] = useState('');
  const { opzioni, trovati } = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    const corrisponde = (u: UtenteDirectory) => !t || `${u.cognome} ${u.nome} ${u.nome} ${u.cognome} ${u.login}`.toLowerCase().includes(t);
    // l'utente già scelto resta sempre nell'elenco, anche se non corrisponde alla ricerca
    const elenco = [...utenti]
      .filter((u) => u.login === valore || corrisponde(u))
      .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'))
      .map((u) => {
        const extra = etichettaUtente?.(u);
        return { valore: u.login, etichetta: `${u.cognome} ${u.nome} – ${u.login}${extra ? ` (${extra})` : ''}` };
      });
    return { opzioni: elenco, trovati: utenti.filter(corrisponde).length };
  }, [utenti, cerca, valore, etichettaUtente]);
  return (
    <>
      <CampoTesto
        etichetta="Cerca nella directory"
        type="search"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        placeholder="Cognome, nome o login"
        autoComplete="off"
        aiuto={cerca ? `${trovati} ${trovati === 1 ? 'utente trovato' : 'utenti trovati'}` : 'Filtra l’elenco qui accanto'}
      />
      <CampoSelezione etichetta={etichetta} value={valore} onChange={(e) => onCambia(e.target.value)} vuota="Seleziona…" opzioni={opzioni} errore={errore} obbligatorio={obbligatorio} aiuto={aiuto} />
    </>
  );
}
