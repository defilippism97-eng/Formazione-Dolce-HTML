/**
 * Schermata 7 – Riepilogo mensile (coordinatori e HR).
 *
 * Il coordinatore vede solo il proprio gruppo di lavoro; HR e amministratori il quadro completo
 * (chi è sia coordinatore sia HR vede il quadro completo). Indicatori, totali per coordinatore /
 * servizio / centro di costo / area, elenchi delle richieste in attesa e respinte dai coordinatori,
 * dettaglio esportabile in CSV e stampabile.
 *
 * Le ore sono distinte per voce – retribuite, a gettone, da non retribuire e ore di permesso
 * (diritto allo studio, riqualifica professionale) – e per fase: richieste dai lavoratori,
 * approvate dai coordinatori, validate da HR.
 */
import { useMemo, useState, type ChangeEvent } from 'react';
import {
  AREE,
  calcolaKPI,
  filtraRichieste,
  IN_ATTESA_COORDINATORE,
  mesePrecedente,
  periodo as periodoIso,
  raggruppa,
  STATI_RICHIESTA,
  type Area,
  type KPI,
  type Raggruppamento,
  type Richiesta,
  type RigaRaggruppata,
  type StatoRichiesta,
} from '../../domain';
import {
  Avviso,
  BadgeStato,
  BarraFiltri,
  Caricamento,
  CampoSelezione,
  ErroreCaricamento,
  Indicatore,
  Pagina,
  Pulsante,
  PulsanteIcona,
  Schede,
  Scheda,
  Tabella,
  type Colonna,
} from '../components/ui';
import { useApp, useMessaggi } from '../contesto';
import * as f from '../format';
import { useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import {
  CellaTitolo,
  comeTipologia,
  csvRichieste,
  LegendaVoci,
  nominativo,
  oggiAnnoMese,
  opzioniAnni,
  opzioniDistinte,
  OPZIONI_MESI,
  OPZIONI_TIPOLOGIA,
  unisciOpzioni,
  vociCoordinatore,
  vociHR,
  VociOre,
  vociRichieste,
} from './gestione/comuni';
import '../../styles/gestione.css';

type Sezione = 'gruppi' | 'attesa' | 'respinte' | 'dettaglio';

interface Filtri {
  tipologia: string;
  anno: string;
  mese: string;
  area: string;
  servizio: string;
  centroDiCosto: string;
  coordinatoreLogin: string;
  login: string;
  stato: string;
}

function filtriIniziali(): Filtri {
  // in modo predefinito: il mese appena concluso (quello da chiudere e riepilogare, Flusso 5)
  const oggi = oggiAnnoMese();
  const p = mesePrecedente(oggi.anno, oggi.mese);
  return { tipologia: '', anno: String(p.anno), mese: String(p.mese), area: '', servizio: '', centroDiCosto: '', coordinatoreLogin: '', login: '', stato: '' };
}

const ETICHETTE_RAGGRUPPAMENTO: Record<Raggruppamento, string> = {
  coordinatore: 'Coordinatore',
  servizio: 'Servizio',
  centroDiCosto: 'Centro di costo',
  area: 'Area',
};

const RIGA_TOTALE = '__totale__';

export function Riepilogo() {
  const { backend, ha, sessione } = useApp();
  const mostra = useMessaggi();
  const quadroCompleto = ha('hr') || ha('admin');
  const ambito = quadroCompleto ? 'tutte' : 'team';

  const [filtri, setFiltri] = useState<Filtri>(filtriIniziali);
  const cambia = (campo: keyof Filtri) => (e: ChangeEvent<HTMLSelectElement>) => setFiltri((x) => ({ ...x, [campo]: e.target.value }));
  const [sezione, setSezione] = useState<Sezione>('gruppi');
  const [per, setPer] = useState<Raggruppamento>(quadroCompleto ? 'coordinatore' : 'servizio');

  // l'anno si filtra sul server (volumi contenuti), gli altri filtri nel browser
  const dati = useCarica(() => backend.getRichieste(ambito, filtri.anno ? { anno: Number(filtri.anno) } : {}), [backend, ambito, filtri.anno, sessione.login]);
  const richieste = useMemo(() => dati.dati ?? [], [dati.dati]);

  const righe = useMemo(
    () =>
      filtraRichieste(richieste, {
        tipologia: comeTipologia(filtri.tipologia),
        mese: filtri.mese ? Number(filtri.mese) : undefined,
        area: (filtri.area || undefined) as Area | undefined,
        servizio: filtri.servizio || undefined,
        centroDiCosto: filtri.centroDiCosto || undefined,
        coordinatoreLogin: filtri.coordinatoreLogin || undefined,
        login: filtri.login || undefined,
        stato: (filtri.stato || undefined) as StatoRichiesta | undefined,
      }),
    [richieste, filtri],
  );
  const kpi = useMemo(() => calcolaKPI(righe), [righe]);
  // ore di permesso validate da HR, distinte per tipo di permesso
  const permessiPerTipo = useMemo(
    () => ({
      dirittoStudio: calcolaKPI(righe.filter((r) => r.tipologia === 'Diritto allo studio')).orePermessiHR,
      riqualifica: calcolaKPI(righe.filter((r) => r.tipologia === 'Riqualifica professionale')).orePermessiHR,
    }),
    [righe],
  );
  const gruppi = useMemo(() => raggruppa(righe, per), [righe, per]);
  const inAttesa = useMemo(() => righe.filter((r) => IN_ATTESA_COORDINATORE.has(r.stato)).sort((a, b) => b.giorniAttesa - a.giorniAttesa), [righe]);
  const respinte = useMemo(() => righe.filter((r) => r.stato === 'Respinta dal coordinatore'), [righe]);

  const opzioni = useMemo(
    () => ({
      anni: opzioniAnni(richieste.map((r) => r.annoCompetenza)),
      aree: unisciOpzioni(
        quadroCompleto ? AREE.map((a) => ({ valore: a, etichetta: a })) : [],
        opzioniDistinte(richieste, (r) => r.area),
      ),
      servizi: opzioniDistinte(richieste, (r) => r.servizio),
      centri: opzioniDistinte(richieste, (r) => r.centroDiCosto, (r) => `${r.centroDiCosto} – ${r.servizio}`),
      coordinatori: opzioniDistinte(richieste, (r) => r.coordinatoreLogin, (r) => r.coordinatoreNome ?? r.coordinatoreLogin ?? ''),
      lavoratori: opzioniDistinte(richieste, (r) => r.login, nominativo),
      stati: STATI_RICHIESTA.filter((s) => s !== 'Bozza').map((s) => ({ valore: s, etichetta: s })),
    }),
    [richieste, quadroCompleto],
  );

  const periodoTesto =
    filtri.anno && filtri.mese
      ? f.periodo(Number(filtri.anno), Number(filtri.mese))
      : filtri.anno
        ? `Anno ${filtri.anno}`
        : filtri.mese
          ? `${OPZIONI_MESI[Number(filtri.mese) - 1]?.etichetta} (tutti gli anni)`
          : 'Tutti i periodi';
  const altriFiltri = [
    filtri.tipologia && `Tipologia: ${filtri.tipologia}`,
    filtri.area,
    filtri.servizio,
    filtri.centroDiCosto,
    filtri.coordinatoreLogin && `Coordinatore: ${opzioni.coordinatori.find((o) => o.valore === filtri.coordinatoreLogin)?.etichetta ?? filtri.coordinatoreLogin}`,
    filtri.login && `Lavoratore: ${opzioni.lavoratori.find((o) => o.valore === filtri.login)?.etichetta ?? filtri.login}`,
    filtri.stato && `Stato: ${filtri.stato}`,
  ].filter(Boolean);

  const esporta = () => {
    if (!righe.length) return;
    const suffisso = filtri.anno && filtri.mese ? periodoIso(Number(filtri.anno), Number(filtri.mese)) : filtri.anno || 'tutti-i-periodi';
    f.scaricaFile(`Riepilogo_formazione_${quadroCompleto ? 'completo' : 'team'}_${suffisso}.csv`, csvRichieste(righe));
    mostra('successo', `Esportate ${righe.length} richieste in CSV.`);
  };

  const azzera = () => setFiltri({ ...filtriIniziali(), anno: '', mese: '' });

  return (
    <Pagina
      titolo="Riepilogo mensile"
      sottotitolo={
        quadroCompleto
          ? 'Quadro completo di formazione e permessi (diritto allo studio, riqualifica professionale) di tutta l’organizzazione.'
          : 'Riepilogo di formazione e permessi del tuo gruppo di lavoro.'
      }
      azioni={
        <>
          <Pulsante variante="secondario" icona="file" onClick={() => window.print()} disabled={!dati.dati}>
            Stampa
          </Pulsante>
          <Pulsante icona="scarica" onClick={esporta} disabled={!righe.length}>
            Esporta CSV
          </Pulsante>
        </>
      }
    >
      <div className="solo-stampa intestazione-stampa">
        <p>
          <strong>{quadroCompleto ? 'Quadro completo' : `Gruppo di ${sessione.nome} ${sessione.cognome}`}</strong> – {periodoTesto}
        </p>
        {altriFiltri.length > 0 && <p>Filtri: {altriFiltri.join(' · ')}</p>}
        <p>Stampato il {f.dataOra(new Date().toISOString())}</p>
      </div>

      <BarraFiltri onAzzera={azzera} conteggio={`${righe.length} ${righe.length === 1 ? 'richiesta' : 'richieste'}`}>
        <CampoSelezione etichetta="Tipologia" value={filtri.tipologia} onChange={cambia('tipologia')} vuota="Tutte" opzioni={OPZIONI_TIPOLOGIA} />
        <CampoSelezione etichetta="Mese" value={filtri.mese} onChange={cambia('mese')} vuota="Tutti" opzioni={OPZIONI_MESI} />
        <CampoSelezione etichetta="Anno" value={filtri.anno} onChange={cambia('anno')} vuota="Tutti" opzioni={opzioni.anni} />
        <CampoSelezione etichetta="Area" value={filtri.area} onChange={cambia('area')} vuota="Tutte" opzioni={opzioni.aree} />
        <CampoSelezione etichetta="Servizio" value={filtri.servizio} onChange={cambia('servizio')} vuota="Tutti" opzioni={opzioni.servizi} />
        <CampoSelezione etichetta="Centro di costo" value={filtri.centroDiCosto} onChange={cambia('centroDiCosto')} vuota="Tutti" opzioni={opzioni.centri} />
        {quadroCompleto && (
          <CampoSelezione etichetta="Coordinatore" value={filtri.coordinatoreLogin} onChange={cambia('coordinatoreLogin')} vuota="Tutti" opzioni={opzioni.coordinatori} />
        )}
        <CampoSelezione etichetta="Lavoratore" value={filtri.login} onChange={cambia('login')} vuota="Tutti" opzioni={opzioni.lavoratori} />
        <CampoSelezione etichetta="Stato" value={filtri.stato} onChange={cambia('stato')} vuota="Tutti" opzioni={opzioni.stati} />
      </BarraFiltri>

      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {dati.caricamento && !dati.dati ? (
        <Caricamento />
      ) : (
        dati.dati && (
          <>
            <Indicatori kpi={kpi} periodo={periodoTesto} permessiPerTipo={permessiPerTipo} />
            {kpi.richieste === 0 && <Avviso tono="info">Nessuna richiesta inviata nel periodo e con i filtri selezionati.</Avviso>}

            <div className="non-stampare">
              <Schede<Sezione>
                attiva={sezione}
                onCambia={setSezione}
                voci={[
                  { id: 'gruppi', etichetta: 'Totali per gruppo' },
                  { id: 'attesa', etichetta: 'In attesa dei coordinatori', conteggio: inAttesa.length },
                  { id: 'respinte', etichetta: 'Respinte dai coordinatori', conteggio: respinte.length },
                  { id: 'dettaglio', etichetta: 'Dettaglio richieste', conteggio: righe.length },
                ]}
              />
            </div>

            <section className="pannello-stampa stampa-tabelle" hidden={sezione !== 'gruppi'} aria-label="Totali per gruppo">
              <Scheda
                titolo={`Totali per ${ETICHETTE_RAGGRUPPAMENTO[per].toLowerCase()}`}
                icona="grafico"
                azioni={
                  <div className="non-stampare" style={{ minWidth: 200 }}>
                    <CampoSelezione
                      etichetta="Raggruppa per"
                      value={per}
                      onChange={(e) => setPer(e.target.value as Raggruppamento)}
                      opzioni={(Object.keys(ETICHETTE_RAGGRUPPAMENTO) as Raggruppamento[]).map((k) => ({ valore: k, etichetta: ETICHETTE_RAGGRUPPAMENTO[k] }))}
                    />
                  </div>
                }
              >
                <TabellaGruppi gruppi={gruppi} totale={kpi} per={per} />
              </Scheda>
            </section>

            <section className="pannello-stampa stampa-tabelle" hidden={sezione !== 'attesa'} aria-label="Richieste in attesa di approvazione da coordinatori">
              <h2 className="pannello-titolo solo-stampa">In attesa di approvazione da coordinatori ({inAttesa.length})</h2>
              <div className="gestione-tabella tabella-compatta">
                <Tabella
                  didascalia="Richieste in attesa di approvazione da coordinatori"
                  righe={inAttesa}
                  chiave={(r) => r.id}
                  onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
                  vuoto="Nessuna richiesta in attesa dei coordinatori."
                  azioni={(r) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />}
                  colonne={[
                    { titolo: 'Richiesta', valore: (r) => <span className="cella-principale">{r.numero}</span> },
                    { titolo: 'Lavoratore', valore: (r) => nominativo(r) },
                    ...(quadroCompleto ? [{ titolo: 'Coordinatore', valore: (r: (typeof inAttesa)[number]) => r.coordinatoreNome ?? '—' }] : []),
                    { titolo: 'Tipologia e corso / attività', valore: (r) => <CellaTitolo r={r} /> },
                    { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                    { titolo: 'Inviata il', valore: (r) => f.data(r.inviatoIl), secondaria: true },
                    { titolo: 'Giorni lavorativi in attesa', valore: (r) => (r.segnalataHR ? <strong style={{ color: 'var(--pericolo)' }}>{r.giorniAttesa} (segnalata HR)</strong> : r.giorniAttesa), numerica: true },
                    { titolo: 'Ore richieste', valore: (r) => <VociOre tipologia={r.tipologia} {...vociRichieste(r)} />, numerica: true },
                  ]}
                />
              </div>
            </section>

            <section className="pannello-stampa stampa-tabelle" hidden={sezione !== 'respinte'} aria-label="Richieste respinte dai coordinatori">
              <h2 className="pannello-titolo solo-stampa">Respinte dai coordinatori ({respinte.length})</h2>
              <div className="gestione-tabella tabella-compatta">
                <Tabella
                  didascalia="Richieste respinte dai coordinatori"
                  righe={respinte}
                  chiave={(r) => r.id}
                  onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
                  vuoto="Nessuna richiesta respinta dai coordinatori."
                  azioni={(r) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />}
                  colonne={[
                    { titolo: 'Richiesta', valore: (r) => <span className="cella-principale">{r.numero}</span> },
                    { titolo: 'Lavoratore', valore: (r) => nominativo(r) },
                    ...(quadroCompleto ? [{ titolo: 'Coordinatore', valore: (r: (typeof respinte)[number]) => r.coordinatoreNome ?? '—' }] : []),
                    { titolo: 'Tipologia e corso / attività', valore: (r) => <CellaTitolo r={r} /> },
                    { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                    { titolo: 'Ore richieste', valore: (r) => <VociOre tipologia={r.tipologia} {...vociRichieste(r)} />, numerica: true },
                    { titolo: 'Motivazione', valore: (r) => <span className="testo-a-capo">{r.noteCoordinatore ?? '—'}</span> },
                  ]}
                />
              </div>
            </section>

            <section className="pannello-stampa stampa-tabelle" hidden={sezione !== 'dettaglio'} aria-label="Dettaglio delle richieste">
              <h2 className="pannello-titolo solo-stampa">Dettaglio richieste ({righe.length})</h2>
              <div className="gestione-tabella tabella-compatta tabella-fitta">
                <Tabella
                  didascalia="Dettaglio delle richieste del riepilogo"
                  righe={righe}
                  chiave={(r) => r.id}
                  onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
                  vuoto="Nessuna richiesta corrisponde ai filtri."
                  azioni={(r) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />}
                  colonne={[
                    {
                      titolo: 'Richiesta',
                      valore: (r) => (
                        <span className="cella-blocco">
                          <span className="cella-principale">{r.numero}</span>
                          <span className="cella-secondaria">{nominativo(r)}</span>
                        </span>
                      ),
                    },
                    {
                      titolo: quadroCompleto ? 'Servizio e coordinatore' : 'Servizio',
                      valore: (r) => (
                        <span className="cella-blocco testo-a-capo">
                          {r.servizio}
                          <span className="cella-secondaria">
                            {r.centroDiCosto} · {r.area}
                          </span>
                          {quadroCompleto && <span className="cella-secondaria">Coord.: {r.coordinatoreNome ?? 'non assegnato'}</span>}
                        </span>
                      ),
                      secondaria: true,
                    },
                    { titolo: 'Tipologia e corso / attività', valore: (r) => <CellaTitolo r={r} /> },
                    { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                    { titolo: 'Ore frequentate', valore: (r) => f.numero(r.oreFrequentate), numerica: true },
                    { titolo: 'Ore richieste', valore: (r: Richiesta) => <VociOre tipologia={r.tipologia} {...vociRichieste(r)} />, numerica: true },
                    { titolo: 'Approvate coordinatore', valore: (r) => <VociOre tipologia={r.tipologia} {...vociCoordinatore(r)} />, numerica: true },
                    { titolo: 'Validate HR', valore: (r) => <VociOre tipologia={r.tipologia} {...vociHR(r)} />, numerica: true },
                    { titolo: 'Stato', valore: (r) => <BadgeStato stato={r.stato} /> },
                  ]}
                />
              </div>
            </section>
            {kpi.richieste > 0 && (
              <div className="non-stampare">
                <LegendaVoci />
              </div>
            )}
          </>
        )
      )}
    </Pagina>
  );
}

/** Valori delle fasi precedenti, mostrati sotto il numero validato da HR. */
function Fasi({ richieste, coordinatori }: { richieste: number; coordinatori: number }) {
  return (
    <>
      Richieste {f.numero(richieste)} · Coordinatori {f.numero(coordinatori)}
    </>
  );
}

/**
 * Indicatori del riepilogo. Per ogni voce il numero grande è quello validato da HR (definitivo);
 * sotto, le ore richieste dai lavoratori e quelle approvate dai coordinatori.
 */
function Indicatori({ kpi, periodo, permessiPerTipo }: { kpi: KPI; periodo: string; permessiPerTipo: { dirittoStudio: number; riqualifica: number } }) {
  return (
    <div className="indicatori indicatori-compatti" role="group" aria-label={`Indicatori: ${periodo}`}>
      <Indicatore etichetta="Lavoratori coinvolti" valore={kpi.lavoratori} nota={periodo} tono="info" />
      <Indicatore etichetta="Richieste totali" valore={kpi.richieste} nota="Escluse bozze e annullate" tono="info" />
      <Indicatore etichetta="Ore frequentate" valore={f.numero(kpi.oreFrequentate)} nota="Formazione e permessi" />
      <Indicatore
        etichetta="Ore retribuite validate da HR"
        valore={f.numero(kpi.oreRetribuiteHR)}
        nota={<Fasi richieste={kpi.oreRetribuiteRichieste} coordinatori={kpi.oreRetribuiteCoord} />}
        tono="successo"
      />
      <Indicatore
        etichetta="Ore gettone validate da HR"
        valore={f.numero(kpi.oreGettoneHR)}
        nota={<Fasi richieste={kpi.oreGettoneRichieste} coordinatori={kpi.oreGettoneCoord} />}
        tono="successo"
      />
      <Indicatore
        etichetta="Ore da non retribuire validate da HR"
        valore={f.numero(kpi.oreNonRetribuiteHR)}
        nota={<Fasi richieste={kpi.oreNonRetribuiteRichieste} coordinatori={kpi.oreNonRetribuiteCoord} />}
      />
      <Indicatore
        etichetta="Ore di permesso validate da HR"
        valore={f.numero(kpi.orePermessiHR)}
        nota={
          <>
            Diritto allo studio {f.numero(permessiPerTipo.dirittoStudio)} · Riqualifica professionale {f.numero(permessiPerTipo.riqualifica)}
            <br />
            <Fasi richieste={kpi.orePermessiRichieste} coordinatori={kpi.orePermessiCoord} />
          </>
        }
        tono="info"
      />
    </div>
  );
}

/** Le quattro voci di una fase (richieste, coordinatori o HR) su più righe, per la tabella dei totali. */
function VociFase({ retribuite, gettone, nonRetribuite, permessi, totale }: { retribuite: number; gettone: number; nonRetribuite: number; permessi: number; totale: boolean }) {
  return (
    <span className={`ore-voci${totale ? ' riga-totale' : ''}`}>
      <span>
        {f.numero(retribuite)} <small>retr.</small>
      </span>
      <span>
        {f.numero(gettone)} <small>gett.</small>
      </span>
      <span>
        {f.numero(nonRetribuite)} <small>non retr.</small>
      </span>
      <span>
        {f.numero(permessi)} <small>permesso</small>
      </span>
    </span>
  );
}

function TabellaGruppi({ gruppi, totale, per }: { gruppi: RigaRaggruppata[]; totale: KPI; per: Raggruppamento }) {
  const righe: RigaRaggruppata[] = gruppi.length ? [...gruppi, { chiave: RIGA_TOTALE, etichetta: 'Totale', ...totale }] : [];
  const eTotale = (r: RigaRaggruppata) => r.chiave === RIGA_TOTALE;
  const tot = (r: RigaRaggruppata, testo: string | number) => (eTotale(r) ? <strong className="riga-totale">{testo}</strong> : testo);
  const colonne: Colonna<RigaRaggruppata>[] = [
    { titolo: ETICHETTE_RAGGRUPPAMENTO[per], valore: (r) => tot(r, r.etichetta) },
    { titolo: 'Lavoratori', valore: (r) => tot(r, r.lavoratori), numerica: true },
    { titolo: 'Richieste', valore: (r) => tot(r, r.richieste), numerica: true },
    { titolo: 'Ore frequentate', valore: (r) => tot(r, f.numero(r.oreFrequentate)), numerica: true },
    {
      titolo: 'Ore richieste',
      numerica: true,
      secondaria: true,
      valore: (r) => (
        <VociFase retribuite={r.oreRetribuiteRichieste} gettone={r.oreGettoneRichieste} nonRetribuite={r.oreNonRetribuiteRichieste} permessi={r.orePermessiRichieste} totale={eTotale(r)} />
      ),
    },
    {
      titolo: 'Approvate dai coordinatori',
      numerica: true,
      valore: (r) => <VociFase retribuite={r.oreRetribuiteCoord} gettone={r.oreGettoneCoord} nonRetribuite={r.oreNonRetribuiteCoord} permessi={r.orePermessiCoord} totale={eTotale(r)} />,
    },
    {
      titolo: 'Validate da HR',
      numerica: true,
      valore: (r) => <VociFase retribuite={r.oreRetribuiteHR} gettone={r.oreGettoneHR} nonRetribuite={r.oreNonRetribuiteHR} permessi={r.orePermessiHR} totale={eTotale(r)} />,
    },
  ];
  return (
    <div className="gestione-tabella tabella-compatta">
      <Tabella didascalia={`Totali per ${ETICHETTE_RAGGRUPPAMENTO[per].toLowerCase()}`} righe={righe} chiave={(r) => r.chiave} colonne={colonne} vuoto="Nessun dato per i filtri selezionati." />
    </div>
  );
}
