/**
 * Schermata HR – Monte ore dei permessi (diritto allo studio, riqualifica professionale).
 *
 * HR abilita il singolo lavoratore a rendicontare un tipo di permesso assegnandogli un monte ore
 * per un periodo di validità. Le ore dei permessi richiesti si scalano dal monte ore fino a
 * esaurimento: «usufruite» sono quelle validate da HR, «in approvazione» quelle inviate e non
 * ancora validate. Le richieste seguono lo stesso percorso della formazione (coordinatore → HR)
 * e l'app blocca quelle che superano le ore residue.
 */
import { useMemo, useState, type FormEvent } from 'react';
import type { MonteOreInput } from '../../data/api';
import { arrotonda2, MAX_LUNGHEZZA_NOTE, oggiRoma, TIPI_PERMESSO, type Lavoratore, type SituazioneMonteOre, type Struttura, type TipoPermesso, type UtenteDirectory } from '../../domain';
import {
  Avviso,
  BarraFiltri,
  BarraMonteOre,
  Caricamento,
  CampoArea,
  CampoLettura,
  CampoSelezione,
  CampoTesto,
  Casella,
  Dialogo,
  ErroreCaricamento,
  Etichetta,
  Griglia,
  Indicatore,
  Pagina,
  Pulsante,
  PulsanteIcona,
  Tabella,
  type Opzione,
} from '../components/ui';
import { useApp, useConferma } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { nominativo, nomeUtente } from './gestione/comuni';
import '../../styles/gestione.css';

const OPZIONI_TIPO: Opzione[] = TIPI_PERMESSO.map((t) => ({ valore: t, etichetta: t }));
const OPZIONI_STATO: Opzione[] = [
  { valore: 'attivo', etichetta: 'Attivo' },
  { valore: 'nonattivo', etichetta: 'Non attivo' },
];

type Validita = 'in corso' | 'scaduto' | 'futuro';
function validita(m: Pick<SituazioneMonteOre, 'validoDal' | 'validoAl'>, oggi: string): Validita {
  return m.validoAl < oggi ? 'scaduto' : m.validoDal > oggi ? 'futuro' : 'in corso';
}

export function Permessi() {
  const { backend } = useApp();
  const conferma = useConferma();
  const azione = useAzione();
  const oggi = oggiRoma();

  const dati = useCarica(async () => {
    const [monti, anagrafiche] = await Promise.all([backend.getMontiOre(), backend.getAnagrafiche()]);
    return { monti, anagrafiche };
  }, [backend]);

  const [tipo, setTipo] = useState('');
  const [stato, setStato] = useState('');
  const [testo, setTesto] = useState('');
  /** Monte ore in modifica, oppure `'nuovo'` per una nuova assegnazione. */
  const [inModifica, setInModifica] = useState<SituazioneMonteOre | 'nuovo' | null>(null);

  const monti = useMemo(() => dati.dati?.monti ?? [], [dati.dati]);
  const righe = useMemo(() => {
    const t = testo.trim().toLowerCase();
    return monti.filter(
      (m) => (!tipo || m.tipo === tipo) && (!stato || (stato === 'attivo') === m.attivo) && (!t || m.nominativo.toLowerCase().includes(t)),
    );
  }, [monti, tipo, stato, testo]);

  // i totali riguardano i monte ore attivi tra quelli filtrati
  const totali = useMemo(() => {
    const attivi = righe.filter((m) => m.attivo);
    const somma = (sel: (m: SituazioneMonteOre) => number) => arrotonda2(attivi.reduce((s, m) => s + sel(m), 0));
    return {
      abilitati: new Set(attivi.filter((m) => validita(m, oggi) === 'in corso').map((m) => m.lavoratoreId)).size,
      assegnate: somma((m) => m.oreTotali),
      usufruite: somma((m) => m.oreUsufruite),
      impegnate: somma((m) => m.oreImpegnate),
      residue: somma((m) => m.oreResidue),
    };
  }, [righe, oggi]);

  const cambiaStato = async (m: SituazioneMonteOre) => {
    const disattiva = m.attivo;
    const ok = await conferma({
      titolo: disattiva ? 'Disattivare il monte ore?' : 'Riattivare il monte ore?',
      pericolo: disattiva,
      etichettaConferma: disattiva ? 'Disattiva' : 'Riattiva',
      testo: disattiva
        ? `${m.nominativo} non potrà più inserire nuove richieste di «${m.tipo}» su questo monte ore.\nI permessi già richiesti restano validi e continuano il loro percorso di approvazione.`
        : `${m.nominativo} potrà di nuovo inserire richieste di «${m.tipo}» dal ${f.data(m.validoDal)} al ${f.data(m.validoAl)}, entro le ore residue (${f.ore(m.oreResidue)}).`,
    });
    if (!ok) return;
    const input: MonteOreInput = { id: m.id, lavoratoreId: m.lavoratoreId, tipo: m.tipo, oreTotali: m.oreTotali, validoDal: m.validoDal, validoAl: m.validoAl, attivo: !m.attivo, note: m.note };
    if (await azione.prova(() => backend.salvaMonteOre(input), disattiva ? 'Monte ore disattivato.' : 'Monte ore riattivato.')) await dati.ricarica();
  };

  return (
    <Pagina
      titolo="Monte ore permessi"
      sottotitolo="Diritto allo studio e riqualifica professionale: il monte ore individuale da cui si scalano i permessi di ogni lavoratore abilitato."
      azioni={
        <Pulsante icona="aggiungi" onClick={() => setInModifica('nuovo')} disabled={!dati.dati}>
          Assegna monte ore
        </Pulsante>
      }
    >
      <Avviso tono="info" titolo="Come funziona">
        <ul className="elenco-compatto">
          <li>
            Il lavoratore vede «Diritto allo studio» o «Riqualifica professionale» in <strong>Inserisci formazione</strong> solo finché ha un monte ore attivo di quel
            tipo.
          </li>
          <li>
            Le richieste di permesso seguono lo stesso percorso della formazione: <strong>coordinatore → HR</strong>.
          </li>
          <li>
            Le ore si scalano dal monte ore fino a esaurimento: <strong>l’app blocca</strong> le richieste che superano le ore residue.
          </li>
        </ul>
      </Avviso>

      <BarraFiltri
        onAzzera={() => {
          setTipo('');
          setStato('');
          setTesto('');
        }}
        conteggio={dati.dati ? `${righe.length} monte ore` : undefined}
      >
        <CampoSelezione etichetta="Tipo di permesso" value={tipo} onChange={(e) => setTipo(e.target.value)} vuota="Tutti" opzioni={OPZIONI_TIPO} />
        <CampoSelezione etichetta="Stato" value={stato} onChange={(e) => setStato(e.target.value)} vuota="Tutti" opzioni={OPZIONI_STATO} />
        <CampoTesto etichetta="Cerca lavoratore" type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cognome o nome" />
      </BarraFiltri>

      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {dati.caricamento && !dati.dati ? (
        <Caricamento />
      ) : (
        dati.dati && (
          <>
            <div className="indicatori indicatori-compatti" role="group" aria-label="Totali dei monte ore attivi">
              <Indicatore etichetta="Lavoratori abilitati" valore={totali.abilitati} nota="Con un monte ore attivo oggi" tono="info" />
              <Indicatore etichetta="Ore assegnate" valore={f.numero(totali.assegnate)} nota="Monte ore attivi" />
              <Indicatore etichetta="Ore usufruite" valore={f.numero(totali.usufruite)} nota="Permessi validati da HR" tono="successo" />
              <Indicatore etichetta="Ore in approvazione" valore={f.numero(totali.impegnate)} nota="In attesa di coordinatore o HR" tono={totali.impegnate ? 'avviso' : 'neutro'} />
              <Indicatore etichetta="Ore residue" valore={f.numero(totali.residue)} nota="Ancora richiedibili" tono="info" />
            </div>

            <div className="gestione-tabella">
              <Tabella
                didascalia="Monte ore dei permessi assegnati ai lavoratori"
                righe={righe}
                chiave={(m) => m.id}
                vuoto={monti.length ? 'Nessun monte ore corrisponde ai filtri.' : 'Nessun monte ore assegnato: usa «Assegna monte ore» per abilitare un lavoratore.'}
                colonne={[
                  {
                    titolo: 'Lavoratore',
                    valore: (m) => (
                      <span className="cella-blocco">
                        <span className="cella-principale testo-a-capo">{m.nominativo || '—'}</span>
                        {m.note && <span className="cella-secondaria testo-a-capo">{m.note}</span>}
                      </span>
                    ),
                  },
                  { titolo: 'Tipo di permesso', valore: (m) => <Etichetta tono="info">{m.tipo}</Etichetta> },
                  {
                    titolo: 'Validità',
                    valore: (m) => {
                      const v = validita(m, oggi);
                      return (
                        <span className="cella-blocco">
                          <span style={{ whiteSpace: 'nowrap' }}>
                            {f.data(m.validoDal)} – {f.data(m.validoAl)}
                          </span>
                          {v !== 'in corso' && <span className="cella-secondaria">{v === 'scaduto' ? 'Periodo scaduto' : 'Non ancora iniziato'}</span>}
                        </span>
                      );
                    },
                  },
                  { titolo: 'Ore assegnate', valore: (m) => f.numero(m.oreTotali), numerica: true },
                  { titolo: 'Usufruite', valore: (m) => f.numero(m.oreUsufruite), numerica: true },
                  { titolo: 'In approvazione', valore: (m) => f.numero(m.oreImpegnate), numerica: true },
                  {
                    titolo: 'Residue',
                    numerica: true,
                    valore: (m) => (
                      <span className="cella-monte">
                        {m.oreResidue <= 0 ? <Etichetta tono="pericolo">Esaurito</Etichetta> : <strong>{f.numero(m.oreResidue)}</strong>}
                        <BarraMonteOre situazione={m} compatta />
                      </span>
                    ),
                  },
                  { titolo: 'Stato', valore: (m) => <Etichetta tono={m.attivo ? 'successo' : 'neutro'}>{m.attivo ? 'Attivo' : 'Non attivo'}</Etichetta> },
                ]}
                azioni={(m) => (
                  <>
                    <PulsanteIcona icona="modifica" etichetta={`Modifica il monte ore di ${m.nominativo} (${m.tipo})`} onClick={() => setInModifica(m)} />
                    {m.attivo ? (
                      <PulsanteIcona icona="lucchetto" variante="pericolo" etichetta={`Disattiva il monte ore di ${m.nominativo} (${m.tipo})`} disabled={azione.inCorso} onClick={() => void cambiaStato(m)} />
                    ) : (
                      <PulsanteIcona icona="sbloccato" variante="successo" etichetta={`Riattiva il monte ore di ${m.nominativo} (${m.tipo})`} disabled={azione.inCorso} onClick={() => void cambiaStato(m)} />
                    )}
                  </>
                )}
              />
            </div>
            {righe.length > 0 && (
              <p className="legenda" aria-label="Legenda della barra del monte ore">
                <strong>Barra:</strong>
                <span>
                  <span className="campione campione-usufruite" aria-hidden /> usufruite (validate da HR)
                </span>
                <span>
                  <span className="campione campione-impegnate" aria-hidden /> in approvazione
                </span>
                <span>
                  <span className="campione" aria-hidden /> residue
                </span>
              </p>
            )}
          </>
        )
      )}

      {inModifica && dati.dati && (
        <DialogoMonteOre
          esistente={inModifica === 'nuovo' ? null : inModifica}
          lavoratori={dati.dati.anagrafiche.lavoratori}
          strutture={dati.dati.anagrafiche.strutture}
          utenti={dati.dati.anagrafiche.utenti}
          onChiudi={() => setInModifica(null)}
          onSalvato={async () => {
            setInModifica(null);
            await dati.ricarica();
          }}
        />
      )}
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
//  Assegnazione e modifica di un monte ore
// ---------------------------------------------------------------------------
interface Modulo {
  lavoratoreId: string;
  tipo: string;
  oreTotali: string;
  validoDal: string;
  validoAl: string;
  note: string;
  attivo: boolean;
}

function DialogoMonteOre({
  esistente,
  lavoratori,
  strutture,
  utenti,
  onChiudi,
  onSalvato,
}: {
  esistente: SituazioneMonteOre | null;
  lavoratori: readonly Lavoratore[];
  strutture: readonly Struttura[];
  utenti: readonly UtenteDirectory[];
  onChiudi: () => void;
  onSalvato: () => Promise<void>;
}) {
  const { backend } = useApp();
  const azione = useAzione();
  const anno = oggiRoma().slice(0, 4);
  const [m, setM] = useState<Modulo>(() =>
    esistente
      ? {
          lavoratoreId: esistente.lavoratoreId,
          tipo: esistente.tipo,
          oreTotali: String(esistente.oreTotali).replace('.', ','),
          validoDal: esistente.validoDal,
          validoAl: esistente.validoAl,
          note: esistente.note ?? '',
          attivo: esistente.attivo,
        }
      : { lavoratoreId: '', tipo: '', oreTotali: '', validoDal: `${anno}-01-01`, validoAl: `${anno}-12-31`, note: '', attivo: true },
  );
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [cerca, setCerca] = useState('');
  const imposta = <K extends keyof Modulo>(campo: K, valore: Modulo[K]) => {
    setM((x) => ({ ...x, [campo]: valore }));
    setErrori((e) => ({ ...e, [campo]: '' }));
  };
  // errore locale oppure, se assente, quello restituito dal backend per lo stesso campo
  const errore = (campo: string) => errori[campo] || azione.erroreDi(campo);

  const opzioniLavoratori = useMemo(() => {
    const servizio = new Map(strutture.map((s) => [s.id, s.servizio]));
    const t = cerca.trim().toLowerCase();
    return lavoratori
      .filter((l) => l.stato === 'Attivo' || l.id === m.lavoratoreId)
      .filter((l) => l.id === m.lavoratoreId || !t || `${l.cognome} ${l.nome} ${l.nome} ${l.cognome}`.toLowerCase().includes(t))
      .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'))
      .map((l) => ({ valore: l.id, etichetta: `${nominativo(l)}${servizio.get(l.strutturaId) ? ` – ${servizio.get(l.strutturaId)}` : ''}` }));
  }, [lavoratori, strutture, cerca, m.lavoratoreId]);

  const salva = async (e?: FormEvent) => {
    e?.preventDefault();
    const ore = f.parseNumero(m.oreTotali);
    const nuovi: Record<string, string> = {};
    if (!m.lavoratoreId) nuovi.lavoratoreId = 'Seleziona il lavoratore.';
    if (!m.tipo) nuovi.tipo = 'Indica il tipo di permesso.';
    if (!(ore > 0)) nuovi.oreTotali = 'Indica il monte ore assegnato (maggiore di zero).';
    if (!m.validoDal) nuovi.validoDal = 'Indica la data di inizio validità.';
    if (!m.validoAl) nuovi.validoAl = 'Indica la data di fine validità.';
    else if (m.validoDal && m.validoAl < m.validoDal) nuovi.validoAl = 'La fine della validità deve essere successiva all’inizio.';
    setErrori(nuovi);
    azione.setErroriCampi([]);
    if (Object.keys(nuovi).length) return;
    const input: MonteOreInput = {
      id: esistente?.id,
      lavoratoreId: m.lavoratoreId,
      tipo: m.tipo as TipoPermesso,
      oreTotali: ore,
      validoDal: m.validoDal,
      validoAl: m.validoAl,
      attivo: m.attivo,
      note: m.note.trim() || undefined,
    };
    const salvato = await azione.prova(() => backend.salvaMonteOre(input), esistente ? 'Monte ore aggiornato.' : 'Monte ore assegnato: il lavoratore riceve una notifica.');
    if (salvato) await onSalvato();
  };

  const giaUsate = esistente ? arrotonda2(esistente.oreUsufruite + esistente.oreImpegnate) : 0;

  return (
    <Dialogo
      titolo={esistente ? 'Modifica monte ore' : 'Assegna monte ore'}
      largo
      onChiudi={onChiudi}
      piede={
        <>
          <Pulsante variante="secondario" onClick={onChiudi} disabled={azione.inCorso}>
            Annulla
          </Pulsante>
          <Pulsante icona="salva" inCorso={azione.inCorso} onClick={() => void salva()}>
            {esistente ? 'Salva le modifiche' : 'Assegna'}
          </Pulsante>
        </>
      }
    >
      <form onSubmit={(e) => void salva(e)} noValidate style={{ display: 'grid', gap: 16 }}>
        {esistente ? (
          <>
            <Griglia colonne={2}>
              <CampoLettura etichetta="Lavoratore" valore={esistente.nominativo} />
              <CampoLettura etichetta="Tipo di permesso" valore={esistente.tipo} />
            </Griglia>
            <div>
              <span className="testatina">Situazione attuale</span>
              <div style={{ marginTop: 6 }}>
                <BarraMonteOre situazione={esistente} />
              </div>
            </div>
            {azione.erroreDi('tipo') && <Avviso tono="pericolo">{azione.erroreDi('tipo')}</Avviso>}
          </>
        ) : (
          <Griglia colonne={2}>
            <div style={{ display: 'grid', gap: 8 }}>
              {lavoratori.length > 15 && (
                <CampoTesto etichetta="Cerca lavoratore" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cognome o nome" />
              )}
              <CampoSelezione
                etichetta="Lavoratore"
                obbligatorio
                value={m.lavoratoreId}
                onChange={(e) => imposta('lavoratoreId', e.target.value)}
                vuota={opzioniLavoratori.length ? 'Seleziona…' : 'Nessun lavoratore trovato'}
                opzioni={opzioniLavoratori}
                errore={errore('lavoratoreId')}
              />
            </div>
            <CampoSelezione
              etichetta="Tipo di permesso"
              obbligatorio
              value={m.tipo}
              onChange={(e) => imposta('tipo', e.target.value)}
              vuota="Seleziona…"
              opzioni={OPZIONI_TIPO}
              errore={errore('tipo')}
              aiuto="Lavoratore e tipo non si possono cambiare dopo l’assegnazione."
            />
          </Griglia>
        )}

        <Griglia colonne={3}>
          <CampoTesto
            etichetta="Monte ore assegnato"
            obbligatorio
            inputMode="decimal"
            autoComplete="off"
            value={m.oreTotali}
            onChange={(e) => imposta('oreTotali', e.target.value)}
            errore={errore('oreTotali')}
            aiuto={esistente && giaUsate > 0 ? `Non meno di ${f.numero(giaUsate)} h: ore già usufruite o in approvazione.` : 'Ore totali del periodo, es. 150.'}
          />
          <CampoTesto etichetta="Valido dal" obbligatorio type="date" value={m.validoDal} onChange={(e) => imposta('validoDal', e.target.value)} errore={errore('validoDal')} />
          <CampoTesto etichetta="Valido al" obbligatorio type="date" value={m.validoAl} min={m.validoDal || undefined} onChange={(e) => imposta('validoAl', e.target.value)} errore={errore('validoAl')} />
        </Griglia>
        <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>
          Il periodo di validità è libero perché l’anno di riferimento del monte ore (anno solare oppure anno accademico o formativo) è ancora da definire: indica
          le date che servono, ad esempio 1° gennaio – 31 dicembre oppure 1° ottobre – 30 settembre. I permessi si possono chiedere solo per date comprese nel
          periodo.
        </p>

        <CampoArea
          etichetta="Note"
          rows={2}
          maxLength={MAX_LUNGHEZZA_NOTE}
          value={m.note}
          onChange={(e) => imposta('note', e.target.value)}
          aiuto="Facoltative, es. corso di laurea o percorso di riqualifica autorizzato."
        />
        <Casella
          etichetta={
            <>
              <strong>Monte ore attivo</strong> – il lavoratore può inserire richieste di questo tipo di permesso
            </>
          }
          checked={m.attivo}
          onChange={(e) => imposta('attivo', e.target.checked)}
        />
        {esistente && (
          <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>
            Assegnato da {nomeUtente(utenti, esistente.assegnatoDa)} il {f.dataOra(esistente.assegnatoIl)}. Ogni modifica viene scritta nel registro.
          </p>
        )}
        {/* invio con Invio dalla tastiera */}
        <button type="submit" hidden />
      </form>
    </Dialogo>
  );
}
