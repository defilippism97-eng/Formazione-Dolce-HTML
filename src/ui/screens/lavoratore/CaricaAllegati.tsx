/**
 * Sezione "Allegati" del modulo: attestato e altra documentazione.
 * I file nuovi restano nel browser fino al salvataggio della richiesta.
 */
import { useId, useRef, useState, type DragEvent } from 'react';
import type { Allegato, TipoAllegato } from '../../../domain';
import { Icona } from '../../components/Icona';
import { Etichetta, Pulsante, PulsanteIcona } from '../../components/ui';
import * as f from '../../format';
import { apriInNuovaScheda, useAllegatiRichiesta } from './comuni';

export const MAX_ALLEGATI = 5;
export const MAX_BYTE_ALLEGATO = 10 * 1024 * 1024;
export const ESTENSIONI_AMMESSE = '.pdf,.jpg,.jpeg,.png,.heic';
const MIME_PER_ESTENSIONE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
};

export interface FileNuovo {
  chiave: string;
  tipo: TipoAllegato;
  file: File;
  mime: string;
}

let contatore = 0;

/** Controlla un file e ne ricava il tipo MIME (alcuni browser non lo indicano per i file HEIC). */
function controllaFile(file: File): { mime: string } | { errore: string } {
  const estensione = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeAtteso = MIME_PER_ESTENSIONE[estensione];
  if (!mimeAtteso) return { errore: `«${file.name}»: formato non ammesso. Puoi allegare PDF o immagini JPG, PNG, HEIC.` };
  if (file.size === 0) return { errore: `«${file.name}» è vuoto.` };
  if (file.size > MAX_BYTE_ALLEGATO) return { errore: `«${file.name}» pesa ${f.dimensioneFile(file.size)}: il massimo è 10 MB.` };
  const mime = Object.values(MIME_PER_ESTENSIONE).includes(file.type) ? file.type : mimeAtteso;
  return { mime };
}

export function SezioneAllegati({
  richiestaId,
  esistenti,
  rimossi,
  nuovi,
  onRimossi,
  onNuovi,
  errore,
}: {
  richiestaId?: string;
  esistenti: Allegato[];
  rimossi: string[];
  nuovi: FileNuovo[];
  onRimossi: (ids: string[]) => void;
  onNuovi: (n: FileNuovo[]) => void;
  /** Errore restituito dal server sugli allegati. */
  errore?: string;
}) {
  const totale = esistenti.filter((a) => !rimossi.includes(a.id)).length + nuovi.length;
  const comuni = { richiestaId, esistenti, rimossi, nuovi, onRimossi, onNuovi, disponibili: MAX_ALLEGATI - totale };
  return (
    <div className="allegati-modulo">
      <p className="testo-secondario testo-piccolo">
        Formati ammessi: PDF, JPG, PNG, HEIC (foto da smartphone) · massimo 10 MB per file · al massimo {MAX_ALLEGATI} file in tutto
        {totale > 0 && ` (ne hai ${totale})`}.
      </p>
      <div className="griglia griglia-2">
        <ZonaAllegati {...comuni} tipo="Attestato" titolo="Attestato rilasciato" descrizione="L’attestato di partecipazione rilasciato dall’ente (anche una foto leggibile)." />
        <ZonaAllegati {...comuni} tipo="Altra documentazione" titolo="Altra documentazione" descrizione="Ad esempio foglio firme, programma del corso o altra documentazione utile." />
      </div>
      {errore && (
        <span className="campo-messaggio-errore" role="alert">
          {errore}
        </span>
      )}
    </div>
  );
}

function ZonaAllegati({
  tipo,
  titolo,
  descrizione,
  richiestaId,
  esistenti,
  rimossi,
  nuovi,
  onRimossi,
  onNuovi,
  disponibili,
}: {
  tipo: TipoAllegato;
  titolo: string;
  descrizione: string;
  richiestaId?: string;
  esistenti: Allegato[];
  rimossi: string[];
  nuovi: FileNuovo[];
  onRimossi: (ids: string[]) => void;
  onNuovi: (n: FileNuovo[]) => void;
  disponibili: number;
}) {
  const id = useId();
  const rifInput = useRef<HTMLInputElement>(null);
  const [errori, setErrori] = useState<string[]>([]);
  const [trascina, setTrascina] = useState(false);
  const allegati = useAllegatiRichiesta();
  const miei = esistenti.filter((a) => a.tipo === tipo);
  const nuoviMiei = nuovi.filter((n) => n.tipo === tipo);

  const aggiungi = (lista: FileList | null) => {
    if (!lista?.length) return;
    const problemi: string[] = [];
    const accettati: FileNuovo[] = [];
    let posti = disponibili;
    for (const file of Array.from(lista)) {
      const esito = controllaFile(file);
      if ('errore' in esito) problemi.push(esito.errore);
      else if (posti <= 0) problemi.push(`«${file.name}» non aggiunto: puoi allegare al massimo ${MAX_ALLEGATI} file.`);
      else {
        accettati.push({ chiave: `nuovo-${++contatore}`, tipo, file, mime: esito.mime });
        posti--;
      }
    }
    setErrori(problemi);
    if (accettati.length) onNuovi([...nuovi, ...accettati]);
  };

  const rilascia = (e: DragEvent) => {
    e.preventDefault();
    setTrascina(false);
    aggiungi(e.dataTransfer.files);
  };

  const vuota = !miei.length && !nuoviMiei.length;
  return (
    <section
      className={`zona-file zona-allegati${trascina ? ' zona-allegati-attiva' : ''}`}
      aria-labelledby={`${id}-titolo`}
      onDragOver={(e) => {
        e.preventDefault();
        setTrascina(true);
      }}
      onDragLeave={() => setTrascina(false)}
      onDrop={rilascia}
    >
      <h4 id={`${id}-titolo`}>
        <Icona nome={tipo === 'Attestato' ? 'file' : 'allegato'} /> {titolo}
      </h4>
      <p className="testo-secondario testo-piccolo">{descrizione}</p>
      {!vuota && (
        <ul className="allegati" aria-label={`File: ${titolo}`}>
          {miei.map((a) => {
            const daRimuovere = rimossi.includes(a.id);
            return (
              <li key={a.id} className={`allegato${daRimuovere ? ' allegato-rimosso' : ''}`}>
                <Icona nome="file" />
                {daRimuovere ? (
                  <span className="allegato-nome">
                    <del>{a.nome}</del> <small>– verrà rimosso al salvataggio</small>
                  </span>
                ) : (
                  <button type="button" className="allegato-nome link-file" disabled={!richiestaId || allegati.inCorso === a.id} onClick={() => richiestaId && void allegati.apri(richiestaId, a)} title={`Apri ${a.nome}`} aria-label={`Apri ${a.nome}`}>
                    {a.nome}
                  </button>
                )}
                <small className="testo-secondario nascosto-mobile">{f.dimensioneFile(a.dimensione)}</small>
                {daRimuovere ? (
                  <Pulsante variante="testo" piccolo icona="aggiorna" onClick={() => onRimossi(rimossi.filter((x) => x !== a.id))}>
                    Ripristina
                  </Pulsante>
                ) : (
                  <PulsanteIcona icona="annulla" variante="pericolo" etichetta={`Rimuovi ${a.nome}`} onClick={() => onRimossi([...rimossi, a.id])} />
                )}
              </li>
            );
          })}
          {nuoviMiei.map((n) => (
            <li key={n.chiave} className="allegato">
              <Icona nome="file" />
              <button type="button" className="allegato-nome link-file" onClick={() => apriInNuovaScheda(n.file.name, n.file)} title={`Apri ${n.file.name}`} aria-label={`Apri ${n.file.name}`}>
                {n.file.name}
              </button>
              <Etichetta tono="info" titolo="Il file verrà caricato al salvataggio della richiesta">
                Da caricare
              </Etichetta>
              <small className="testo-secondario nascosto-mobile">{f.dimensioneFile(n.file.size)}</small>
              <PulsanteIcona icona="annulla" variante="pericolo" etichetta={`Rimuovi ${n.file.name}`} onClick={() => onNuovi(nuovi.filter((x) => x.chiave !== n.chiave))} />
            </li>
          ))}
        </ul>
      )}
      <input
        ref={rifInput}
        id={`${id}-input`}
        type="file"
        accept={ESTENSIONI_AMMESSE}
        multiple
        aria-label={`Aggiungi file: ${titolo}`}
        onChange={(e) => {
          aggiungi(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="zona-allegati-azioni">
        <Pulsante variante="secondario" piccolo icona="allegato" disabled={disponibili <= 0} onClick={() => rifInput.current?.click()} aria-describedby={`${id}-titolo`}>
          {vuota ? 'Scegli file' : 'Aggiungi file'}
        </Pulsante>
        <span className="testo-secondario testo-piccolo nascosto-mobile">oppure trascinali qui</span>
      </div>
      {errori.length > 0 && (
        <div className="campo-messaggio-errore" role="alert">
          {errori.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
    </section>
  );
}
