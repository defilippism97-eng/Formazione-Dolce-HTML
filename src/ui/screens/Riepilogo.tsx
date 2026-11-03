/**
 * Schermata 7 – Riepilogo mensile (coordinatori e HR).
 *
 * Il coordinatore vede solo il proprio gruppo di lavoro; HR e amministratori il quadro completo
 * (chi è sia coordinatore sia HR vede il quadro completo). Indicatori, totali per coordinatore /
 * servizio / centro di costo / area, elenchi delle richieste in attesa e respinte dai coordinatori,
 * dettaglio esportabile in CSV e stampabile.
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
import { CoppiaOre, csvRichieste, nominativo, oggiAnnoMese, opzioniAnni, opzioniDistinte, OPZIONI_MESI, titoloCorso, unisciOpzioni } from './gestione/comuni';
import '../../styles/gestione.css';

type Sezione = 'gruppi' | 'attesa' | 'respinte' | 'dettaglio';

interface Filtri {
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
  return { anno: String(p.anno), mese: String(p.mese), area: '', servizio: '', centroDiCosto: '', coordinatoreLogin: '', login: '', stato: '' };
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
      sottotitolo={quadroCompleto ? 'Quadro completo della formazione di tutta l’organizzazione.' : 'Riepilogo della formazione del tuo gruppo di lavoro.'}
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
            <Indicatori kpi={kpi} periodo={periodoTesto} />
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
                    { titolo: 'Corso', valore: (r) => <span className="cella-titolo-corso testo-a-capo">{titoloCorso(r)}</span> },
                    { titolo: 'Data corso', valore: (r) => f.data(r.dataSessione) },
                    { titolo: 'Inviata il', valore: (r) => f.data(r.inviatoIl), secondaria: true },
                    { titolo: 'Giorni lavorativi in attesa', valore: (r) => (r.segnalataHR ? <strong style={{ color: 'var(--pericolo)' }}>{r.giorniAttesa} (segnalata HR)</strong> : r.giorniAttesa), numerica: true },
                    { titolo: 'Ore richieste', valore: (r) => <CoppiaOre retribuite={r.oreRetribuiteRichieste} gettone={r.oreGettoneRichieste} />, numerica: true },
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
                    { titolo: 'Corso', valore: (r) => <span className="cella-titolo-corso testo-a-capo">{titoloCorso(r)}</span> },
                    { titolo: 'Data corso', valore: (r) => f.data(r.dataSessione) },
                    { titolo: 'Ore richieste', valore: (r) => <CoppiaOre retribuite={r.oreRetribuiteRichieste} gettone={r.oreGettoneRichieste} />, numerica: true },
                    { titolo: 'Motivazione', valore: (r) => <span className="testo-a-capo">{r.noteCoordinatore ?? '—'}</span> },
                  ]}
                />
              </div>
            </section>

            <section className="pannello-stampa stampa-tabelle" hidden={sezione !== 'dettaglio'} aria-label="Dettaglio delle richieste">
              <h2 className="pannello-titolo solo-stampa">Dettaglio richieste ({righe.length})</h2>
              <div className="gestione-tabella tabella-compatta">
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
                      titolo: 'Servizio',
                      valore: (r) => (
                        <span className="cella-blocco">
                          {r.servizio}
                          <span className="cella-secondaria">
                            {r.centroDiCosto} · {r.area}
                          </span>
                        </span>
                      ),
                      secondaria: true,
                    },
                    ...(quadroCompleto ? [{ titolo: 'Coordinatore', valore: (r: (typeof righe)[number]) => r.coordinatoreNome ?? '—', secondaria: true }] : []),
                    {
                      titolo: 'Corso',
                      valore: (r) => (
                        <span className="cella-titolo-corso testo-a-capo">
                          {titoloCorso(r)}
                          <span className="cella-secondaria">{r.codiceCorso}</span>
                        </span>
                      ),
                    },
                    { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                    { titolo: 'Ore svolte', valore: (r) => f.numero(r.oreFrequentate), numerica: true },
                    { titolo: 'Richieste', valore: (r) => <CoppiaOre retribuite={r.oreRetribuiteRichieste} gettone={r.oreGettoneRichieste} />, numerica: true },
                    { titolo: 'Approvate coordinatore', valore: (r) => <CoppiaOre retribuite={r.oreRetribuiteCoord} gettone={r.oreGettoneCoord} />, numerica: true },
                    { titolo: 'Approvate HR', valore: (r) => <CoppiaOre retribuite={r.oreRetribuiteHR} gettone={r.oreGettoneHR} />, numerica: true },
                    { titolo: 'Stato', valore: (r) => <BadgeStato stato={r.stato} /> },
                  ]}
                />
              </div>
            </section>
          </>
        )
      )}
    </Pagina>
  );
}

function Indicatori({ kpi, periodo }: { kpi: KPI; periodo: string }) {
  return (
    <div className="indicatori indicatori-compatti" role="group" aria-label={`Indicatori: ${periodo}`}>
      <Indicatore etichetta="Lavoratori coinvolti" valore={kpi.lavoratori} nota={periodo} tono="info" />
      <Indicatore etichetta="Richieste totali" valore={kpi.richieste} nota="Escluse bozze e annullate" tono="info" />
      <Indicatore etichetta="Ore frequentate" valore={f.numero(kpi.oreFrequentate)} />
      <Indicatore etichetta="Ore retribuite richieste" valore={f.numero(kpi.oreRetribuiteRichieste)} />
      <Indicatore etichetta="Ore gettone richieste" valore={f.numero(kpi.oreGettoneRichieste)} />
      <Indicatore etichetta="Ore retribuite approvate dai coordinatori" valore={f.numero(kpi.oreRetribuiteCoord)} tono="avviso" />
      <Indicatore etichetta="Ore gettone approvate dai coordinatori" valore={f.numero(kpi.oreGettoneCoord)} tono="avviso" />
      <Indicatore etichetta="Ore retribuite approvate da HR" valore={f.numero(kpi.oreRetribuiteHR)} tono="successo" />
      <Indicatore etichetta="Ore gettone approvate da HR" valore={f.numero(kpi.oreGettoneHR)} tono="successo" />
    </div>
  );
}

function TabellaGruppi({ gruppi, totale, per }: { gruppi: RigaRaggruppata[]; totale: KPI; per: Raggruppamento }) {
  const righe: RigaRaggruppata[] = gruppi.length ? [...gruppi, { chiave: RIGA_TOTALE, etichetta: 'Totale', ...totale }] : [];
  const tot = (r: RigaRaggruppata, testo: string | number) => (r.chiave === RIGA_TOTALE ? <strong className="riga-totale">{testo}</strong> : testo);
  const colonne: Colonna<RigaRaggruppata>[] = [
    { titolo: ETICHETTE_RAGGRUPPAMENTO[per], valore: (r) => tot(r, r.etichetta) },
    { titolo: 'Lavoratori', valore: (r) => tot(r, r.lavoratori), numerica: true },
    { titolo: 'Richieste', valore: (r) => tot(r, r.richieste), numerica: true },
    { titolo: 'Ore frequentate', valore: (r) => tot(r, f.numero(r.oreFrequentate)), numerica: true },
    { titolo: 'Retribuite richieste', valore: (r) => tot(r, f.numero(r.oreRetribuiteRichieste)), numerica: true, secondaria: true },
    { titolo: 'Gettone richieste', valore: (r) => tot(r, f.numero(r.oreGettoneRichieste)), numerica: true, secondaria: true },
    { titolo: 'Retribuite approvate coord.', valore: (r) => tot(r, f.numero(r.oreRetribuiteCoord)), numerica: true },
    { titolo: 'Gettone approvate coord.', valore: (r) => tot(r, f.numero(r.oreGettoneCoord)), numerica: true },
    { titolo: 'Retribuite approvate HR', valore: (r) => tot(r, f.numero(r.oreRetribuiteHR)), numerica: true },
    { titolo: 'Gettone approvate HR', valore: (r) => tot(r, f.numero(r.oreGettoneHR)), numerica: true },
  ];
  return (
    <div className="gestione-tabella tabella-compatta">
      <Tabella didascalia={`Totali per ${ETICHETTE_RAGGRUPPAMENTO[per].toLowerCase()}`} righe={righe} chiave={(r) => r.chiave} colonne={colonne} vuoto="Nessun dato per i filtri selezionati." />
    </div>
  );
}
