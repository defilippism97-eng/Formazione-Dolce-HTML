/**
 * Posta: le notifiche e-mail inviate dall'app all'utente collegato.
 * In modalità DEMO è una "posta simulata": mostra le e-mail che i flussi F1–F6
 * invierebbero, senza spedire nulla.
 */
import '../../styles/lavoratore.css';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { Notifica } from '../../domain';
import { Icona } from '../components/Icona';
import { Avviso, CampoSelezione, CampoTesto, Caricamento, ErroreCaricamento, Etichetta, Pagina, Pulsante, Vuoto } from '../components/ui';
import { useApp } from '../contesto';
import * as f from '../format';
import { useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';

export const MITTENTE = 'Gestione ore formazione <noreply@societadolce.it>';

type Flusso = Notifica['flusso'];

export const DESCRIZIONE_FLUSSO: Record<Flusso, string> = {
  F1: 'Invio al coordinatore',
  F2: 'Esito del coordinatore',
  F3: 'Validazione HR',
  F4: 'Promemoria',
  F5: 'Riepilogo mensile',
  F6: 'Esportazione payroll',
  Sistema: 'Messaggio di sistema',
};

export function Posta() {
  const { backend } = useApp();
  const demo = backend.modalita === 'demo';
  const dati = useCarica(() => backend.getNotifiche(), [backend]);
  const [flusso, setFlusso] = useState<'' | Flusso>('');
  const [cerca, setCerca] = useState('');
  const [selezionata, setSelezionata] = useState<string | null>(null);
  const rifElenco = useRef<HTMLDivElement>(null);
  const rifMessaggio = useRef<HTMLElement>(null);

  const tutte = useMemo(() => [...(dati.dati ?? [])].sort((a, b) => b.data.localeCompare(a.data)), [dati.dati]);
  const presenti = useMemo(() => (Object.keys(DESCRIZIONE_FLUSSO) as Flusso[]).filter((fl) => tutte.some((n) => n.flusso === fl)), [tutte]);
  const elenco = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    return tutte.filter((n) => (!flusso || n.flusso === flusso) && (!t || `${n.oggetto}\n${n.testo}`.toLowerCase().includes(t)));
  }, [tutte, flusso, cerca]);
  const corrente = elenco.find((n) => n.id === selezionata) ?? elenco[0];

  // se il filtro esclude il messaggio aperto, si apre il primo dell'elenco
  useEffect(() => {
    if (corrente && corrente.id !== selezionata) setSelezionata(corrente.id);
  }, [corrente, selezionata]);

  const apri = (n: Notifica, daTastiera = false) => {
    setSelezionata(n.id);
    // su smartphone elenco e messaggio sono uno sotto l'altro: porto in vista il messaggio
    if (!daTastiera && window.matchMedia('(max-width: 760px)').matches) {
      setTimeout(() => rifMessaggio.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
    }
  };

  /** Frecce su/giù per scorrere i messaggi dell'elenco. */
  const tasti = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = elenco.findIndex((n) => n.id === corrente?.id);
    const prossimo = elenco[Math.max(0, Math.min(elenco.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!prossimo) return;
    apri(prossimo, true);
    setTimeout(() => rifElenco.current?.querySelector<HTMLButtonElement>(`[data-id="${prossimo.id}"]`)?.focus(), 0);
  };

  return (
    <Pagina
      titolo={demo ? 'Posta (simulata)' : 'Notifiche'}
      sottotitolo={demo ? 'Le e-mail che l’app invierebbe a te.' : 'Le notifiche e-mail che l’app ti ha inviato.'}
      azioni={
        <Pulsante variante="secondario" icona="aggiorna" inCorso={dati.caricamento && !!dati.dati} onClick={() => void dati.ricarica()}>
          Aggiorna
        </Pulsante>
      }
    >
      {demo && (
        <Avviso tono="info" titolo="Modalità DEMO: nessuna e-mail viene inviata davvero">
          Qui trovi le e-mail che il sistema invierebbe al tuo indirizzo (casella aziendale o e-mail di contatto) nei flussi F1–F6: invio al coordinatore,
          esiti, validazione HR, promemoria, riepilogo mensile e file paghe. Prova ad inviare o approvare una richiesta e torna qui.
        </Avviso>
      )}
      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {!dati.dati ? (
        !dati.errore && <Caricamento testo="Caricamento dei messaggi…" />
      ) : tutte.length === 0 ? (
        <Vuoto titolo="Nessun messaggio" icona="posta">
          Quando una tua richiesta cambia stato o c’è qualcosa da fare, riceverai qui un avviso.
        </Vuoto>
      ) : (
        <>
          <div className="posta-filtri">
            <CampoSelezione
              etichetta="Flusso"
              value={flusso}
              onChange={(e) => setFlusso(e.target.value as '' | Flusso)}
              vuota="Tutti i flussi"
              opzioni={presenti.map((fl) => ({ valore: fl, etichetta: `${fl === 'Sistema' ? '' : `${fl} – `}${DESCRIZIONE_FLUSSO[fl]}` }))}
            />
            <CampoTesto etichetta="Cerca" type="search" placeholder="Oggetto, numero richiesta, nome…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
            <p className="posta-conteggio testo-secondario testo-piccolo" aria-live="polite">
              {elenco.length === tutte.length ? `${tutte.length} messaggi` : `${elenco.length} di ${tutte.length} messaggi`}
            </p>
          </div>
          {elenco.length === 0 ? (
            <Vuoto titolo="Nessun messaggio corrisponde ai filtri" icona="filtro">
              <Pulsante
                variante="testo"
                piccolo
                onClick={() => {
                  setFlusso('');
                  setCerca('');
                }}
              >
                Azzera i filtri
              </Pulsante>
            </Vuoto>
          ) : (
            <div className="posta">
              <div className="posta-elenco" ref={rifElenco} role="list" aria-label="Messaggi" onKeyDown={tasti}>
                {elenco.map((n) => (
                  <div role="listitem" key={n.id}>
                    <button type="button" data-id={n.id} aria-current={n.id === corrente?.id ? 'true' : undefined} onClick={() => apri(n)}>
                      <span className="posta-voce-testata">
                        <Etichetta tono={n.flusso === 'F4' || n.flusso === 'Sistema' ? 'avviso' : 'info'} titolo={DESCRIZIONE_FLUSSO[n.flusso]}>
                          {n.flusso}
                        </Etichetta>
                        <small>{f.dataOra(n.data)}</small>
                      </span>
                      <span className="posta-voce-oggetto">{n.oggetto}</span>
                    </button>
                  </div>
                ))}
              </div>
              {corrente && <Messaggio n={corrente} rif={rifMessaggio} />}
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}

function Messaggio({ n, rif }: { n: Notifica; rif: RefObject<HTMLElement> }) {
  return (
    <article className="posta-messaggio" ref={rif} aria-labelledby={`oggetto-${n.id}`} tabIndex={-1}>
      <header className="posta-testata">
        <h2 id={`oggetto-${n.id}`}>{n.oggetto}</h2>
        <dl>
          <div>
            <dt>Da</dt>
            <dd>{MITTENTE}</dd>
          </div>
          <div>
            <dt>A</dt>
            <dd>{n.destinatari.join(', ')}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{f.dataOra(n.data)}</dd>
          </div>
          <div>
            <dt>Flusso</dt>
            <dd>
              {n.flusso === 'Sistema' ? DESCRIZIONE_FLUSSO.Sistema : `${n.flusso} – ${DESCRIZIONE_FLUSSO[n.flusso]}`}
            </dd>
          </div>
        </dl>
      </header>
      <div className="posta-corpo">{n.testo}</div>
      {n.richiestaId && (
        <div className="posta-azioni">
          <Pulsante icona="visualizza" onClick={() => naviga(ROTTE.dettaglio(n.richiestaId!))}>
            Apri la richiesta
          </Pulsante>
          <span className="testo-secondario testo-piccolo">
            <Icona nome="lucchetto" dimensione={14} /> Il collegamento richiede l’accesso all’app.
          </span>
        </div>
      )}
    </article>
  );
}
