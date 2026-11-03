/**
 * Ricerca e scelta di un corso del catalogo aziendale (i titoli non sono modificabili).
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Corso } from '../../../domain';
import { Icona } from '../../components/Icona';
import * as f from '../../format';

/** Testo normalizzato per la ricerca (minuscolo, senza accenti). */
function normalizza(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function filtraCatalogo(catalogo: Corso[], testo: string): Corso[] {
  const parole = normalizza(testo).split(/\s+/).filter(Boolean);
  if (!parole.length) return catalogo;
  return catalogo.filter((c) => {
    const t = normalizza(`${c.titolo} ${c.codice} ${c.tipologia ?? ''} ${c.modalita}`);
    return parole.every((p) => t.includes(p));
  });
}

export function SelettoreCorso({
  catalogo,
  valore,
  onCambia,
  errore,
  titoloPrecedente,
}: {
  catalogo: Corso[];
  valore: string;
  onCambia: (id: string) => void;
  errore?: string;
  /** Titolo del corso della richiesta, se non è più a catalogo. */
  titoloPrecedente?: string;
}) {
  const id = useId();
  const [testo, setTesto] = useState('');
  const rifRicerca = useRef<HTMLInputElement>(null);
  const rifCambia = useRef<HTMLButtonElement>(null);
  const rifElenco = useRef<HTMLUListElement>(null);
  /** Dove spostare il fuoco dopo la scelta (gli elementi cambiano: senza, il fuoco si perde). */
  const fuoco = useRef<'cambia' | 'ricerca' | null>(null);
  const scelto = catalogo.find((c) => c.id === valore);
  const risultati = useMemo(() => filtraCatalogo(catalogo, testo), [catalogo, testo]);

  useEffect(() => {
    if (fuoco.current === 'cambia') rifCambia.current?.focus();
    if (fuoco.current === 'ricerca') rifRicerca.current?.focus();
    fuoco.current = null;
  }, [valore]);

  const scegli = (c: Corso) => {
    fuoco.current = 'cambia';
    onCambia(c.id);
  };

  if (scelto) {
    return (
      <div className="campo">
        <span className="campo-etichetta">Titolo del corso (catalogo)</span>
        <div className="corso-scelto">
          <Icona nome="approva" />
          <div>
            <strong>{scelto.titolo}</strong>
            <small>
              {scelto.codice}
              {scelto.tipologia ? ` · ${scelto.tipologia}` : ''}
            </small>
          </div>
          {/* pulsante semplice (non <Pulsante>) perché serve il riferimento per il fuoco */}
          <button
            ref={rifCambia}
            type="button"
            className="btn btn-secondario btn-piccolo"
            onClick={() => {
              fuoco.current = 'ricerca';
              onCambia('');
            }}
          >
            <Icona nome="cerca" />
            <span>Cambia corso</span>
          </button>
        </div>
      </div>
    );
  }

  const tastiRicerca = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      rifElenco.current?.querySelector('button')?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const primo = risultati[0];
      if (primo && testo.trim()) scegli(primo);
    }
  };
  const tastiElenco = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const pulsanti = [...(rifElenco.current?.querySelectorAll('button') ?? [])];
    const i = pulsanti.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowUp' && i <= 0) rifRicerca.current?.focus();
    else pulsanti[Math.min(pulsanti.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))]?.focus();
  };

  return (
    <div className={`campo selettore-corso${errore ? ' campo-errore' : ''}`}>
      <label className="campo-etichetta" htmlFor={id}>
        Titolo del corso (catalogo)<span className="obbligatorio" aria-hidden> *</span>
      </label>
      {titoloPrecedente && (
        <span className="campo-aiuto">
          Il corso indicato in precedenza («{titoloPrecedente}») non è più disponibile a catalogo: scegline un altro.
        </span>
      )}
      <div className="selettore-corso-ricerca">
        <Icona nome="cerca" />
        <input
          ref={rifRicerca}
          id={id}
          type="search"
          autoComplete="off"
          placeholder="Cerca per titolo, codice o argomento…"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={tastiRicerca}
          aria-controls={`${id}-elenco`}
          aria-describedby={`${id}-conteggio${errore ? ` ${id}-errore` : ''}`}
          aria-invalid={errore ? true : undefined}
          aria-required
          data-campo="corsoId"
        />
      </div>
      <span id={`${id}-conteggio`} className="campo-aiuto" aria-live="polite">
        {risultati.length === catalogo.length
          ? `${catalogo.length} corsi a catalogo: scrivi per filtrare, poi scegli il corso.`
          : `${risultati.length} ${risultati.length === 1 ? 'corso trovato' : 'corsi trovati'}.`}
      </span>
      {risultati.length > 0 ? (
        <ul id={`${id}-elenco`} ref={rifElenco} className="selettore-corso-elenco" aria-label="Corsi a catalogo" onKeyDown={tastiElenco}>
          {risultati.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => scegli(c)}>
                <strong>{c.titolo}</strong>
                <small>
                  {c.codice} · {c.modalita} · {f.ore(c.durataOre)}
                  {c.gettonePrevisto ? ' · gettone previsto' : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="selettore-corso-vuoto">Nessun corso a catalogo corrisponde alla ricerca. Se il corso è stato organizzato da un altro ente, scegli «Committente o altro soggetto».</p>
      )}
      {errore && (
        <span className="campo-messaggio-errore" id={`${id}-errore`} role="alert">
          {errore}
        </span>
      )}
    </div>
  );
}
