/**
 * Amministrazione › Catalogo corsi: corsi aziendali e validazione dei corsi esterni
 * inseriti dai lavoratori (che possono essere aggiunti al catalogo aziendale).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ENTI,
  MODALITA,
  type Corso,
  type EnteErogatore,
  type Modalita,
  type OrigineCorso,
  type StatoValidazioneCorso,
} from '../../../domain';
import {
  Avviso,
  BarraFiltri,
  CampoArea,
  CampoLettura,
  CampoSelezione,
  CampoTesto,
  Casella,
  Dialogo,
  Etichetta,
  Griglia,
  Pulsante,
  PulsanteIcona,
  Scheda,
  Tabella,
} from '../../components/ui';
import { useApp, useConferma } from '../../contesto';
import * as f from '../../format';
import { useAzione } from '../../hooks';
import { nomeUtente } from './comuni';
import { vuotoInNullo, type PropsSezione } from './admin-comuni';

const STATI_VALIDAZIONE: StatoValidazioneCorso[] = ['Da validare', 'Validato', 'Scartato'];
const TONO_VALIDAZIONE: Record<StatoValidazioneCorso, 'avviso' | 'successo' | 'neutro'> = { 'Da validare': 'avviso', Validato: 'successo', Scartato: 'neutro' };

interface ModuloCorso {
  id?: string;
  codice: string;
  titolo: string;
  descrizione: string;
  ente: EnteErogatore;
  nomeEnte: string;
  tipologia: string;
  modalita: Modalita;
  durataOre: string;
  gettonePrevisto: boolean;
  attivo: boolean;
  piuGiornate: boolean;
  origine: OrigineCorso;
  statoValidazione: StatoValidazioneCorso;
  loginAutore?: string;
}

function daCorso(c?: Corso): ModuloCorso {
  return {
    id: c?.id,
    codice: c?.codice ?? '',
    titolo: c?.titolo ?? '',
    descrizione: c?.descrizione ?? '',
    ente: c?.ente ?? 'Datore di lavoro',
    nomeEnte: c?.nomeEnte ?? (c ? '' : 'Società Dolce'),
    tipologia: c?.tipologia ?? '',
    modalita: c?.modalita ?? 'In presenza',
    durataOre: c ? String(c.durataOre).replace('.', ',') : '',
    gettonePrevisto: c?.gettonePrevisto ?? true,
    attivo: c?.attivo ?? true,
    piuGiornate: c?.piuGiornate ?? false,
    origine: c?.origine ?? 'Catalogo aziendale',
    statoValidazione: c?.statoValidazione ?? 'Validato',
    loginAutore: c?.loginAutore,
  };
}

function versoCorso(m: ModuloCorso): Omit<Corso, 'id'> & { id?: string } {
  return {
    id: m.id,
    codice: m.codice.trim(),
    titolo: m.titolo.trim(),
    descrizione: vuotoInNullo(m.descrizione),
    ente: m.ente,
    nomeEnte: vuotoInNullo(m.nomeEnte),
    tipologia: vuotoInNullo(m.tipologia),
    modalita: m.modalita,
    durataOre: f.parseNumero(m.durataOre),
    gettonePrevisto: m.gettonePrevisto,
    attivo: m.attivo,
    piuGiornate: m.piuGiornate,
    origine: m.origine,
    statoValidazione: m.statoValidazione,
    loginAutore: m.loginAutore,
  };
}

/** Codice proposto per un corso aggiunto al catalogo: iniziali del titolo + durata, univoco. */
function codiceProposto(c: Corso, esistenti: readonly Corso[]): string {
  const iniziali = c.titolo
    .normalize('NFD')
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 3)
    .slice(0, 4)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const base = `${iniziali || 'CORSO'}-${String(Math.round(c.durataOre)).padStart(2, '0')}`;
  let codice = base;
  for (let i = 2; esistenti.some((x) => x.codice === codice); i++) codice = `${base}-${i}`;
  return codice;
}

export function AdminCatalogo({ anagrafiche, ricarica }: PropsSezione) {
  const { backend } = useApp();
  const conferma = useConferma();
  const azione = useAzione();
  const { corsi, utenti } = anagrafiche;
  const [testo, setTesto] = useState('');
  const [ente, setEnte] = useState('');
  const [attivo, setAttivo] = useState('');
  const [statoValidazione, setStatoValidazione] = useState('');
  const [inModifica, setInModifica] = useState<Corso | 'nuovo' | null>(null);
  const [daValidare, setDaValidare] = useState<Corso | null>(null);
  const chiudiModifica = useCallback(() => setInModifica(null), []);
  const chiudiValidazione = useCallback(() => setDaValidare(null), []);

  const esterniDaValidare = useMemo(() => corsi.filter((c) => c.origine === 'Inserito dal lavoratore' && c.statoValidazione === 'Da validare'), [corsi]);
  const righe = useMemo(() => {
    const t = testo.trim().toLowerCase();
    return corsi
      .filter(
        (c) =>
          (!ente || c.ente === ente) &&
          (!attivo || String(c.attivo) === attivo) &&
          (!statoValidazione || c.statoValidazione === statoValidazione) &&
          (!t || `${c.codice} ${c.titolo} ${c.nomeEnte ?? ''} ${c.tipologia ?? ''}`.toLowerCase().includes(t)),
      )
      .sort((a, b) => a.ente.localeCompare(b.ente, 'it') || a.titolo.localeCompare(b.titolo, 'it'));
  }, [corsi, testo, ente, attivo, statoValidazione]);

  const scarta = async (c: Corso) => {
    const ok = await conferma({
      titolo: 'Scartare il corso esterno?',
      pericolo: true,
      etichettaConferma: 'Scarta il corso',
      testo: `«${c.titolo}» (${c.codice}) non comparirà più tra i corsi riutilizzabili da ${nomeUtente(utenti, c.loginAutore)}.\nLe richieste già inviate con questo corso non cambiano.`,
    });
    if (!ok) return;
    if (await azione.prova(() => backend.salvaCorso({ ...c, statoValidazione: 'Scartato' }), 'Corso scartato.')) await ricarica();
  };

  return (
    <div className="pagina">
      <Scheda titolo={`Corsi esterni inseriti dai lavoratori da validare (${esterniDaValidare.length})`} icona="valida">
        {esterniDaValidare.length === 0 ? (
          <p className="testo-secondario" style={{ margin: 0 }}>
            Nessun corso esterno da validare.
          </p>
        ) : (
          <>
            <p className="testo-secondario" style={{ marginTop: 0 }}>
              Corsi non presenti a catalogo inseriti dai lavoratori. Validali (eventualmente aggiungendoli al catalogo aziendale) o scartali.
            </p>
            <div className="gestione-tabella tabella-compatta">
              <Tabella
                didascalia="Corsi esterni da validare"
                righe={esterniDaValidare}
                chiave={(c) => c.id}
                colonne={[
                  {
                    titolo: 'Corso',
                    valore: (c) => (
                      <span className="testo-a-capo">
                        <span className="cella-principale">{c.titolo}</span>
                        <span className="cella-secondaria">{c.codice}</span>
                      </span>
                    ),
                  },
                  { titolo: 'Ente', valore: (c) => c.nomeEnte ?? '—' },
                  { titolo: 'Modalità', valore: (c) => c.modalita, secondaria: true },
                  { titolo: 'Durata', valore: (c) => f.ore(c.durataOre), numerica: true },
                  { titolo: 'Più giornate', valore: (c) => (c.piuGiornate ? 'Sì' : 'No'), secondaria: true },
                  { titolo: 'Inserito da', valore: (c) => nomeUtente(utenti, c.loginAutore) },
                ]}
                azioni={(c) => (
                  <>
                    <Pulsante variante="successo" piccolo icona="approva" disabled={azione.inCorso} onClick={() => setDaValidare(c)}>
                      Valida
                    </Pulsante>
                    <Pulsante variante="secondario" piccolo icona="respingi" disabled={azione.inCorso} onClick={() => void scarta(c)}>
                      Scarta
                    </Pulsante>
                  </>
                )}
              />
            </div>
          </>
        )}
      </Scheda>

      <div className="riga-flessibile">
        <p className="testo-secondario" style={{ margin: 0, flex: '1 1 320px' }}>
          I corsi del <strong>Datore di lavoro</strong> attivi e validati compaiono nel modulo di richiesta; i corsi esterni restano nello storico del lavoratore che li
          ha inseriti.
        </p>
        <Pulsante icona="aggiungi" onClick={() => setInModifica('nuovo')}>
          Nuovo corso
        </Pulsante>
      </div>

      <BarraFiltri
        onAzzera={() => {
          setTesto('');
          setEnte('');
          setAttivo('');
          setStatoValidazione('');
        }}
        conteggio={`${righe.length} di ${corsi.length}`}
      >
        <CampoTesto etichetta="Cerca" type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Codice, titolo, ente, tipologia" />
        <CampoSelezione etichetta="Ente erogatore" value={ente} onChange={(e) => setEnte(e.target.value)} vuota="Tutti" opzioni={ENTI.map((x) => ({ valore: x, etichetta: x }))} />
        <CampoSelezione
          etichetta="Attivo"
          value={attivo}
          onChange={(e) => setAttivo(e.target.value)}
          vuota="Tutti"
          opzioni={[
            { valore: 'true', etichetta: 'Sì' },
            { valore: 'false', etichetta: 'No' },
          ]}
        />
        <CampoSelezione
          etichetta="Stato validazione"
          value={statoValidazione}
          onChange={(e) => setStatoValidazione(e.target.value)}
          vuota="Tutti"
          opzioni={STATI_VALIDAZIONE.map((s) => ({ valore: s, etichetta: s }))}
        />
      </BarraFiltri>

      <div className="gestione-tabella tabella-compatta">
        <Tabella
          didascalia="Catalogo dei corsi"
          righe={righe}
          chiave={(c) => c.id}
          onApri={(c) => setInModifica(c)}
          vuoto="Nessun corso corrisponde ai filtri."
          colonne={[
            { titolo: 'Codice', valore: (c) => <span className="cella-principale">{c.codice}</span> },
            {
              titolo: 'Titolo',
              valore: (c) => (
                <span className="cella-titolo-corso testo-a-capo">
                  {c.titolo}
                  {c.tipologia && <span className="cella-secondaria">{c.tipologia}</span>}
                </span>
              ),
            },
            {
              titolo: 'Ente',
              valore: (c) => (
                <span className="cella-blocco">
                  {c.ente}
                  {c.nomeEnte && <span className="cella-secondaria">{c.nomeEnte}</span>}
                </span>
              ),
            },
            { titolo: 'Modalità', valore: (c) => c.modalita, secondaria: true },
            { titolo: 'Durata (ore)', valore: (c) => f.numero(c.durataOre), numerica: true },
            { titolo: 'Gettone', valore: (c) => (c.gettonePrevisto ? 'Sì' : 'No'), secondaria: true },
            { titolo: 'Più giornate', valore: (c) => (c.piuGiornate ? 'Sì' : 'No'), secondaria: true },
            { titolo: 'Attivo', valore: (c) => <Etichetta tono={c.attivo ? 'successo' : 'neutro'}>{c.attivo ? 'Sì' : 'No'}</Etichetta> },
            { titolo: 'Validazione', valore: (c) => <Etichetta tono={TONO_VALIDAZIONE[c.statoValidazione]}>{c.statoValidazione}</Etichetta> },
            { titolo: 'Origine', valore: (c) => (c.origine === 'Inserito dal lavoratore' ? `Lavoratore: ${nomeUtente(utenti, c.loginAutore)}` : c.origine), secondaria: true },
          ]}
          azioni={(c) => <PulsanteIcona icona="modifica" etichetta={`Modifica ${c.codice}`} onClick={() => setInModifica(c)} />}
        />
      </div>

      {inModifica && <DialogoCorso corso={inModifica === 'nuovo' ? undefined : inModifica} anagrafiche={anagrafiche} ricarica={ricarica} onChiudi={chiudiModifica} />}
      {daValidare && <DialogoValidaCorso corso={daValidare} anagrafiche={anagrafiche} ricarica={ricarica} onChiudi={chiudiValidazione} />}
    </div>
  );
}

function DialogoCorso({ corso, anagrafiche, ricarica, onChiudi }: PropsSezione & { corso?: Corso; onChiudi: () => void }) {
  const { backend } = useApp();
  const azione = useAzione();
  const [m, setM] = useState<ModuloCorso>(() => daCorso(corso));
  const imposta = <K extends keyof ModuloCorso>(k: K, v: ModuloCorso[K]) => setM((x) => ({ ...x, [k]: v }));

  const salva = async () => {
    const r = await azione.prova(() => backend.salvaCorso(versoCorso(m)), corso ? 'Corso aggiornato.' : 'Corso aggiunto al catalogo.');
    if (r) {
      onChiudi();
      await ricarica();
    }
  };

  return (
    <Dialogo
      titolo={corso ? `Modifica ${corso.codice}` : 'Nuovo corso'}
      largo
      onChiudi={onChiudi}
      piede={
        <>
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante icona="salva" inCorso={azione.inCorso} onClick={() => void salva()}>
            Salva
          </Pulsante>
        </>
      }
    >
      <Griglia colonne={2}>
        <CampoTesto etichetta="Codice univoco" value={m.codice} onChange={(e) => imposta('codice', e.target.value.toUpperCase())} obbligatorio errore={azione.erroreDi('codice')} autoComplete="off" />
        <CampoTesto
          etichetta="Durata complessiva (ore)"
          inputMode="decimal"
          value={m.durataOre}
          onChange={(e) => imposta('durataOre', e.target.value)}
          obbligatorio
          errore={azione.erroreDi('durataOre')}
          aiuto="Es. 4 oppure 7,5"
          autoComplete="off"
        />
        <CampoTesto etichetta="Titolo" value={m.titolo} onChange={(e) => imposta('titolo', e.target.value)} obbligatorio errore={azione.erroreDi('titolo')} className="span-2" autoComplete="off" />
        <CampoArea etichetta="Descrizione" value={m.descrizione} onChange={(e) => imposta('descrizione', e.target.value)} className="span-2" />
        <CampoSelezione etichetta="Ente erogatore" value={m.ente} onChange={(e) => imposta('ente', e.target.value as EnteErogatore)} opzioni={ENTI.map((x) => ({ valore: x, etichetta: x }))} obbligatorio />
        <CampoTesto etichetta="Nome dell’ente" value={m.nomeEnte} onChange={(e) => imposta('nomeEnte', e.target.value)} autoComplete="off" />
        <CampoTesto etichetta="Tipologia" value={m.tipologia} onChange={(e) => imposta('tipologia', e.target.value)} aiuto="Es. Sicurezza sul lavoro" autoComplete="off" />
        <CampoSelezione etichetta="Modalità di svolgimento" value={m.modalita} onChange={(e) => imposta('modalita', e.target.value as Modalita)} opzioni={MODALITA.map((x) => ({ valore: x, etichetta: x }))} obbligatorio />
        {corso && (
          <CampoSelezione
            etichetta="Stato validazione"
            value={m.statoValidazione}
            onChange={(e) => imposta('statoValidazione', e.target.value as StatoValidazioneCorso)}
            opzioni={STATI_VALIDAZIONE.map((s) => ({ valore: s, etichetta: s }))}
          />
        )}
        {corso && <CampoLettura etichetta="Origine" valore={m.origine === 'Inserito dal lavoratore' ? `${m.origine} (${nomeUtente(anagrafiche.utenti, m.loginAutore)})` : m.origine} />}
        <div className="span-2" style={{ display: 'grid', gap: 8 }}>
          <Casella etichetta="Gettone previsto" checked={m.gettonePrevisto} onChange={(e) => imposta('gettonePrevisto', e.target.checked)} />
          <Casella etichetta="Corso su più giornate (più sessioni)" checked={m.piuGiornate} onChange={(e) => imposta('piuGiornate', e.target.checked)} />
          <Casella etichetta="Attivo (selezionabile nelle nuove richieste)" checked={m.attivo} onChange={(e) => imposta('attivo', e.target.checked)} />
        </div>
      </Griglia>
      {m.ente === 'Committente o altro soggetto' && m.origine === 'Catalogo aziendale' && (
        <Avviso tono="info">I corsi con ente «Committente o altro soggetto» non compaiono nel catalogo del modulo di richiesta.</Avviso>
      )}
    </Dialogo>
  );
}

function DialogoValidaCorso({ corso, anagrafiche, ricarica, onChiudi }: PropsSezione & { corso: Corso; onChiudi: () => void }) {
  const { backend } = useApp();
  const azione = useAzione();
  const [aggiungi, setAggiungi] = useState(false);
  const [codice, setCodice] = useState(() => codiceProposto(corso, anagrafiche.corsi));
  const [tipologia, setTipologia] = useState(corso.tipologia ?? '');
  const [gettone, setGettone] = useState(corso.gettonePrevisto);

  const valida = async () => {
    const dati: Omit<Corso, 'id'> & { id?: string } = aggiungi
      ? {
          ...corso,
          statoValidazione: 'Validato',
          ente: 'Datore di lavoro',
          origine: 'Catalogo aziendale',
          codice: codice.trim(),
          tipologia: vuotoInNullo(tipologia),
          gettonePrevisto: gettone,
          attivo: true,
        }
      : { ...corso, statoValidazione: 'Validato' };
    const r = await azione.prova(() => backend.salvaCorso(dati), aggiungi ? `Corso validato e aggiunto al catalogo con codice ${dati.codice}.` : 'Corso validato.');
    if (r) {
      onChiudi();
      await ricarica();
    }
  };

  return (
    <Dialogo
      titolo="Valida il corso esterno"
      onChiudi={onChiudi}
      piede={
        <>
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante variante="successo" icona="approva" inCorso={azione.inCorso} onClick={() => void valida()}>
            {aggiungi ? 'Valida e aggiungi al catalogo' : 'Valida'}
          </Pulsante>
        </>
      }
    >
      <dl className="elenco-dati">
        <div>
          <dt>Titolo</dt>
          <dd>{corso.titolo}</dd>
        </div>
        <div>
          <dt>Ente</dt>
          <dd>{corso.nomeEnte ?? '—'}</dd>
        </div>
        <div>
          <dt>Durata</dt>
          <dd>{f.ore(corso.durataOre)}</dd>
        </div>
        <div>
          <dt>Inserito da</dt>
          <dd>{nomeUtente(anagrafiche.utenti, corso.loginAutore)}</dd>
        </div>
      </dl>
      <Casella
        etichetta={
          <>
            <strong>Aggiungi al catalogo aziendale</strong>
            <span className="campo-aiuto" style={{ display: 'block' }}>
              Diventa un corso del «Datore di lavoro» con un nuovo codice, selezionabile da tutti i lavoratori.
            </span>
          </>
        }
        checked={aggiungi}
        onChange={(e) => setAggiungi(e.target.checked)}
      />
      {aggiungi ? (
        <Griglia colonne={2}>
          <CampoTesto etichetta="Nuovo codice" value={codice} onChange={(e) => setCodice(e.target.value.toUpperCase())} obbligatorio errore={azione.erroreDi('codice')} autoComplete="off" />
          <CampoTesto etichetta="Tipologia" value={tipologia} onChange={(e) => setTipologia(e.target.value)} autoComplete="off" />
          <div className="span-2">
            <Casella etichetta="Gettone previsto" checked={gettone} onChange={(e) => setGettone(e.target.checked)} />
          </div>
        </Griglia>
      ) : (
        <p className="testo-secondario" style={{ margin: 0 }}>
          Il corso resta esterno: il lavoratore potrà riutilizzarlo per le sessioni successive.
        </p>
      )}
    </Dialogo>
  );
}
