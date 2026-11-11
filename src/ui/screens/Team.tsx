/**
 * Schermata 4 – Richieste del team (coordinatore).
 *
 * Mostra solo le richieste dei lavoratori assegnati al coordinatore (il filtro è applicato
 * dal backend): formazione e permessi con monte ore (diritto allo studio, riqualifica
 * professionale). Le richieste da approvare compaiono per prime; dalla riga si apre il dettaglio,
 * dove il coordinatore approva, respinge o chiede un'integrazione.
 *
 * Nella scheda «Il mio team» il coordinatore vede i lavoratori assegnati e può segnalare a HR
 * una variazione dell'organigramma (trasferimenti, nuovi ingressi, servizio errato) per un
 * lavoratore del team o per se stesso.
 */
import { useMemo, useState, type ChangeEvent } from 'react';
import type { LavoratoreTeam } from '../../data/api';
import { calcolaKPI, filtraRichieste, IN_ATTESA_COORDINATORE, MAX_LUNGHEZZA_NOTE, STATI_RICHIESTA, type Richiesta, type StatoRichiesta } from '../../domain';
import {
  Avviso,
  BadgeStato,
  BarraFiltri,
  Caricamento,
  CampoArea,
  CampoSelezione,
  Dialogo,
  ErroreCaricamento,
  Etichetta,
  Indicatore,
  Pagina,
  Pulsante,
  PulsanteIcona,
  Schede,
  Tabella,
} from '../components/ui';
import { useApp } from '../contesto';
import * as f from '../format';
import { messaggioErrore, useAzione, useCarica } from '../hooks';
import { naviga, parametriQuery, ROTTE } from '../router';
import {
  CellaTitolo,
  comeTipologia,
  LegendaVoci,
  nominativo,
  oggiAnnoMese,
  opzioniAnni,
  opzioniDistinte,
  OPZIONI_MESI,
  OPZIONI_TIPOLOGIA,
  Segnali,
  segnaliRichiesta,
  testoVoci,
  TOLLERANZA_ORE,
  unisciOpzioni,
  vociCoordinatore,
  vociHR,
  VociOre,
  vociRichieste,
} from './gestione/comuni';
import '../../styles/gestione.css';

/** Valore speciale del filtro "stato": tutte le richieste in attesa del coordinatore. */
const ATTESA = 'attesa';
/** Lunghezza minima del testo di una segnalazione (stessa regola del backend). */
const MINIMO_SEGNALAZIONE = 10;

type Sezione = 'richieste' | 'team';

interface Filtri {
  tipologia: string;
  anno: string;
  mese: string;
  login: string;
  servizio: string;
  centroDiCosto: string;
  stato: string;
}
const FILTRI_VUOTI: Filtri = { tipologia: '', anno: '', mese: '', login: '', servizio: '', centroDiCosto: '', stato: '' };

function filtriIniziali(): Filtri {
  const { anno } = oggiAnnoMese();
  const stato = parametriQuery().get('stato') ?? '';
  // Dalla home ("Da approvare") si arriva con ?stato=attesa: si mostrano tutte le richieste in attesa,
  // di qualunque anno, così il numero coincide con quello della home.
  if (stato === ATTESA) return { ...FILTRI_VUOTI, stato: ATTESA };
  return { ...FILTRI_VUOTI, anno: String(anno), stato: (STATI_RICHIESTA as readonly string[]).includes(stato) ? stato : '' };
}

/** Ore riconosciute dal coordinatore, con gli eventuali valori diversi decisi da HR. */
function OreRiconosciute({ r }: { r: Richiesta }) {
  const diversa = (a?: number, b?: number) => Math.abs((a ?? 0) - (b ?? 0)) > TOLLERANZA_ORE;
  const diverse =
    r.oreRetribuiteHR !== undefined &&
    (diversa(r.oreRetribuiteHR, r.oreRetribuiteCoord) || diversa(r.oreGettoneHR, r.oreGettoneCoord) || diversa(r.oreNonRetribuiteHR, r.oreNonRetribuiteCoord));
  return (
    <span className="cella-blocco">
      <VociOre tipologia={r.tipologia} {...vociCoordinatore(r)} />
      {diverse && <span className="cella-secondaria">HR: {testoVoci(r.tipologia, vociHR(r))}</span>}
    </span>
  );
}

export function Team() {
  const { backend, sessione } = useApp();
  const dati = useCarica(async () => {
    const [richieste, lavoratori] = await Promise.all([backend.getRichieste('team'), backend.getLavoratoriTeam()]);
    return { richieste, lavoratori };
  }, [backend, sessione.login]);

  const [sezione, setSezione] = useState<Sezione>(() => (parametriQuery().get('sezione') === 'team' ? 'team' : 'richieste'));
  const [filtri, setFiltri] = useState<Filtri>(filtriIniziali);
  const cambia = (campo: keyof Filtri) => (e: ChangeEvent<HTMLSelectElement>) => setFiltri((x) => ({ ...x, [campo]: e.target.value }));
  const azzera = () => setFiltri({ ...FILTRI_VUOTI, anno: String(oggiAnnoMese().anno) });
  /** Segnalazione in compilazione: un lavoratore del team oppure `'me'`. */
  const [segnalazione, setSegnalazione] = useState<LavoratoreTeam | 'me' | null>(null);

  const richieste = useMemo(() => dati.dati?.richieste ?? [], [dati.dati]);
  const lavoratori = useMemo(() => dati.dati?.lavoratori ?? [], [dati.dati]);
  const statoLavoratore = useMemo(() => new Map(lavoratori.map((l) => [l.login, l.stato])), [lavoratori]);

  const opzioni = useMemo(
    () => ({
      anni: opzioniAnni(richieste.map((r) => r.annoCompetenza)),
      lavoratori: unisciOpzioni(
        lavoratori.map((l) => ({ valore: l.login, etichetta: l.stato === 'Attivo' ? l.nominativo : `${l.nominativo} (non attivo)` })),
        opzioniDistinte(richieste, (r) => r.login, nominativo),
      ),
      servizi: unisciOpzioni(opzioniDistinte(lavoratori, (l) => l.servizio), opzioniDistinte(richieste, (r) => r.servizio)),
      centri: unisciOpzioni(opzioniDistinte(lavoratori, (l) => l.centroDiCosto), opzioniDistinte(richieste, (r) => r.centroDiCosto)),
      stati: [
        { valore: ATTESA, etichetta: 'Da approvare (in attesa del coordinatore)' },
        ...STATI_RICHIESTA.filter((s) => s !== 'Bozza').map((s) => ({ valore: s, etichetta: s })),
      ],
    }),
    [richieste, lavoratori],
  );

  const righe = useMemo(() => {
    const base = filtraRichieste(richieste, {
      tipologia: comeTipologia(filtri.tipologia),
      anno: filtri.anno ? Number(filtri.anno) : undefined,
      mese: filtri.mese ? Number(filtri.mese) : undefined,
      login: filtri.login || undefined,
      servizio: filtri.servizio || undefined,
      centroDiCosto: filtri.centroDiCosto || undefined,
      stato: filtri.stato && filtri.stato !== ATTESA ? (filtri.stato as StatoRichiesta) : undefined,
    });
    const filtrate = filtri.stato === ATTESA ? base.filter((r) => IN_ATTESA_COORDINATORE.has(r.stato)) : base;
    // prima le richieste da approvare (dalla più vecchia in attesa), poi le altre dalla più recente
    const inAttesa = (r: Richiesta) => (IN_ATTESA_COORDINATORE.has(r.stato) ? 1 : 0);
    return [...filtrate].sort(
      (a, b) => inAttesa(b) - inAttesa(a) || (inAttesa(a) ? b.giorniAttesa - a.giorniAttesa : 0) || b.dataSessione.localeCompare(a.dataSessione),
    );
  }, [richieste, filtri]);

  const kpi = useMemo(() => calcolaKPI(righe), [righe]);
  const daApprovare = righe.filter((r) => IN_ATTESA_COORDINATORE.has(r.stato)).length;
  const segnalazioniAperte = lavoratori.reduce((s, l) => s + l.segnalazioniAperte, 0);
  const nomeMeseFiltro = OPZIONI_MESI[Number(filtri.mese) - 1]?.etichetta;
  const descrizionePeriodo =
    filtri.anno && filtri.mese
      ? f.periodo(Number(filtri.anno), Number(filtri.mese))
      : filtri.anno
        ? `Anno ${filtri.anno}, tutti i mesi`
        : filtri.mese
          ? `${nomeMeseFiltro}, tutti gli anni`
          : 'Tutti i periodi';

  return (
    <Pagina
      titolo="Richieste del team"
      sottotitolo="Le richieste di formazione e di permesso dei lavoratori assegnati a te. Apri una richiesta per verificarla e approvarla, respingerla o chiedere un’integrazione."
      azioni={
        <Pulsante variante="secondario" icona="grafico" onClick={() => naviga(ROTTE.riepilogo)}>
          Riepilogo mensile del team
        </Pulsante>
      }
    >
      <Schede<Sezione>
        attiva={sezione}
        onCambia={setSezione}
        voci={[
          { id: 'richieste', etichetta: 'Richieste', conteggio: dati.dati ? righe.length : undefined },
          { id: 'team', etichetta: 'Il mio team', conteggio: dati.dati ? lavoratori.length : undefined },
        ]}
      />

      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}

      {sezione === 'richieste' && (
        <>
          <BarraFiltri onAzzera={azzera} conteggio={`${righe.length} ${righe.length === 1 ? 'richiesta' : 'richieste'}`}>
            <CampoSelezione etichetta="Tipologia" value={filtri.tipologia} onChange={cambia('tipologia')} vuota="Tutte" opzioni={OPZIONI_TIPOLOGIA} />
            <CampoSelezione etichetta="Mese" value={filtri.mese} onChange={cambia('mese')} vuota="Tutti" opzioni={OPZIONI_MESI} />
            <CampoSelezione etichetta="Anno" value={filtri.anno} onChange={cambia('anno')} vuota="Tutti" opzioni={opzioni.anni} />
            <CampoSelezione etichetta="Lavoratore" value={filtri.login} onChange={cambia('login')} vuota="Tutti" opzioni={opzioni.lavoratori} />
            <CampoSelezione etichetta="Servizio" value={filtri.servizio} onChange={cambia('servizio')} vuota="Tutti" opzioni={opzioni.servizi} />
            <CampoSelezione etichetta="Centro di costo" value={filtri.centroDiCosto} onChange={cambia('centroDiCosto')} vuota="Tutti" opzioni={opzioni.centri} />
            <CampoSelezione etichetta="Stato" value={filtri.stato} onChange={cambia('stato')} vuota="Tutti" opzioni={opzioni.stati} />
          </BarraFiltri>

          {dati.caricamento && !dati.dati ? (
            <Caricamento />
          ) : (
            dati.dati && (
              <>
                <div className="indicatori indicatori-compatti" role="group" aria-label={`Totali delle richieste filtrate: ${descrizionePeriodo}`}>
                  <Indicatore
                    etichetta="Da approvare"
                    valore={daApprovare}
                    nota={filtri.stato === ATTESA ? 'Filtro attivo' : 'Mostra solo queste'}
                    tono={daApprovare ? 'avviso' : 'successo'}
                    onClick={() => setFiltri((x) => ({ ...x, stato: ATTESA }))}
                  />
                  <Indicatore etichetta="Richieste" valore={kpi.richieste} nota={descrizionePeriodo} tono="info" />
                  <Indicatore
                    etichetta="Ore frequentate"
                    valore={f.numero(kpi.oreFrequentate)}
                    nota={`${kpi.lavoratori} ${kpi.lavoratori === 1 ? 'lavoratore' : 'lavoratori'}`}
                  />
                  <Indicatore
                    etichetta="Ore retribuite riconosciute"
                    valore={f.numero(kpi.oreRetribuiteCoord)}
                    nota={`Richieste: ${f.numero(kpi.oreRetribuiteRichieste)}`}
                    tono="successo"
                  />
                  <Indicatore
                    etichetta="Ore gettone riconosciute"
                    valore={f.numero(kpi.oreGettoneCoord)}
                    nota={`Richieste: ${f.numero(kpi.oreGettoneRichieste)}`}
                    tono="successo"
                  />
                  <Indicatore
                    etichetta="Ore da non retribuire"
                    valore={f.numero(kpi.oreNonRetribuiteCoord)}
                    nota={`Richieste: ${f.numero(kpi.oreNonRetribuiteRichieste)}`}
                  />
                  <Indicatore
                    etichetta="Ore di permesso riconosciute"
                    valore={f.numero(kpi.orePermessiCoord)}
                    nota={`Diritto allo studio e riqualifica · richieste: ${f.numero(kpi.orePermessiRichieste)}`}
                    tono="info"
                  />
                </div>

                <div className="gestione-tabella tabella-compatta">
                  <Tabella
                    didascalia="Richieste dei lavoratori del team"
                    righe={righe}
                    chiave={(r) => r.id}
                    onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
                    vuoto={richieste.length ? 'Nessuna richiesta corrisponde ai filtri.' : 'Il tuo team non ha ancora inviato richieste.'}
                    colonne={[
                      {
                        titolo: 'Lavoratore',
                        valore: (r) => (
                          <span className="cella-blocco">
                            <span className="cella-principale">{nominativo(r)}</span>
                            <span className="cella-secondaria">{r.numero}</span>
                          </span>
                        ),
                      },
                      { titolo: 'Tipologia e corso / attività', valore: (r) => <CellaTitolo r={r} /> },
                      { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                      {
                        titolo: 'Stato e segnalazioni',
                        valore: (r) => (
                          <span className="cella-blocco">
                            <BadgeStato stato={r.stato} />
                            <Segnali segnali={segnaliRichiesta(r)} />
                          </span>
                        ),
                      },
                      { titolo: 'Ore frequentate', valore: (r) => f.numero(r.oreFrequentate), numerica: true },
                      { titolo: 'Ore richieste', valore: (r) => <VociOre tipologia={r.tipologia} {...vociRichieste(r)} />, numerica: true },
                      { titolo: 'Ore riconosciute', valore: (r) => <OreRiconosciute r={r} />, numerica: true },
                      {
                        titolo: 'Stato lavoratore',
                        secondaria: true,
                        valore: (r) => {
                          const s = statoLavoratore.get(r.login);
                          return s ? (
                            <Etichetta tono={s === 'Attivo' ? 'successo' : 'neutro'}>{s}</Etichetta>
                          ) : (
                            <span className="testo-secondario" title="Lavoratore non più assegnato a te">
                              Non assegnato
                            </span>
                          );
                        },
                      },
                    ]}
                    azioni={(r) =>
                      IN_ATTESA_COORDINATORE.has(r.stato) ? (
                        <PulsanteIcona icona="approva" variante="successo" etichetta={`Apri per approvare ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />
                      ) : (
                        <PulsanteIcona icona="visualizza" etichetta={`Visualizza ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />
                      )
                    }
                  />
                </div>
                {righe.length > 0 && <LegendaVoci />}
              </>
            )
          )}
        </>
      )}

      {sezione === 'team' &&
        (dati.caricamento && !dati.dati ? (
          <Caricamento />
        ) : (
          dati.dati && (
            <>
              <Avviso tono="info" titolo="L’organigramma non è aggiornato?">
                Se un lavoratore è stato trasferito, ha cambiato servizio, non è più nel tuo gruppo oppure manca un nuovo ingresso, segnalalo all’Ufficio
                HR/Formazione: l’anagrafica viene aggiornata da HR e fino ad allora le richieste continuano ad arrivare al coordinatore registrato.
                <div style={{ marginTop: 10 }}>
                  <Pulsante variante="secondario" piccolo icona="utente" onClick={() => setSegnalazione('me')}>
                    Segnala una variazione che riguarda me
                  </Pulsante>
                </div>
              </Avviso>

              <div className="indicatori indicatori-compatti" role="group" aria-label="Il mio team in sintesi">
                <Indicatore etichetta="Lavoratori assegnati" valore={lavoratori.length} tono="info" />
                <Indicatore etichetta="Attivi" valore={lavoratori.filter((l) => l.stato === 'Attivo').length} tono="successo" />
                <Indicatore
                  etichetta="Segnalazioni in attesa di HR"
                  valore={segnalazioniAperte}
                  nota="Variazioni segnalate e non ancora gestite"
                  tono={segnalazioniAperte ? 'avviso' : 'neutro'}
                />
              </div>

              <div className="gestione-tabella">
                <Tabella
                  didascalia="Lavoratori assegnati a te"
                  righe={lavoratori}
                  chiave={(l) => l.id}
                  vuoto="Non risultano lavoratori assegnati a te: se non è corretto, segnalalo all’Ufficio HR/Formazione."
                  colonne={[
                    { titolo: 'Lavoratore', valore: (l) => <span className="cella-principale testo-a-capo">{l.nominativo}</span> },
                    { titolo: 'Area', valore: (l) => l.area || '—', secondaria: true },
                    {
                      titolo: 'Servizio',
                      valore: (l) => (
                        <span className="cella-blocco testo-a-capo">
                          {l.servizio || '—'}
                          <span className="cella-secondaria">{l.centroDiCosto}</span>
                        </span>
                      ),
                    },
                    { titolo: 'Stato', valore: (l) => <Etichetta tono={l.stato === 'Attivo' ? 'successo' : 'neutro'}>{l.stato}</Etichetta> },
                    {
                      titolo: 'Segnalazioni aperte',
                      valore: (l) => (l.segnalazioniAperte ? <Etichetta tono="avviso">{l.segnalazioniAperte} in attesa di HR</Etichetta> : <span className="testo-secondario">Nessuna</span>),
                    },
                  ]}
                  azioni={(l) => (
                    <Pulsante variante="secondario" piccolo icona="integrazione" aria-label={`Segnala variazione a HR per ${l.nominativo}`} onClick={() => setSegnalazione(l)}>
                      Segnala variazione a HR
                    </Pulsante>
                  )}
                />
              </div>
            </>
          )
        ))}

      {segnalazione && (
        <DialogoSegnalazione
          destinatario={segnalazione}
          onChiudi={() => setSegnalazione(null)}
          onInviata={async () => {
            setSegnalazione(null);
            await dati.ricarica();
          }}
        />
      )}
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
//  Segnalazione di una variazione dell'organigramma a HR
// ---------------------------------------------------------------------------
function DialogoSegnalazione({ destinatario, onChiudi, onInviata }: { destinatario: LavoratoreTeam | 'me'; onChiudi: () => void; onInviata: () => Promise<void> }) {
  const { backend, sessione } = useApp();
  const azione = useAzione();
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [rifiuto, setRifiuto] = useState<string | null>(null);
  const perMe = destinatario === 'me';
  // il coordinatore potrebbe non essere censito come lavoratore: in quel caso non ha un'anagrafica da correggere
  const nonCensito = perMe && !sessione.lavoratoreId;

  const invia = async () => {
    const t = testo.trim();
    if (t.length < MINIMO_SEGNALAZIONE) {
      setErrore(`Descrivi la variazione (almeno ${MINIMO_SEGNALAZIONE} caratteri).`);
      return;
    }
    setErrore(null);
    setRifiuto(null);
    try {
      await azione.esegui(() => backend.segnalaVariazione(t, perMe ? undefined : destinatario.id), 'Segnalazione inviata all’Ufficio HR/Formazione.');
      await onInviata();
    } catch (e) {
      // l'errore è già comparso come messaggio: lo si lascia anche nel dialogo, vicino al campo
      setRifiuto(messaggioErrore(e));
    }
  };

  return (
    <Dialogo
      titolo={perMe ? 'Segnala una variazione che riguarda me' : `Segnala variazione a HR – ${destinatario.nominativo}`}
      onChiudi={onChiudi}
      piede={
        nonCensito ? (
          <Pulsante onClick={onChiudi}>Chiudi</Pulsante>
        ) : (
          <>
            <Pulsante variante="secondario" onClick={onChiudi} disabled={azione.inCorso}>
              Annulla
            </Pulsante>
            <Pulsante icona="invia" inCorso={azione.inCorso} onClick={() => void invia()}>
              Invia la segnalazione
            </Pulsante>
          </>
        )
      }
    >
      {nonCensito ? (
        <Avviso tono="avviso" titolo="Il tuo utente non è censito come lavoratore">
          Non hai un’anagrafica da correggere in questa app. Per una variazione che riguarda il tuo incarico di coordinamento (servizi o persone assegnate)
          usa «Segnala variazione a HR» accanto al lavoratore interessato, oppure contatta direttamente l’Ufficio HR/Formazione.
        </Avviso>
      ) : (
        <>
          {!perMe && (
            <dl className="elenco-dati">
              <div>
                <dt>Lavoratore</dt>
                <dd>{destinatario.nominativo}</dd>
              </div>
              <div>
                <dt>Servizio registrato</dt>
                <dd>
                  {destinatario.servizio || '—'}
                  {destinatario.centroDiCosto ? ` (${destinatario.centroDiCosto})` : ''}
                </dd>
              </div>
            </dl>
          )}
          <CampoArea
            etichetta="Cosa è cambiato"
            obbligatorio
            rows={5}
            maxLength={MAX_LUNGHEZZA_NOTE}
            value={testo}
            onChange={(e) => {
              setTesto(e.target.value);
              if (errore) setErrore(null);
            }}
            errore={errore ?? undefined}
            aiuto={
              perMe
                ? 'Esempio: «Dal 1° del mese coordino anche il Centro diurno; il mio servizio di appartenenza è cambiato».'
                : 'Esempio: «Dal 1° del mese è stata trasferita al Centro diurno e non è più nel mio gruppo».'
            }
          />
          {rifiuto && <Avviso tono="pericolo">{rifiuto}</Avviso>}
          <p className="testo-secondario testo-piccolo" style={{ margin: 0 }}>
            La segnalazione arriva all’Ufficio HR/Formazione con il tuo nome. I dati non cambiano subito: li aggiorna HR dopo la verifica.
          </p>
        </>
      )}
    </Dialogo>
  );
}
