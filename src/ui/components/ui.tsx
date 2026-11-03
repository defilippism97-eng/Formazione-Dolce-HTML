/**
 * Componenti di base dell'interfaccia. Accessibili (etichette, focus, ruoli ARIA)
 * e responsive. Gli stili sono in src/styles/app.css.
 */
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { INFO_STATI, type StatoRichiesta } from '../../domain';
import { Icona, type NomeIcona } from './Icona';

// ---------------------------------------------------------------------------
//  Pulsanti
// ---------------------------------------------------------------------------
export type VariantePulsante = 'primario' | 'secondario' | 'pericolo' | 'successo' | 'avviso' | 'testo';

export const Pulsante = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VariantePulsante; icona?: NomeIcona; inCorso?: boolean; piccolo?: boolean }
>(function Pulsante({ variante = 'primario', icona, inCorso, piccolo, children, className, disabled, ...resto }, rif) {
  return (
    <button
      type="button"
      ref={rif}
      className={`btn btn-${variante}${piccolo ? ' btn-piccolo' : ''}${className ? ` ${className}` : ''}`}
      {...resto}
      disabled={disabled || inCorso}
      aria-busy={inCorso || undefined}
    >
      {inCorso ? <span className="spinner" aria-hidden /> : icona && <Icona nome={icona} />}
      {children && <span>{children}</span>}
    </button>
  );
});

/** Pulsante solo icona, con etichetta accessibile e suggerimento. */
export function PulsanteIcona({ icona, etichetta, variante = 'testo', ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & { icona: NomeIcona; etichetta: string; variante?: VariantePulsante }) {
  return (
    <button type="button" className={`btn-icona btn-icona-${variante}`} aria-label={etichetta} title={etichetta} {...resto}>
      <Icona nome={icona} />
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Stato della richiesta
// ---------------------------------------------------------------------------
export function BadgeStato({ stato }: { stato: StatoRichiesta }) {
  const info = INFO_STATI[stato];
  return (
    <span className="badge-stato" style={{ color: info.colore, background: info.sfondo, borderColor: info.colore }} title={info.descrizione}>
      {stato}
    </span>
  );
}

export function Etichetta({ tono = 'neutro', children, titolo }: { tono?: 'neutro' | 'info' | 'successo' | 'avviso' | 'pericolo'; children: ReactNode; titolo?: string }) {
  return (
    <span className={`etichetta etichetta-${tono}`} title={titolo}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
//  Campi del modulo
// ---------------------------------------------------------------------------
interface PropsCampo {
  etichetta: string;
  errore?: string;
  aiuto?: ReactNode;
  obbligatorio?: boolean;
  className?: string;
}

function Involucro({ etichetta, errore, aiuto, obbligatorio, className, id, children }: PropsCampo & { id: string; children: ReactNode }) {
  return (
    <div className={`campo${errore ? ' campo-errore' : ''}${className ? ` ${className}` : ''}`}>
      <label className="campo-etichetta" htmlFor={id}>
        {etichetta}
        {obbligatorio && <span className="obbligatorio" aria-hidden> *</span>}
      </label>
      {children}
      {aiuto && !errore && (
        <span className="campo-aiuto" id={`${id}-aiuto`}>
          {aiuto}
        </span>
      )}
      {errore && (
        <span className="campo-messaggio-errore" id={`${id}-errore`} role="alert">
          {errore}
        </span>
      )}
    </div>
  );
}

function attributiAria(id: string, p: PropsCampo) {
  return {
    id,
    'aria-invalid': p.errore ? true : undefined,
    'aria-describedby': p.errore ? `${id}-errore` : p.aiuto ? `${id}-aiuto` : undefined,
    'aria-required': p.obbligatorio || undefined,
  };
}

export function CampoTesto({ etichetta, errore, aiuto, obbligatorio, className, ...input }: PropsCampo & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const p = { etichetta, errore, aiuto, obbligatorio, className };
  return (
    <Involucro {...p} id={id}>
      <input {...input} {...attributiAria(id, p)} />
    </Involucro>
  );
}

export function CampoArea({ etichetta, errore, aiuto, obbligatorio, className, ...area }: PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const p = { etichetta, errore, aiuto, obbligatorio, className };
  return (
    <Involucro {...p} id={id}>
      <textarea rows={3} maxLength={2000} {...area} {...attributiAria(id, p)} />
    </Involucro>
  );
}

export interface Opzione {
  valore: string;
  etichetta: string;
}

export function CampoSelezione({
  etichetta, errore, aiuto, obbligatorio, className, opzioni, vuota, ...select
}: PropsCampo & SelectHTMLAttributes<HTMLSelectElement> & { opzioni: Opzione[]; vuota?: string }) {
  const id = useId();
  const p = { etichetta, errore, aiuto, obbligatorio, className };
  return (
    <Involucro {...p} id={id}>
      <select {...select} {...attributiAria(id, p)}>
        {vuota !== undefined && <option value="">{vuota}</option>}
        {opzioni.map((o) => (
          <option key={o.valore} value={o.valore}>
            {o.etichetta}
          </option>
        ))}
      </select>
    </Involucro>
  );
}

/** Campo di sola lettura (dati che il lavoratore non può modificare). */
export function CampoLettura({ etichetta, valore, className }: { etichetta: string; valore: ReactNode; className?: string }) {
  return (
    <div className={`campo campo-lettura${className ? ` ${className}` : ''}`}>
      <span className="campo-etichetta">{etichetta}</span>
      <span className="campo-valore">{valore === undefined || valore === null || valore === '' ? '—' : valore}</span>
    </div>
  );
}

export function Casella({ etichetta, errore, ...input }: { etichetta: ReactNode; errore?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`casella${errore ? ' campo-errore' : ''}`}>
      <input type="checkbox" id={id} {...input} aria-invalid={errore ? true : undefined} aria-describedby={errore ? `${id}-e` : undefined} />
      <label htmlFor={id}>{etichetta}</label>
      {errore && (
        <span className="campo-messaggio-errore" id={`${id}-e`} role="alert">
          {errore}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Contenitori
// ---------------------------------------------------------------------------
export function Pagina({ titolo, sottotitolo, azioni, children, indietro }: { titolo: string; sottotitolo?: ReactNode; azioni?: ReactNode; children: ReactNode; indietro?: () => void }) {
  useEffect(() => {
    document.title = `${titolo} – Gestione ore formazione`;
  }, [titolo]);
  return (
    <section className="pagina" aria-labelledby="titolo-pagina">
      <header className="pagina-intestazione">
        <div>
          {indietro && (
            <button type="button" className="link-indietro" onClick={indietro}>
              <Icona nome="indietro" dimensione={16} /> Indietro
            </button>
          )}
          <h1 id="titolo-pagina" tabIndex={-1}>
            {titolo}
          </h1>
          {sottotitolo && <p className="pagina-sottotitolo">{sottotitolo}</p>}
        </div>
        {azioni && <div className="pagina-azioni">{azioni}</div>}
      </header>
      {children}
    </section>
  );
}

export function Scheda({ titolo, azioni, children, className, icona }: { titolo?: ReactNode; azioni?: ReactNode; children: ReactNode; className?: string; icona?: NomeIcona }) {
  return (
    <section className={`scheda${className ? ` ${className}` : ''}`}>
      {(titolo || azioni) && (
        <header className="scheda-intestazione">
          {titolo && (
            <h2>
              {icona && <Icona nome={icona} />} {titolo}
            </h2>
          )}
          {azioni && <div className="scheda-azioni">{azioni}</div>}
        </header>
      )}
      <div className="scheda-corpo">{children}</div>
    </section>
  );
}

export function Griglia({ colonne = 2, children }: { colonne?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return <div className={`griglia griglia-${colonne}`}>{children}</div>;
}

export function Avviso({ tono = 'info', titolo, children }: { tono?: 'info' | 'successo' | 'avviso' | 'pericolo'; titolo?: string; children: ReactNode }) {
  const icona: NomeIcona = tono === 'successo' ? 'approva' : tono === 'info' ? 'info' : 'avviso';
  return (
    <div className={`avviso avviso-${tono}`} role={tono === 'pericolo' ? 'alert' : 'note'}>
      <Icona nome={icona} />
      <div>
        {titolo && <strong className="avviso-titolo">{titolo}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Vuoto({ titolo, children, icona = 'info' }: { titolo: string; children?: ReactNode; icona?: NomeIcona }) {
  return (
    <div className="vuoto">
      <Icona nome={icona} dimensione={32} />
      <strong>{titolo}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Caricamento({ testo = 'Caricamento in corso…' }: { testo?: string }) {
  return (
    <div className="caricamento" role="status">
      <span className="spinner spinner-grande" aria-hidden />
      <span>{testo}</span>
    </div>
  );
}

export function ErroreCaricamento({ messaggio, onRiprova }: { messaggio: string; onRiprova?: () => void }) {
  return (
    <Avviso tono="pericolo" titolo="Impossibile caricare i dati">
      {messaggio}
      {onRiprova && (
        <div style={{ marginTop: 8 }}>
          <Pulsante variante="secondario" piccolo icona="aggiorna" onClick={onRiprova}>
            Riprova
          </Pulsante>
        </div>
      )}
    </Avviso>
  );
}

export function Indicatore({ etichetta, valore, nota, tono = 'neutro', onClick }: { etichetta: string; valore: ReactNode; nota?: ReactNode; tono?: 'neutro' | 'info' | 'successo' | 'avviso' | 'pericolo'; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`indicatore indicatore-${tono}${onClick ? ' indicatore-cliccabile' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="indicatore-valore">{valore}</span>
      <span className="indicatore-etichetta">{etichetta}</span>
      {nota && <span className="indicatore-nota">{nota}</span>}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Tabella responsive (su smartphone diventa un elenco di schede)
// ---------------------------------------------------------------------------
export interface Colonna<T> {
  titolo: string;
  valore: (riga: T) => ReactNode;
  /** Allineamento a destra (numeri). */
  numerica?: boolean;
  /** Nascosta su smartphone. */
  secondaria?: boolean;
}

export function Tabella<T>({
  righe, colonne, chiave, onApri, azioni, vuoto = 'Nessun elemento da mostrare.', selezione, didascalia,
}: {
  righe: T[];
  colonne: Colonna<T>[];
  chiave: (r: T) => string;
  onApri?: (r: T) => void;
  azioni?: (r: T) => ReactNode;
  vuoto?: string;
  selezione?: { selezionati: Set<string>; onCambia: (s: Set<string>) => void; selezionabile?: (r: T) => boolean };
  didascalia?: string;
}) {
  if (!righe.length) return <Vuoto titolo={vuoto} />;
  const selezionabili = selezione ? righe.filter((r) => selezione.selezionabile?.(r) ?? true) : [];
  const tutti = selezione && selezionabili.length > 0 && selezionabili.every((r) => selezione.selezionati.has(chiave(r)));
  const cambia = (id: string, si: boolean) => {
    if (!selezione) return;
    const s = new Set(selezione.selezionati);
    if (si) s.add(id);
    else s.delete(id);
    selezione.onCambia(s);
  };
  return (
    <div className="tabella-contenitore">
      <table className="tabella">
        {didascalia && <caption className="sr-only">{didascalia}</caption>}
        <thead>
          <tr>
            {selezione && (
              <th className="col-selezione">
                <input
                  type="checkbox"
                  aria-label="Seleziona tutte"
                  checked={!!tutti}
                  onChange={(e) => selezione.onCambia(e.target.checked ? new Set(selezionabili.map(chiave)) : new Set())}
                />
              </th>
            )}
            {colonne.map((c) => (
              <th key={c.titolo} className={`${c.numerica ? 'num' : ''}${c.secondaria ? ' secondaria' : ''}`} scope="col">
                {c.titolo}
              </th>
            ))}
            {azioni && (
              <th className="col-azioni" scope="col">
                <span className="sr-only">Azioni</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => {
            const id = chiave(r);
            return (
              <tr key={id} className={onApri ? 'riga-cliccabile' : undefined} onClick={onApri ? () => onApri(r) : undefined}>
                {selezione && (
                  <td className="col-selezione" onClick={(e) => e.stopPropagation()}>
                    {(selezione.selezionabile?.(r) ?? true) && (
                      <input type="checkbox" aria-label="Seleziona" checked={selezione.selezionati.has(id)} onChange={(e) => cambia(id, e.target.checked)} />
                    )}
                  </td>
                )}
                {colonne.map((c) => (
                  <td key={c.titolo} data-titolo={c.titolo} className={`${c.numerica ? 'num' : ''}${c.secondaria ? ' secondaria' : ''}`}>
                    {c.valore(r)}
                  </td>
                ))}
                {azioni && (
                  <td className="col-azioni" onClick={(e) => e.stopPropagation()}>
                    <div className="azioni-riga">{azioni(r)}</div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Barra dei filtri (si richiude su smartphone). */
export function BarraFiltri({ children, onAzzera, conteggio }: { children: ReactNode; onAzzera?: () => void; conteggio?: ReactNode }) {
  return (
    <details className="filtri" open>
      <summary>
        <Icona nome="filtro" /> Filtri {conteggio !== undefined && <span className="filtri-conteggio">{conteggio}</span>}
      </summary>
      <div className="filtri-corpo">
        {children}
        {onAzzera && (
          <div className="filtri-azioni">
            <Pulsante variante="testo" piccolo onClick={onAzzera}>
              Azzera filtri
            </Pulsante>
          </div>
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
//  Finestra di dialogo modale
// ---------------------------------------------------------------------------
export function Dialogo({ titolo, children, piede, onChiudi, largo }: { titolo: string; children: ReactNode; piede?: ReactNode; onChiudi: () => void; largo?: boolean }) {
  const rif = useRef<HTMLDivElement>(null);
  const idTitolo = useId();
  useEffect(() => {
    const precedente = document.activeElement as HTMLElement | null;
    const primo = rif.current?.querySelector<HTMLElement>('textarea, input, select, button:not(.dialogo-chiudi)');
    (primo ?? rif.current)?.focus();
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi();
      if (e.key === 'Tab' && rif.current) {
        const f = [...rif.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        const primoF = f[0];
        const ultimo = f[f.length - 1];
        if (!primoF || !ultimo) return;
        if (e.shiftKey && document.activeElement === primoF) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primoF.focus();
        }
      }
    };
    document.addEventListener('keydown', tasto);
    document.body.classList.add('modale-aperta');
    return () => {
      document.removeEventListener('keydown', tasto);
      document.body.classList.remove('modale-aperta');
      precedente?.focus?.();
    };
  }, [onChiudi]);
  return (
    <div className="dialogo-sfondo" onMouseDown={(e) => e.target === e.currentTarget && onChiudi()}>
      <div className={`dialogo${largo ? ' dialogo-largo' : ''}`} role="dialog" aria-modal="true" aria-labelledby={idTitolo} ref={rif} tabIndex={-1}>
        <header className="dialogo-intestazione">
          <h2 id={idTitolo}>{titolo}</h2>
          <button type="button" className="dialogo-chiudi" aria-label="Chiudi" onClick={onChiudi}>
            <Icona nome="chiudi" />
          </button>
        </header>
        <div className="dialogo-corpo">{children}</div>
        {piede && <footer className="dialogo-piede">{piede}</footer>}
      </div>
    </div>
  );
}

/** Schede orizzontali (tab) accessibili. */
export function Schede<T extends string>({ voci, attiva, onCambia }: { voci: { id: T; etichetta: string; conteggio?: number }[]; attiva: T; onCambia: (id: T) => void }) {
  return (
    <div className="tab" role="tablist">
      {voci.map((v) => (
        <button key={v.id} type="button" role="tab" aria-selected={v.id === attiva} className={v.id === attiva ? 'tab-attiva' : ''} onClick={() => onCambia(v.id)}>
          {v.etichetta}
          {v.conteggio !== undefined && <span className="tab-conteggio">{v.conteggio}</span>}
        </button>
      ))}
    </div>
  );
}
