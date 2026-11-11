/**
 * Schermata 8 – Chiusura mensile HR e file per l'Ufficio Paghe (Flusso 6).
 *
 * HR verifica le richieste ancora aperte (raggruppate per coordinatore, così sa chi sollecitare)
 * e le anomalie del mese, chiude il mese (da quel momento nessuna modifica è più consentita),
 * genera il file paghe e lo scarica dall'archivio. Il file ha una colonna per ogni voce: ore
 * retribuite, ore gettone, ore non retribuite, ore di diritto allo studio e ore di riqualifica
 * professionale.
 * Solo l'amministratore può riaprire eccezionalmente un mese chiuso, indicando il motivo.
 */
import { useMemo, useState } from 'react';
import type { ApertePerCoordinatore, StatoMese } from '../../data/api';
import {
  ETICHETTA_ANOMALIA,
  INTESTAZIONE_PAGHE,
  mesePrecedente,
  righePaghe,
  totaliPaghe,
  type Anomalia,
  type FilePaghe,
  type Lavoratore,
  type RigaPaghe,
  type StatoPeriodo,
  type StatoRichiesta,
  type TipoAnomalia,
} from '../../domain';
import { Icona } from '../components/Icona';
import {
  Avviso,
  BadgeStato,
  Caricamento,
  CampoSelezione,
  ErroreCaricamento,
  Etichetta,
  Indicatore,
  Pagina,
  Pulsante,
  PulsanteIcona,
  Scheda,
  Tabella,
  Vuoto,
} from '../components/ui';
import { useApp, useConferma } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import { CellaTitolo, nominativo, nomeUtente, oggiAnnoMese, opzioniAnni, OPZIONI_MESI } from './gestione/comuni';
import '../../styles/gestione.css';

const TONO_GRAVITA: Record<Anomalia['gravita'], 'pericolo' | 'avviso' | 'info'> = { alta: 'pericolo', media: 'avviso', bassa: 'info' };
const ETICHETTA_GRAVITA: Record<Anomalia['gravita'], string> = { alta: 'Gravità alta', media: 'Gravità media', bassa: 'Gravità bassa' };
const ICONA_STATO: Record<StatoPeriodo, 'sbloccato' | 'lucchetto' | 'aggiorna'> = { Aperto: 'sbloccato', Chiuso: 'lucchetto', Riaperto: 'aggiorna' };

const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

export function Chiusura() {
  const { backend, ha } = useApp();
  const conferma = useConferma();
  const azione = useAzione();
  const admin = ha('admin');

  const [scelta, setScelta] = useState(() => {
    const oggi = oggiAnnoMese();
    return mesePrecedente(oggi.anno, oggi.mese);
  });
  const { anno, mese } = scelta;
  const [fileNuovo, setFileNuovo] = useState<FilePaghe | null>(null);

  const stato = useCarica(() => backend.getStatoMese(anno, mese), [backend, anno, mese]);
  const storico = useCarica(() => backend.getChiusure(), [backend]);
  // anagrafiche: nomi degli utenti e segnalazioni di variazione da gestire (consentite a HR e amministratori)
  const anagrafiche = useCarica(() => backend.getAnagrafiche(), [backend]);
  const utenti = anagrafiche.dati?.utenti;

  const ricaricaTutto = async () => {
    await Promise.all([stato.ricarica(), storico.ricarica(), anagrafiche.ricarica()]);
  };

  const oggi = oggiAnnoMese();
  const futuro = anno > oggi.anno || (anno === oggi.anno && mese > oggi.mese);
  const meseCorrente = anno === oggi.anno && mese === oggi.mese;
  const nomePeriodo = f.periodo(anno, mese);
  const s = stato.dati;
  const chiuso = s?.chiusura.stato === 'Chiuso';

  const cambiaPeriodo = (nuovo: { anno: number; mese: number }) => {
    setFileNuovo(null);
    setScelta(nuovo);
  };

  // ---------------------------------------------------------------------------
  //  Azioni
  // ---------------------------------------------------------------------------
  const chiudi = async () => {
    if (!s) return;
    const esito = await conferma({
      titolo: `Chiudere ${nomePeriodo}?`,
      pericolo: s.aperte.length > 0,
      etichettaConferma: 'Chiudi il mese',
      testo: (
        <>
          {s.aperte.length > 0 ? (
            <Avviso tono="pericolo" titolo={`Attenzione: ${plurale(s.aperte.length, 'richiesta è ancora aperta', 'richieste sono ancora aperte')}`}>
              <p style={{ margin: '0 0 8px' }}>Richieste aperte per coordinatore:</p>
              <ElencoPerCoordinatore gruppi={s.apertePerCoordinatore} />
              <p style={{ margin: '8px 0 0' }}>
                Dopo la chiusura non potranno più essere approvate, validate, modificate né annullate e resteranno escluse dal file paghe di questo
                mese, salvo riapertura da parte di un amministratore.
              </p>
            </Avviso>
          ) : (
            <Avviso tono="successo">Non ci sono richieste aperte per questo mese.</Avviso>
          )}
          {meseCorrente && <p><strong>Il mese non è ancora terminato:</strong> le richieste inviate dopo la chiusura per questo mese saranno rifiutate.</p>}
          <p>
            {plurale(s.validate, 'richiesta validata', 'richieste validate')} da HR {s.validate === 1 ? 'sarà inclusa' : 'saranno incluse'} nel riepilogo mensile e{' '}
            {s.validate === 1 ? 'pronta' : 'pronte'} per il file paghe. Dopo la chiusura <strong>nessuna modifica</strong> sarà più consentita sulle richieste del mese.
          </p>
        </>
      ),
      campoTesto: { etichetta: 'Note HR (facoltative)' },
    });
    if (!esito) return;
    const note = esito === 'ok' ? undefined : esito;
    if (await azione.prova(() => backend.chiudiMese(anno, mese, note), `${nomePeriodo} chiuso.`)) await ricaricaTutto();
  };

  const genera = async () => {
    if (!s) return;
    const ok = await conferma({
      titolo: 'Generare il file paghe?',
      etichettaConferma: 'Genera il file',
      testo: (
        <>
          <p>
            Il file CSV per l’Ufficio Paghe conterrà {plurale(s.daInviare, 'richiesta validata', 'richieste validate')} da HR e incluse nella chiusura di{' '}
            {nomePeriodo}, con una colonna per ogni voce: ore retribuite, ore gettone, ore non retribuite, ore di diritto allo studio e ore di riqualifica
            professionale.
          </p>
          <p>
            Le richieste passeranno allo stato «Inviata a Payroll», il file sarà archiviato
            {s.chiusura.filePaghe.length ? ` come versione ${s.chiusura.filePaghe.length + 1}` : ''} e gli utenti autorizzati riceveranno il collegamento.
          </p>
        </>
      ),
    });
    if (!ok) return;
    const file = await azione.prova(() => backend.generaFilePaghe(anno, mese), (x) => `Generato ${x.nome} (${plurale(x.righe, 'riga', 'righe')}).`);
    if (file) {
      setFileNuovo(file);
      await ricaricaTutto();
    }
  };

  const scarica = async (periodo: string, file: Pick<FilePaghe, 'id' | 'nome'>) => {
    const r = await azione.prova(() => backend.scaricaFilePaghe(periodo, file.id));
    if (r) f.scaricaFile(r.nome, r.contenuto);
  };

  const riapri = async () => {
    const motivo = await conferma({
      titolo: `Riaprire ${nomePeriodo}?`,
      pericolo: true,
      etichettaConferma: 'Riapri il mese',
      testo: (
        <>
          <p>La riapertura è un’operazione eccezionale: le richieste del mese torneranno gestibili da lavoratori, coordinatori e HR.</p>
          <p>I file paghe già generati restano in archivio; dopo le correzioni il mese va chiuso di nuovo e, se serve, va generata una nuova versione del file.</p>
          <p>L’Ufficio HR/Formazione riceverà una notifica con il motivo.</p>
        </>
      ),
      campoTesto: { etichetta: 'Motivo della riapertura', obbligatorio: true, minimo: 10 },
    });
    if (!motivo) return;
    if (await azione.prova(() => backend.riapriMese(anno, mese, motivo), `${nomePeriodo} riaperto.`)) {
      setFileNuovo(null);
      await ricaricaTutto();
    }
  };

  const anniOpzioni = opzioniAnni((storico.dati ?? []).map((c) => c.anno));

  return (
    <Pagina titolo="Chiusura mensile e file paghe" sottotitolo="Verifica le richieste aperte e le anomalie, chiudi il mese e genera il file per l’Ufficio Paghe.">
      <Scheda titolo="Periodo" icona="calendario">
        <div className="selettore-periodo">
          <CampoSelezione etichetta="Mese" value={String(mese)} onChange={(e) => cambiaPeriodo({ anno, mese: Number(e.target.value) })} opzioni={OPZIONI_MESI} />
          <CampoSelezione etichetta="Anno" value={String(anno)} onChange={(e) => cambiaPeriodo({ anno: Number(e.target.value), mese })} opzioni={anniOpzioni} />
          <Pulsante variante="secondario" piccolo icona="indietro" onClick={() => cambiaPeriodo(mesePrecedente(anno, mese))}>
            Mese precedente
          </Pulsante>
          <Pulsante variante="secondario" piccolo onClick={() => cambiaPeriodo(mese === 12 ? { anno: anno + 1, mese: 1 } : { anno, mese: mese + 1 })}>
            Mese successivo
          </Pulsante>
        </div>
      </Scheda>

      {stato.errore && <ErroreCaricamento messaggio={stato.errore} onRiprova={stato.ricarica} />}
      {stato.caricamento && !s ? (
        <Caricamento />
      ) : (
        s && (
          <>
            <SchedaStato s={s} nomePeriodo={nomePeriodo} utenti={utenti} futuro={futuro} />

            <Scheda titolo="Azioni" icona="impostazioni">
              <div style={{ display: 'grid', gap: 12 }}>
                {futuro && <Avviso tono="info">Il mese non è ancora iniziato: non si può chiudere.</Avviso>}
                {!chiuso && !futuro && s.aperte.length > 0 && (
                  <Avviso
                    tono="avviso"
                    titolo={`${plurale(s.aperte.length, 'richiesta ancora aperta', 'richieste ancora aperte')} di ${plurale(s.apertePerCoordinatore.length, 'coordinatore', 'coordinatori')}`}
                  >
                    Prima di chiudere verifica qui sotto le richieste aperte, raggruppate per coordinatore: dopo la chiusura non saranno più gestibili per questo
                    mese.
                  </Avviso>
                )}
                {chiuso && s.daInviare === 0 && s.chiusura.filePaghe.length > 0 && (
                  <Avviso tono="successo">Tutte le richieste incluse nella chiusura sono state inviate a Payroll.</Avviso>
                )}
                {chiuso && s.daInviare === 0 && s.chiusura.filePaghe.length === 0 && <Avviso tono="info">Nessuna richiesta validata da inviare a Payroll per questo mese.</Avviso>}
                <div className="barra-azioni" style={{ justifyContent: 'flex-start' }}>
                  <Pulsante icona="lucchetto" disabled={chiuso || futuro || azione.inCorso} onClick={() => void chiudi()} title={chiuso ? 'Il mese è già chiuso' : undefined}>
                    Chiudi il mese
                  </Pulsante>
                  <Pulsante
                    variante="successo"
                    icona="file"
                    disabled={!chiuso || s.daInviare === 0 || azione.inCorso}
                    onClick={() => void genera()}
                    title={!chiuso ? 'Prima chiudi il mese' : s.daInviare === 0 ? 'Nessuna richiesta da inviare' : undefined}
                  >
                    Genera file paghe{chiuso && s.daInviare > 0 ? ` (${s.daInviare})` : ''}
                  </Pulsante>
                  {admin && chiuso && (
                    <Pulsante variante="pericolo" icona="sbloccato" disabled={azione.inCorso} onClick={() => void riapri()}>
                      Riapri il mese
                    </Pulsante>
                  )}
                </div>
                {!admin && chiuso && <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>Solo un amministratore può riaprire un mese chiuso.</p>}
                {fileNuovo && (
                  <Avviso tono="successo" titolo={`File generato: ${fileNuovo.nome}`}>
                    {plurale(fileNuovo.righe, 'riga', 'righe')} · {f.numero(fileNuovo.totaleOreRetribuite)} h retribuite · {f.numero(fileNuovo.totaleOreGettone)} h gettone ·{' '}
                    {f.numero(fileNuovo.totaleOreNonRetribuite)} h non retribuite · {f.numero(fileNuovo.totaleOrePermessi)} h di permesso.
                    <div style={{ marginTop: 8 }}>
                      <Pulsante piccolo icona="scarica" onClick={() => f.scaricaFile(fileNuovo.nome, fileNuovo.contenuto)}>
                        Scarica ora
                      </Pulsante>
                    </div>
                  </Avviso>
                )}
              </div>
            </Scheda>

            <SezioneAperte s={s} />
            <AnteprimaPaghe s={s} anno={anno} mese={mese} lavoratori={anagrafiche.dati?.lavoratori} />
            <SezioneAnomalie anomalie={s.anomalie} lavoratori={anagrafiche.dati?.lavoratori} onAggiorna={ricaricaTutto} />

            <Scheda titolo="File paghe generati" icona="file">
              {s.chiusura.filePaghe.length === 0 ? (
                <Vuoto titolo="Nessun file generato per questo mese." icona="file" />
              ) : (
                <div className="gestione-tabella tabella-compatta">
                  <Tabella
                    didascalia={`File paghe di ${nomePeriodo}`}
                    righe={[...s.chiusura.filePaghe].reverse()}
                    chiave={(x) => x.id}
                    colonne={[
                      { titolo: 'File', valore: (x) => <span className="cella-principale testo-a-capo">{x.nome}</span> },
                      { titolo: 'Versione', valore: (x) => x.versione, numerica: true },
                      { titolo: 'Generato il', valore: (x) => f.dataOra(x.generatoIl) },
                      { titolo: 'Da', valore: (x) => nomeUtente(utenti, x.generatoDa), secondaria: true },
                      { titolo: 'Righe', valore: (x) => x.righe, numerica: true },
                      { titolo: 'Ore retribuite', valore: (x) => f.numero(x.totaleOreRetribuite), numerica: true },
                      { titolo: 'Ore gettone', valore: (x) => f.numero(x.totaleOreGettone), numerica: true },
                      { titolo: 'Ore non retribuite', valore: (x) => f.numero(x.totaleOreNonRetribuite ?? 0), numerica: true },
                      { titolo: 'Ore di permesso', valore: (x) => f.numero(x.totaleOrePermessi ?? 0), numerica: true },
                    ]}
                    azioni={(x) => <PulsanteIcona icona="scarica" etichetta={`Scarica ${x.nome}`} disabled={azione.inCorso} onClick={() => void scarica(s.chiusura.periodo, x)} />}
                  />
                </div>
              )}
            </Scheda>

            {s.chiusura.riaperture.length > 0 && (
              <Scheda titolo="Riaperture del mese" icona="storico">
                <ol className="cronologia">
                  {[...s.chiusura.riaperture].reverse().map((r) => (
                    <li key={r.data}>
                      <time dateTime={r.data}>{f.dataOra(r.data)}</time> – <strong>{nomeUtente(utenti, r.utente)}</strong>
                      <div>{r.motivo}</div>
                    </li>
                  ))}
                </ol>
              </Scheda>
            )}
          </>
        )
      )}

      <Scheda titolo="Storico delle chiusure" icona="storico">
        {storico.errore ? (
          <ErroreCaricamento messaggio={storico.errore} onRiprova={storico.ricarica} />
        ) : !storico.dati ? (
          <Caricamento />
        ) : (
          <div className="gestione-tabella tabella-compatta">
            <Tabella
              didascalia="Storico delle chiusure mensili"
              righe={[...storico.dati].sort((a, b) => b.periodo.localeCompare(a.periodo))}
              chiave={(c) => c.periodo}
              onApri={(c) => cambiaPeriodo({ anno: c.anno, mese: c.mese })}
              vuoto="Nessun mese chiuso finora."
              colonne={[
                {
                  titolo: 'Periodo',
                  valore: (c) => (
                    <span className="cella-principale">
                      {f.periodo(c.anno, c.mese)}
                      {c.anno === anno && c.mese === mese && <span className="sr-only"> (selezionato)</span>}
                    </span>
                  ),
                },
                { titolo: 'Stato', valore: (c) => <EtichettaPeriodo stato={c.stato} /> },
                { titolo: 'Chiuso il', valore: (c) => f.dataOra(c.dataChiusura) },
                { titolo: 'Da', valore: (c) => (c.utenteChiusura ? nomeUtente(utenti, c.utenteChiusura) : '—'), secondaria: true },
                { titolo: 'Richieste', valore: (c) => c.numeroRichieste, numerica: true },
                { titolo: 'Ore retribuite', valore: (c) => f.numero(c.totaleOreRiconosciute), numerica: true },
                { titolo: 'Ore gettone', valore: (c) => f.numero(c.totaleGettoni), numerica: true },
                { titolo: 'Ore non retribuite', valore: (c) => f.numero(c.totaleOreNonRetribuite ?? 0), numerica: true, secondaria: true },
                { titolo: 'Ore di permesso', valore: (c) => f.numero(c.totaleOrePermessi ?? 0), numerica: true, secondaria: true },
                { titolo: 'File paghe', valore: (c) => c.filePaghe.length, numerica: true, secondaria: true },
              ]}
              azioni={(c) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${f.periodo(c.anno, c.mese)}`} onClick={() => cambiaPeriodo({ anno: c.anno, mese: c.mese })} />}
            />
          </div>
        )}
      </Scheda>
    </Pagina>
  );
}

function conteggioPerStato(stati: StatoRichiesta[]): [StatoRichiesta, number][] {
  const m = new Map<StatoRichiesta, number>();
  for (const s of stati) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function EtichettaPeriodo({ stato }: { stato: StatoPeriodo }) {
  return <Etichetta tono={stato === 'Chiuso' ? 'successo' : stato === 'Riaperto' ? 'avviso' : 'info'}>{stato}</Etichetta>;
}

// ---------------------------------------------------------------------------
//  Stato del periodo
// ---------------------------------------------------------------------------
function SchedaStato({ s, nomePeriodo, utenti, futuro }: { s: StatoMese; nomePeriodo: string; utenti: Parameters<typeof nomeUtente>[0]; futuro: boolean }) {
  const c = s.chiusura;
  const ultimaRiapertura = c.riaperture[c.riaperture.length - 1];
  return (
    <Scheda titolo={`Stato di ${nomePeriodo}`} icona="calendario">
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="riga-flessibile">
          <span className={`stato-periodo stato-periodo-${c.stato}`}>
            <Icona nome={ICONA_STATO[c.stato]} /> {c.stato}
          </span>
          {futuro && <Etichetta tono="neutro">Mese futuro</Etichetta>}
        </div>
        {c.stato === 'Riaperto' && ultimaRiapertura && (
          <Avviso tono="avviso" titolo="Mese riaperto">
            Riaperto il {f.dataOra(ultimaRiapertura.data)} da {nomeUtente(utenti, ultimaRiapertura.utente)}: «{ultimaRiapertura.motivo}». Al termine delle correzioni chiudi di nuovo
            il mese.
          </Avviso>
        )}
        <dl className="elenco-dati">
          <div>
            <dt>Periodo</dt>
            <dd>
              {nomePeriodo} ({c.periodo})
            </dd>
          </div>
          <div>
            <dt>Data chiusura</dt>
            <dd>{f.dataOra(c.dataChiusura)}</dd>
          </div>
          <div>
            <dt>Chiuso da</dt>
            <dd>{c.utenteChiusura ? nomeUtente(utenti, c.utenteChiusura) : '—'}</dd>
          </div>
          <div>
            <dt>Richieste incluse</dt>
            <dd>{c.numeroRichieste}</dd>
          </div>
          <div>
            <dt>Totale ore retribuite riconosciute</dt>
            <dd>{f.ore(c.totaleOreRiconosciute)}</dd>
          </div>
          <div>
            <dt>Totale ore gettone</dt>
            <dd>{f.ore(c.totaleGettoni)}</dd>
          </div>
          <div>
            <dt>Totale ore non retribuite</dt>
            <dd>{f.ore(c.totaleOreNonRetribuite ?? 0)}</dd>
          </div>
          <div>
            <dt>Totale ore di permesso</dt>
            <dd>{f.ore(c.totaleOrePermessi ?? 0)}</dd>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Note HR</dt>
            <dd>{c.noteHR || '—'}</dd>
          </div>
        </dl>
        <div className="indicatori indicatori-compatti">
          <Indicatore
            etichetta="Richieste ancora aperte"
            valore={s.aperte.length}
            nota={s.aperte.length ? `Di ${plurale(s.apertePerCoordinatore.length, 'coordinatore', 'coordinatori')}` : undefined}
            tono={s.aperte.length ? 'avviso' : 'successo'}
          />
          <Indicatore etichetta="Validate, da includere" valore={s.validate} nota="Saranno incluse alla chiusura" tono="info" />
          <Indicatore etichetta="Pronte per il file paghe" valore={s.daInviare} tono={s.daInviare ? 'avviso' : 'neutro'} />
          <Indicatore etichetta="Anomalie" valore={s.anomalie.length} tono={s.anomalie.some((a) => a.gravita === 'alta') ? 'pericolo' : s.anomalie.length ? 'avviso' : 'successo'} />
        </div>
      </div>
    </Scheda>
  );
}

// ---------------------------------------------------------------------------
//  Richieste ancora aperte, raggruppate per coordinatore
// ---------------------------------------------------------------------------
/** Chiave usata per filtrare l'elenco: il login del coordinatore, o '-' per le richieste senza coordinatore. */
const chiaveCoordinatore = (login?: string) => login ?? '-';

/** Dettaglio in parole di un gruppo, es. "4 in attesa del coordinatore, 1 in integrazione dal lavoratore". */
function dettaglioGruppo(g: Pick<ApertePerCoordinatore, 'inAttesaCoordinatore' | 'inIntegrazione' | 'inAttesaHR'>): string {
  return [
    g.inAttesaCoordinatore && `${g.inAttesaCoordinatore} in attesa del coordinatore`,
    g.inIntegrazione && `${g.inIntegrazione} in integrazione dal lavoratore`,
    g.inAttesaHR && `${g.inAttesaHR} in attesa di HR`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Elenco compatto per il dialogo di conferma della chiusura: un coordinatore per riga. */
function ElencoPerCoordinatore({ gruppi }: { gruppi: ApertePerCoordinatore[] }) {
  return (
    <ul className="elenco-coordinatori">
      {gruppi.map((g) => (
        <li key={chiaveCoordinatore(g.coordinatoreLogin)}>
          <strong>{g.coordinatoreNome}</strong> – {plurale(g.totale, 'richiesta aperta', 'richieste aperte')}
          <span className="cella-secondaria">{dettaglioGruppo(g)}</span>
        </li>
      ))}
    </ul>
  );
}

const RIGA_TOTALE = '__totale__';

/**
 * Riepilogo delle richieste aperte per coordinatore: chi deve ancora esprimersi e su quante richieste.
 * Da ogni riga si filtra l'elenco sottostante sulle richieste di quel coordinatore.
 */
function TabellaPerCoordinatore({ gruppi, selezionato, onSeleziona }: { gruppi: ApertePerCoordinatore[]; selezionato: string; onSeleziona: (chiave: string) => void }) {
  const totale: ApertePerCoordinatore = gruppi.reduce(
    (t, g) => ({ ...t, inAttesaCoordinatore: t.inAttesaCoordinatore + g.inAttesaCoordinatore, inIntegrazione: t.inIntegrazione + g.inIntegrazione, inAttesaHR: t.inAttesaHR + g.inAttesaHR, totale: t.totale + g.totale }),
    { coordinatoreLogin: RIGA_TOTALE, coordinatoreNome: 'Totale', inAttesaCoordinatore: 0, inIntegrazione: 0, inAttesaHR: 0, totale: 0 },
  );
  const righe = gruppi.length > 1 ? [...gruppi, totale] : gruppi;
  const eTotale = (g: ApertePerCoordinatore) => g.coordinatoreLogin === RIGA_TOTALE;
  const numero = (g: ApertePerCoordinatore, n: number, evidenzia = false) =>
    n ? eTotale(g) || evidenzia ? <strong className="riga-totale">{n}</strong> : n : <span className="testo-secondario">–</span>;
  return (
    <div className="gestione-tabella tabella-compatta">
      <Tabella
        didascalia="Richieste ancora aperte per coordinatore"
        righe={righe}
        chiave={(g) => chiaveCoordinatore(g.coordinatoreLogin)}
        colonne={[
          {
            titolo: 'Coordinatore',
            valore: (g) => (
              <span className="cella-blocco">
                <span className="cella-principale testo-a-capo">{g.coordinatoreNome}</span>
                {selezionato === chiaveCoordinatore(g.coordinatoreLogin) && (
                  <span className="cella-secondaria">
                    <Etichetta tono="info">Elenco filtrato</Etichetta>
                  </span>
                )}
              </span>
            ),
          },
          { titolo: 'In attesa del coordinatore', valore: (g) => numero(g, g.inAttesaCoordinatore, true), numerica: true },
          { titolo: 'In integrazione dal lavoratore', valore: (g) => numero(g, g.inIntegrazione), numerica: true },
          { titolo: 'In attesa di HR', valore: (g) => numero(g, g.inAttesaHR), numerica: true },
          { titolo: 'Totale aperte', valore: (g) => <strong className="riga-totale">{g.totale}</strong>, numerica: true },
        ]}
        azioni={(g) => {
          if (eTotale(g)) return null;
          const chiave = chiaveCoordinatore(g.coordinatoreLogin);
          const attivo = selezionato === chiave;
          return (
            <Pulsante variante="secondario" piccolo aria-pressed={attivo} onClick={() => onSeleziona(attivo ? '' : chiave)}>
              {attivo ? 'Mostra tutte' : 'Mostra le richieste'}
              <span className="sr-only"> di {g.coordinatoreNome}</span>
            </Pulsante>
          );
        }}
      />
    </div>
  );
}

function SezioneAperte({ s }: { s: StatoMese }) {
  const [coordinatore, setCoordinatore] = useState('');
  const daValidare = s.aperte.filter((r) => r.stato === 'In attesa di validazione HR' || r.stato === 'Approvata dal coordinatore').length;
  // se il coordinatore selezionato non ha più richieste aperte (dopo un aggiornamento) si torna all'elenco completo
  const filtro = s.apertePerCoordinatore.some((g) => chiaveCoordinatore(g.coordinatoreLogin) === coordinatore) ? coordinatore : '';
  const elenco = (filtro ? s.aperte.filter((r) => chiaveCoordinatore(r.coordinatoreLogin) === filtro) : s.aperte)
    .slice()
    .sort((a, b) => (a.coordinatoreNome ?? '').localeCompare(b.coordinatoreNome ?? '', 'it') || a.stato.localeCompare(b.stato) || a.dataSessione.localeCompare(b.dataSessione));
  const nomeFiltro = s.apertePerCoordinatore.find((g) => chiaveCoordinatore(g.coordinatoreLogin) === filtro)?.coordinatoreNome;
  const perStato = conteggioPerStato(elenco.map((r) => r.stato));
  return (
    <Scheda
      titolo={`Richieste ancora aperte (${s.aperte.length})`}
      icona="orologio"
      azioni={
        daValidare > 0 && (
          <Pulsante variante="secondario" piccolo icona="valida" onClick={() => naviga(ROTTE.validazione)}>
            Vai alla validazione ({daValidare})
          </Pulsante>
        )
      }
    >
      {s.aperte.length === 0 ? (
        <Vuoto titolo="Nessuna richiesta aperta: il mese è pronto per la chiusura." icona="approva" />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <section aria-label="Richieste aperte per coordinatore" style={{ display: 'grid', gap: 8 }}>
            <h3 className="testatina">Per coordinatore</h3>
            <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>
              Chi deve ancora esprimersi, dal più carico: le richieste «in attesa del coordinatore» sono quelle da sollecitare prima della chiusura.
            </p>
            <TabellaPerCoordinatore gruppi={s.apertePerCoordinatore} selezionato={filtro} onSeleziona={setCoordinatore} />
          </section>
          <section aria-label="Elenco delle richieste aperte" style={{ display: 'grid', gap: 8 }}>
            <h3 className="testatina">{nomeFiltro ? `Richieste aperte di ${nomeFiltro} (${elenco.length})` : `Tutte le richieste aperte (${elenco.length})`}</h3>
            <div className="riga-flessibile">
              {perStato.map(([st, n]) => (
                <span key={st} className="riga-flessibile" style={{ gap: 4 }}>
                  <BadgeStato stato={st} /> <strong>{n}</strong>
                </span>
              ))}
            </div>
            <div className="gestione-tabella tabella-compatta tabella-fitta">
              <Tabella
                didascalia="Richieste ancora aperte nel mese"
                righe={elenco}
                chiave={(r) => r.id}
                onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
                colonne={[
                  { titolo: 'Coordinatore', valore: (r) => r.coordinatoreNome ?? 'Senza coordinatore' },
                  { titolo: 'Richiesta', valore: (r) => <span className="cella-principale">{r.numero}</span> },
                  { titolo: 'Lavoratore', valore: (r) => nominativo(r) },
                  { titolo: 'Tipologia e corso / attività', valore: (r) => <CellaTitolo r={r} />, secondaria: true },
                  { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                  { titolo: 'Stato', valore: (r) => <BadgeStato stato={r.stato} /> },
                ]}
                azioni={(r) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />}
              />
            </div>
          </section>
          <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>
            Le bozze non ancora inviate dai lavoratori non sono conteggiate.
          </p>
        </div>
      )}
    </Scheda>
  );
}

// ---------------------------------------------------------------------------
//  Anteprima del file per l'Ufficio Paghe
// ---------------------------------------------------------------------------
const RIGHE_ANTEPRIMA = 12;

/**
 * Anteprima delle righe che finiranno nel file paghe, con le stesse colonne del CSV:
 * prima della chiusura mostra le richieste già validate da HR; a mese chiuso quelle incluse
 * nella chiusura e non ancora inviate.
 */
function AnteprimaPaghe({ s, anno, mese, lavoratori }: { s: StatoMese; anno: number; mese: number; lavoratori: Lavoratore[] | undefined }) {
  const { backend } = useApp();
  const chiuso = s.chiusura.stato === 'Chiuso';
  const quante = chiuso ? s.daInviare : s.validate;
  const [tutte, setTutte] = useState(false);
  // si ricarica quando cambia il numero di richieste interessate (es. dopo la chiusura o la generazione del file)
  const richieste = useCarica(async () => (quante > 0 ? backend.getRichieste('tutte', { anno, mese }) : []), [backend, anno, mese, quante, chiuso]);

  const righe = useMemo(() => {
    const incluse = (richieste.dati ?? []).filter((r) =>
      chiuso ? r.stato === 'Inclusa nel riepilogo mensile' && r.periodoChiusura === s.chiusura.periodo : r.stato === 'Validata da HR',
    );
    return righePaghe(incluse, lavoratori ?? []);
  }, [richieste.dati, lavoratori, chiuso, s.chiusura.periodo]);
  const totali = useMemo(() => totaliPaghe(righe), [righe]);
  const dirittoStudio = righe.reduce((t, r) => t + r.oreDirittoStudio, 0);
  const riqualifica = righe.reduce((t, r) => t + r.oreRiqualifica, 0);

  if (quante === 0) return null;
  const visibili = tutte ? righe : righe.slice(0, RIGHE_ANTEPRIMA);
  const zero = (n: number) => (n ? f.numero(n) : <span className="testo-secondario">–</span>);
  return (
    <Scheda titolo={`Anteprima del file paghe (${righe.length})`} icona="file">
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="testo-secondario" style={{ margin: 0 }}>
          {chiuso
            ? 'Righe che saranno scritte nel file alla generazione: richieste validate da HR e incluse nella chiusura.'
            : 'Richieste già validate da HR: alla chiusura del mese saranno incluse nel riepilogo e poi nel file paghe. Le richieste ancora aperte restano escluse.'}
        </p>
        {richieste.errore ? (
          <ErroreCaricamento messaggio={richieste.errore} onRiprova={richieste.ricarica} />
        ) : richieste.caricamento && !richieste.dati ? (
          <Caricamento testo="Preparazione dell’anteprima…" />
        ) : (
          <>
            <div className="indicatori indicatori-compatti indicatori-cinque" role="group" aria-label="Totali del file paghe">
              <Indicatore etichetta="Ore retribuite" valore={f.numero(totali.oreRetribuite)} tono="successo" />
              <Indicatore etichetta="Ore gettone" valore={f.numero(totali.oreGettone)} tono="successo" />
              <Indicatore etichetta="Ore non retribuite" valore={f.numero(totali.oreNonRetribuite)} />
              <Indicatore etichetta="Ore diritto allo studio" valore={f.numero(dirittoStudio)} tono="info" />
              <Indicatore etichetta="Ore riqualifica professionale" valore={f.numero(riqualifica)} tono="info" />
            </div>
            <div className="gestione-tabella tabella-compatta tabella-fitta">
              <Tabella<RigaPaghe>
                didascalia="Anteprima delle righe del file paghe"
                righe={visibili}
                chiave={(r) => r.idRichiesta}
                vuoto="Nessuna riga da mostrare."
                colonne={[
                  {
                    titolo: 'Lavoratore',
                    valore: (r) => (
                      <span className="cella-blocco">
                        <span className="cella-principale">
                          {r.cognome} {r.nome}
                        </span>
                        <span className="cella-secondaria">{r.codiceFiscale || <strong style={{ color: 'var(--pericolo)' }}>Codice fiscale mancante</strong>}</span>
                      </span>
                    ),
                  },
                  {
                    titolo: 'Servizio',
                    secondaria: true,
                    valore: (r) => (
                      <span className="cella-blocco testo-a-capo">
                        {r.servizio}
                        <span className="cella-secondaria">{r.centroDiCosto}</span>
                      </span>
                    ),
                  },
                  {
                    titolo: 'Tipologia, titolo e data',
                    valore: (r) => (
                      <span className="cella-titolo-corso testo-a-capo">
                        {r.titoloCorso}
                        <span className="cella-secondaria">
                          {r.tipologia === 'Formazione' ? 'Formazione' : <Etichetta tono="info">{r.tipologia}</Etichetta>} · {f.data(r.dataCorso)}
                        </span>
                        <span className="cella-secondaria">{r.idRichiesta}</span>
                      </span>
                    ),
                  },
                  { titolo: 'Ore retribuite', valore: (r) => zero(r.oreRetribuite), numerica: true },
                  { titolo: 'Ore gettone', valore: (r) => zero(r.oreGettone), numerica: true },
                  { titolo: 'Ore non retribuite', valore: (r) => zero(r.oreNonRetribuite), numerica: true },
                  { titolo: 'Ore diritto allo studio', valore: (r) => zero(r.oreDirittoStudio), numerica: true },
                  { titolo: 'Ore riqualifica professionale', valore: (r) => zero(r.oreRiqualifica), numerica: true },
                ]}
              />
            </div>
            {righe.length > RIGHE_ANTEPRIMA && (
              <div className="riga-flessibile">
                <span className="testo-secondario testo-piccolo">
                  Mostrate {visibili.length} di {righe.length} righe
                </span>
                <Pulsante variante="secondario" piccolo onClick={() => setTutte(!tutte)}>
                  {tutte ? 'Mostra meno righe' : 'Mostra tutte le righe'}
                </Pulsante>
              </div>
            )}
            <details className="colonne-file">
              <summary>Colonne del file CSV ({INTESTAZIONE_PAGHE.length})</summary>
              <p className="testo-piccolo" style={{ margin: '8px 0 0' }}>
                {INTESTAZIONE_PAGHE.join(' · ')}
              </p>
              <p className="testo-secondario testo-piccolo" style={{ margin: '6px 0 0' }}>
                Separatore «;», decimali con la virgola, codifica UTF-8: il file si apre direttamente in Excel. Per i permessi le ore validate sono nella colonna
                del proprio tipo; le colonne retribuite e gettone restano a zero.
              </p>
            </details>
          </>
        )}
      </div>
    </Scheda>
  );
}

// ---------------------------------------------------------------------------
//  Anomalie, raggruppate per tipo
// ---------------------------------------------------------------------------
function SezioneAnomalie({ anomalie, lavoratori, onAggiorna }: { anomalie: Anomalia[]; lavoratori: Lavoratore[] | undefined; onAggiorna: () => Promise<void> }) {
  const { backend, ha } = useApp();
  const azione = useAzione();
  const gruppi = useMemo(() => {
    const m = new Map<TipoAnomalia, Anomalia[]>();
    for (const a of anomalie) m.set(a.tipo, [...(m.get(a.tipo) ?? []), a]);
    return [...m.entries()];
  }, [anomalie]);

  const gestisci = async (lavoratoreId: string, indice: number) => {
    if (await azione.prova(async () => (await backend.chiudiSegnalazione(lavoratoreId, indice), true), 'Segnalazione segnata come gestita.')) await onAggiorna();
  };

  return (
    <Scheda titolo={`Anomalie (${anomalie.length})`} icona="avviso">
      {anomalie.length === 0 ? (
        <Vuoto titolo="Nessuna anomalia rilevata per questo mese." icona="approva" />
      ) : (
        gruppi.map(([tipo, elenco]) => {
          const gravita = elenco[0]?.gravita ?? 'media';
          return (
            <section key={tipo} className={`gruppo-anomalie gravita-${gravita}`} aria-label={ETICHETTA_ANOMALIA[tipo]}>
              <h3>
                {ETICHETTA_ANOMALIA[tipo]} <Etichetta tono={TONO_GRAVITA[gravita]}>{ETICHETTA_GRAVITA[gravita]}</Etichetta>
                <span className="testo-secondario testo-piccolo">{plurale(elenco.length, 'caso', 'casi')}</span>
              </h3>
              <ul>
                {elenco.map((a, i) => {
                  const lav = a.lavoratoreId ? lavoratori?.find((l) => l.id === a.lavoratoreId) : undefined;
                  const segnalazioniAperte = tipo === 'segnalazioneAperta' && lav ? lav.segnalazioni.map((x, indice) => ({ ...x, indice })).filter((x) => x.aperta) : [];
                  return (
                    <li key={`${a.richiestaId ?? a.lavoratoreId ?? ''}-${i}`}>
                      <span className="segnalazione-testo">
                        {a.descrizione}
                        {segnalazioniAperte.map((x) => (
                          <span key={x.indice} className="cella-secondaria">
                            «{x.testo}» ({f.dataOra(x.data)})
                          </span>
                        ))}
                      </span>
                      <span className="riga-flessibile">
                        {a.richiestaId && (
                          <a href={`#${ROTTE.dettaglio(a.richiestaId)}`}>
                            Apri la richiesta
                          </a>
                        )}
                        {segnalazioniAperte.map((x) => (
                          <Pulsante key={x.indice} variante="secondario" piccolo icona="approva" disabled={azione.inCorso} onClick={() => void gestisci(a.lavoratoreId!, x.indice)}>
                            Segna come gestita
                          </Pulsante>
                        ))}
                        {a.lavoratoreId && ha('admin') && (
                          <a href={`#${ROTTE.amministrazione('lavoratori')}?lavoratore=${encodeURIComponent(a.lavoratoreId)}`}>Apri l’anagrafica</a>
                        )}
                        {a.lavoratoreId && !ha('admin') && tipo === 'codiceFiscaleMancante' && (
                          <span className="testo-secondario testo-piccolo">Da registrare nel profilo del lavoratore o dall’amministratore</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </Scheda>
  );
}
