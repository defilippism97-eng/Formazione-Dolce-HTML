/**
 * Contesti condivisi: backend, sessione, messaggi (toast) e finestre di conferma.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Backend } from '../data/api';
import { haRuolo, type Ruolo, type Sessione } from '../domain';
import { Dialogo, Pulsante } from './components/ui';

// ---------------------------------------------------------------------------
//  Backend e sessione
// ---------------------------------------------------------------------------
interface ContestoApp {
  backend: Backend;
  sessione: Sessione;
  /** Ricarica la sessione (es. dopo il completamento del profilo). */
  aggiornaSessione: () => Promise<void>;
  esci: () => Promise<void>;
  ha: (r: Ruolo) => boolean;
}

const Ctx = createContext<ContestoApp | null>(null);

export function ProviderApp(props: { backend: Backend; sessione: Sessione; onSessione: (s: Sessione | null) => void; children: ReactNode }) {
  const { backend, sessione, onSessione } = props;
  const valore = useMemo<ContestoApp>(
    () => ({
      backend,
      sessione,
      aggiornaSessione: async () => onSessione(await backend.sessioneCorrente()),
      esci: async () => {
        await backend.esci();
        onSessione(null);
      },
      ha: (r: Ruolo) => haRuolo(sessione, r),
    }),
    [backend, sessione, onSessione],
  );
  return <Ctx.Provider value={valore}>{props.children}</Ctx.Provider>;
}

export function useApp(): ContestoApp {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuori da ProviderApp');
  return c;
}

// ---------------------------------------------------------------------------
//  Messaggi (toast)
// ---------------------------------------------------------------------------
export type TipoMessaggio = 'successo' | 'errore' | 'avviso' | 'info';
interface Messaggio {
  id: number;
  tipo: TipoMessaggio;
  testo: string;
}
const CtxMessaggi = createContext<(tipo: TipoMessaggio, testo: string) => void>(() => undefined);

export function ProviderMessaggi({ children }: { children: ReactNode }) {
  const [elenco, setElenco] = useState<Messaggio[]>([]);
  const prossimo = useRef(1);
  const mostra = useCallback((tipo: TipoMessaggio, testo: string) => {
    const id = prossimo.current++;
    setElenco((e) => [...e.slice(-3), { id, tipo, testo }]);
    setTimeout(() => setElenco((e) => e.filter((m) => m.id !== id)), tipo === 'errore' ? 8000 : 4500);
  }, []);
  return (
    <CtxMessaggi.Provider value={mostra}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {elenco.map((m) => (
          <div key={m.id} className={`toast toast-${m.tipo}`}>
            <span>{m.testo}</span>
            <button type="button" className="toast-chiudi" aria-label="Chiudi messaggio" onClick={() => setElenco((e) => e.filter((x) => x.id !== m.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </CtxMessaggi.Provider>
  );
}

export function useMessaggi() {
  return useContext(CtxMessaggi);
}

// ---------------------------------------------------------------------------
//  Conferme
// ---------------------------------------------------------------------------
export interface RichiestaConferma {
  titolo: string;
  testo: ReactNode;
  etichettaConferma?: string;
  pericolo?: boolean;
  /** Se presente, chiede un testo (es. motivazione) e lo restituisce. */
  campoTesto?: { etichetta: string; obbligatorio?: boolean; minimo?: number };
}
type FunzioneConferma = (r: RichiestaConferma) => Promise<false | string>;
const CtxConferma = createContext<FunzioneConferma>(async () => false);

export function ProviderConferma({ children }: { children: ReactNode }) {
  const [corrente, setCorrente] = useState<(RichiestaConferma & { risolvi: (v: false | string) => void }) | null>(null);
  const [testo, setTesto] = useState('');
  const chiedi = useCallback<FunzioneConferma>(
    (r) =>
      new Promise((risolvi) => {
        setTesto('');
        setCorrente({ ...r, risolvi });
      }),
    [],
  );
  const chiudi = (v: false | string) => {
    corrente?.risolvi(v);
    setCorrente(null);
  };
  const minimo = corrente?.campoTesto?.minimo ?? (corrente?.campoTesto?.obbligatorio ? 1 : 0);
  const valido = !corrente?.campoTesto || testo.trim().length >= minimo;
  return (
    <CtxConferma.Provider value={chiedi}>
      {children}
      {corrente && (
        <Dialogo
          titolo={corrente.titolo}
          onChiudi={() => chiudi(false)}
          piede={
            <>
              <Pulsante variante="secondario" onClick={() => chiudi(false)}>
                Annulla
              </Pulsante>
              <Pulsante variante={corrente.pericolo ? 'pericolo' : 'primario'} disabled={!valido} onClick={() => chiudi(testo.trim() || 'ok')}>
                {corrente.etichettaConferma ?? 'Conferma'}
              </Pulsante>
            </>
          }
        >
          <div className="dialogo-testo">{corrente.testo}</div>
          {corrente.campoTesto && (
            <label className="campo">
              <span className="campo-etichetta">
                {corrente.campoTesto.etichetta}
                {corrente.campoTesto.obbligatorio && <span className="obbligatorio"> *</span>}
              </span>
              <textarea autoFocus rows={4} value={testo} onChange={(e) => setTesto(e.target.value)} maxLength={2000} />
              {minimo > 1 && <span className="campo-aiuto">Almeno {minimo} caratteri.</span>}
            </label>
          )}
        </Dialogo>
      )}
    </CtxConferma.Provider>
  );
}

export function useConferma() {
  return useContext(CtxConferma);
}
