/**
 * Schermata 8 – Chiusura mensile HR e file per l'Ufficio Paghe (Flusso 6).
 *
 * HR verifica le richieste ancora aperte e le anomalie del mese, chiude il mese (da quel momento
 * nessuna modifica è più consentita), genera il file paghe e lo scarica dall'archivio.
 * Solo l'amministratore può riaprire eccezionalmente un mese chiuso, indicando il motivo.
 */
import { useMemo, useState } from 'react';
import type { StatoMese } from '../../data/api';
import {
  ETICHETTA_ANOMALIA,
  mesePrecedente,
  type Anomalia,
  type FilePaghe,
  type Lavoratore,
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
import { nominativo, nomeUtente, oggiAnnoMese, opzioniAnni, OPZIONI_MESI, titoloCorso } from './gestione/comuni';
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
    const perStato = conteggioPerStato(s.aperte.map((r) => r.stato));
    const esito = await conferma({
      titolo: `Chiudere ${nomePeriodo}?`,
      pericolo: s.aperte.length > 0,
      etichettaConferma: 'Chiudi il mese',
      testo: (
        <>
          {s.aperte.length > 0 ? (
            <Avviso tono="pericolo" titolo={`Attenzione: ${plurale(s.aperte.length, 'richiesta è ancora aperta', 'richieste sono ancora aperte')}`}>
              <ul className="elenco-compatto">
                {perStato.map(([st, n]) => (
                  <li key={st}>
                    {n} – {st}
                  </li>
                ))}
              </ul>
              <p style={{ margin: '6px 0 0' }}>
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
            {nomePeriodo}.
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
                  <Avviso tono="avviso" titolo={`${plurale(s.aperte.length, 'richiesta ancora aperta', 'richieste ancora aperte')}`}>
                    Prima di chiudere verifica le richieste aperte qui sotto: dopo la chiusura non saranno più gestibili per questo mese.
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
                    {plurale(fileNuovo.righe, 'riga', 'righe')} · {f.numero(fileNuovo.totaleOreRetribuite)} h retribuite · {f.numero(fileNuovo.totaleOreGettone)} h gettone.
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
            <SezioneAnomalie anomalie={s.anomalie} lavoratori={anagrafiche.dati?.lavoratori} onAggiorna={ricaricaTutto} />

            <Scheda titolo="File paghe generati" icona="file">
              {s.chiusura.filePaghe.length === 0 ? (
                <Vuoto titolo="Nessun file generato per questo mese." icona="file" />
              ) : (
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
                  ]}
                  azioni={(x) => <PulsanteIcona icona="scarica" etichetta={`Scarica ${x.nome}`} disabled={azione.inCorso} onClick={() => void scarica(s.chiusura.periodo, x)} />}
                />
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
              { titolo: 'File paghe', valore: (c) => c.filePaghe.length, numerica: true, secondaria: true },
            ]}
            azioni={(c) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${f.periodo(c.anno, c.mese)}`} onClick={() => cambiaPeriodo({ anno: c.anno, mese: c.mese })} />}
          />
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
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Note HR</dt>
            <dd>{c.noteHR || '—'}</dd>
          </div>
        </dl>
        <div className="indicatori indicatori-compatti">
          <Indicatore etichetta="Richieste ancora aperte" valore={s.aperte.length} tono={s.aperte.length ? 'avviso' : 'successo'} />
          <Indicatore etichetta="Validate, da includere" valore={s.validate} nota="Saranno incluse alla chiusura" tono="info" />
          <Indicatore etichetta="Pronte per il file paghe" valore={s.daInviare} tono={s.daInviare ? 'avviso' : 'neutro'} />
          <Indicatore etichetta="Anomalie" valore={s.anomalie.length} tono={s.anomalie.some((a) => a.gravita === 'alta') ? 'pericolo' : s.anomalie.length ? 'avviso' : 'successo'} />
        </div>
      </div>
    </Scheda>
  );
}

// ---------------------------------------------------------------------------
//  Richieste ancora aperte
// ---------------------------------------------------------------------------
function SezioneAperte({ s }: { s: StatoMese }) {
  const perStato = conteggioPerStato(s.aperte.map((r) => r.stato));
  const daValidare = s.aperte.filter((r) => r.stato === 'In attesa di validazione HR' || r.stato === 'Approvata dal coordinatore').length;
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
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="riga-flessibile">
            {perStato.map(([st, n]) => (
              <span key={st} className="riga-flessibile" style={{ gap: 4 }}>
                <BadgeStato stato={st} /> <strong>{n}</strong>
              </span>
            ))}
          </div>
          <div className="gestione-tabella tabella-compatta">
            <Tabella
              didascalia="Richieste ancora aperte nel mese"
              righe={[...s.aperte].sort((a, b) => a.stato.localeCompare(b.stato) || a.dataSessione.localeCompare(b.dataSessione))}
              chiave={(r) => r.id}
              onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
              colonne={[
                { titolo: 'Richiesta', valore: (r) => <span className="cella-principale">{r.numero}</span> },
                { titolo: 'Lavoratore', valore: (r) => nominativo(r) },
                { titolo: 'Coordinatore', valore: (r) => r.coordinatoreNome ?? '—', secondaria: true },
                { titolo: 'Corso', valore: (r) => <span className="cella-titolo-corso testo-a-capo">{titoloCorso(r)}</span>, secondaria: true },
                { titolo: 'Data corso', valore: (r) => f.data(r.dataSessione) },
                { titolo: 'Stato', valore: (r) => <BadgeStato stato={r.stato} /> },
              ]}
              azioni={(r) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />}
            />
          </div>
          <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>
            Le bozze non ancora inviate dai lavoratori non sono conteggiate.
          </p>
        </div>
      )}
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
