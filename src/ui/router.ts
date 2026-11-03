/**
 * Router minimale basato sull'hash (#/percorso): funziona anche aprendo il file
 * localmente e su qualsiasi hosting statico, senza configurazioni del server.
 */
import { useEffect, useState } from 'react';

export const ROTTE = {
  home: '/home',
  profilo: '/profilo',
  mieRichieste: '/richieste',
  nuovaRichiesta: '/richieste/nuova',
  modificaRichiesta: (id: string) => `/richieste/${encodeURIComponent(id)}/modifica`,
  dettaglio: (id: string) => `/richiesta/${encodeURIComponent(id)}`,
  team: '/team',
  validazione: '/validazione',
  riepilogo: '/riepilogo',
  chiusura: '/chiusura',
  amministrazione: (sezione = 'lavoratori') => `/amministrazione/${sezione}`,
  posta: '/posta',
} as const;

export function percorsoCorrente(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h.split('?')[0] ?? '/' : '/';
}

/** Parametri dopo il "?" nell'hash, es. #/richieste?gruppo=approvata */
export function parametriQuery(): URLSearchParams {
  const h = window.location.hash;
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}

export function naviga(percorso: string): void {
  if (window.location.hash.replace(/^#/, '') === percorso) return;
  window.location.hash = percorso;
}

export function usePercorso(): string {
  const [p, setP] = useState(percorsoCorrente);
  useEffect(() => {
    const aggiorna = () => {
      setP(percorsoCorrente());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', aggiorna);
    return () => window.removeEventListener('hashchange', aggiorna);
  }, []);
  return p;
}

/** Confronta un percorso con uno schema tipo `/richiesta/:id` e restituisce i parametri. */
export function corrisponde(percorso: string, schema: string): Record<string, string> | null {
  const a = percorso.split('/').filter(Boolean);
  const b = schema.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const parametri: Record<string, string> = {};
  for (let i = 0; i < b.length; i++) {
    const s = b[i]!;
    const v = a[i]!;
    if (s.startsWith(':')) parametri[s.slice(1)] = decodeURIComponent(v);
    else if (s !== v) return null;
  }
  return parametri;
}
