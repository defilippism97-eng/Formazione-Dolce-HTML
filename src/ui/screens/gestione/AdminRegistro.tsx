/**
 * Amministrazione › Registro modifiche: tutte le variazioni fatte da lavoratori, coordinatori,
 * HR, amministratori e dal sistema (ultime 1000 voci).
 */
import { useMemo, useState } from 'react';
import type { UtenteDirectory, VoceRegistro } from '../../../domain';
import { BarraFiltri, Caricamento, CampoSelezione, CampoTesto, ErroreCaricamento, Pulsante, Tabella } from '../../components/ui';
import { useApp } from '../../contesto';
import * as f from '../../format';
import { useCarica } from '../../hooks';
import { ROTTE } from '../../router';
import { nomeUtente, opzioniDistinte } from './comuni';

const ENTITA: VoceRegistro['entita'][] = ['Richiesta', 'Lavoratore', 'Struttura', 'Corso', 'Ruolo', 'Chiusura', 'Monte ore'];
const PAGINA = 100;

export function AdminRegistro({ utenti }: { utenti: readonly UtenteDirectory[] }) {
  const { backend } = useApp();
  const registro = useCarica(() => backend.getRegistro(), [backend]);
  const [entita, setEntita] = useState('');
  const [autore, setAutore] = useState('');
  const [testo, setTesto] = useState('');
  const [mostrate, setMostrate] = useState(PAGINA);

  const voci = useMemo(() => registro.dati ?? [], [registro.dati]);
  const autori = useMemo(() => opzioniDistinte(voci, (v) => v.autore, (v) => (v.autore === 'Sistema' ? 'Sistema' : nomeUtente(utenti, v.autore))), [voci, utenti]);
  const righe = useMemo(() => {
    const t = testo.trim().toLowerCase();
    return voci.filter(
      (v) =>
        (!entita || v.entita === entita) &&
        (!autore || v.autore === autore) &&
        (!t || [v.azione, v.campo, v.prima, v.dopo, v.nota, v.entitaId, v.autore].some((x) => x?.toLowerCase().includes(t))),
    );
  }, [voci, entita, autore, testo]);

  const filtro = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setMostrate(PAGINA);
  };

  return (
    <div className="pagina">
      <p className="testo-secondario" style={{ margin: 0 }}>
        Ogni variazione è registrata con data, autore e ruolo: decisioni e ore riconosciute (retribuite, gettone, non retribuite), correzioni dei corsi
        esterni, assegnazioni e modifiche dei monte ore dei permessi, anagrafiche e chiusure. I valori del codice fiscale non vengono mai scritti nel registro.
      </p>
      <BarraFiltri
        onAzzera={() => {
          setEntita('');
          setAutore('');
          setTesto('');
          setMostrate(PAGINA);
        }}
        conteggio={registro.dati ? `${righe.length} voci` : undefined}
      >
        <CampoSelezione etichetta="Entità" value={entita} onChange={(e) => filtro(setEntita)(e.target.value)} vuota="Tutte" opzioni={ENTITA.map((x) => ({ valore: x, etichetta: x }))} />
        <CampoSelezione etichetta="Autore" value={autore} onChange={(e) => filtro(setAutore)(e.target.value)} vuota="Tutti" opzioni={autori} />
        <CampoTesto etichetta="Cerca" type="search" value={testo} onChange={(e) => filtro(setTesto)(e.target.value)} placeholder="Azione, campo, valore, nota" />
      </BarraFiltri>

      {registro.errore && <ErroreCaricamento messaggio={registro.errore} onRiprova={registro.ricarica} />}
      {registro.caricamento && !registro.dati ? (
        <Caricamento />
      ) : (
        registro.dati && (
          <>
            <div className="gestione-tabella tabella-compatta">
              <Tabella
                didascalia="Registro delle modifiche"
                righe={righe.slice(0, mostrate)}
                chiave={(v) => v.id}
                vuoto="Nessuna voce corrisponde ai filtri."
                colonne={[
                  { titolo: 'Data', valore: (v) => <span style={{ whiteSpace: 'nowrap' }}>{f.dataOra(v.data)}</span> },
                  {
                    titolo: 'Autore',
                    valore: (v) => (
                      <span className="cella-blocco">
                        {v.autore === 'Sistema' ? 'Sistema' : nomeUtente(utenti, v.autore)}
                        <span className="cella-secondaria">{v.ruolo}</span>
                      </span>
                    ),
                  },
                  { titolo: 'Azione', valore: (v) => <span className="testo-a-capo">{v.azione}</span> },
                  {
                    titolo: 'Entità',
                    valore: (v) => (
                      <span className="cella-blocco">
                        {v.entita}
                        <span className="cella-secondaria">
                          {v.richiestaId ? <a href={`#${ROTTE.dettaglio(v.richiestaId)}`}>Apri la richiesta</a> : v.entitaId}
                        </span>
                      </span>
                    ),
                  },
                  { titolo: 'Campo', valore: (v) => v.campo ?? '—', secondaria: true },
                  {
                    titolo: 'Prima → dopo',
                    valore: (v) =>
                      v.prima !== undefined || v.dopo !== undefined ? (
                        <span className="cambio-valore testo-a-capo">
                          <del aria-label="prima">{v.prima || '(vuoto)'}</del> → <ins aria-label="dopo">{v.dopo || '(vuoto)'}</ins>
                        </span>
                      ) : (
                        '—'
                      ),
                  },
                  { titolo: 'Nota', valore: (v) => <span className="testo-a-capo">{v.nota ?? '—'}</span>, secondaria: true },
                ]}
              />
            </div>
            {righe.length > mostrate && (
              <div className="riga-flessibile" style={{ justifyContent: 'center' }}>
                <span className="testo-secondario testo-piccolo">
                  Mostrate {mostrate} di {righe.length}
                </span>
                <Pulsante variante="secondario" piccolo onClick={() => setMostrate((n) => n + PAGINA)}>
                  Mostra altre {Math.min(PAGINA, righe.length - mostrate)}
                </Pulsante>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
