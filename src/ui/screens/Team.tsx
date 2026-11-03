/**
 * Schermata 4 – Richieste del team (coordinatore).
 *
 * Mostra solo le richieste dei lavoratori assegnati al coordinatore (il filtro è applicato
 * dal backend). Le richieste da approvare compaiono per prime; dalla riga si apre il dettaglio,
 * dove il coordinatore approva, respinge o chiede un'integrazione.
 */
import { useMemo, useState, type ChangeEvent } from 'react';
import { calcolaKPI, filtraRichieste, IN_ATTESA_COORDINATORE, STATI_RICHIESTA, type Richiesta, type StatoRichiesta } from '../../domain';
import { BadgeStato, BarraFiltri, Caricamento, CampoSelezione, ErroreCaricamento, Etichetta, Indicatore, Pagina, Pulsante, PulsanteIcona, Tabella } from '../components/ui';
import { useApp } from '../contesto';
import * as f from '../format';
import { useCarica } from '../hooks';
import { naviga, parametriQuery, ROTTE } from '../router';
import { CoppiaOre, nominativo, oggiAnnoMese, opzioniAnni, opzioniDistinte, OPZIONI_MESI, Segnali, segnaliRichiesta, titoloCorso, unisciOpzioni } from './gestione/comuni';
import '../../styles/gestione.css';

/** Valore speciale del filtro "stato": tutte le richieste in attesa del coordinatore. */
const ATTESA = 'attesa';

interface Filtri {
  anno: string;
  mese: string;
  login: string;
  servizio: string;
  centroDiCosto: string;
  stato: string;
}

function filtriIniziali(): Filtri {
  const { anno } = oggiAnnoMese();
  const stato = parametriQuery().get('stato') ?? '';
  // Dalla home ("Da approvare") si arriva con ?stato=attesa: si mostrano tutte le richieste in attesa,
  // di qualunque anno, così il numero coincide con quello della home.
  if (stato === ATTESA) return { anno: '', mese: '', login: '', servizio: '', centroDiCosto: '', stato: ATTESA };
  return {
    anno: String(anno),
    mese: '',
    login: '',
    servizio: '',
    centroDiCosto: '',
    stato: (STATI_RICHIESTA as readonly string[]).includes(stato) ? stato : '',
  };
}

/** Ore riconosciute dal coordinatore, con gli eventuali valori diversi decisi da HR. */
function OreRiconosciute({ r }: { r: Richiesta }) {
  const diverse =
    r.oreRetribuiteHR !== undefined &&
    (Math.abs(r.oreRetribuiteHR - (r.oreRetribuiteCoord ?? 0)) > 0.001 || Math.abs((r.oreGettoneHR ?? 0) - (r.oreGettoneCoord ?? 0)) > 0.001);
  return (
    <span className="cella-blocco">
      <CoppiaOre retribuite={r.oreRetribuiteCoord} gettone={r.oreGettoneCoord} />
      {diverse && (
        <span className="cella-secondaria">
          HR: {f.numero(r.oreRetribuiteHR)} retr. · {f.numero(r.oreGettoneHR ?? 0)} gett.
        </span>
      )}
    </span>
  );
}

export function Team() {
  const { backend, sessione } = useApp();
  const dati = useCarica(async () => {
    const [richieste, lavoratori] = await Promise.all([backend.getRichieste('team'), backend.getLavoratoriTeam()]);
    return { richieste, lavoratori };
  }, [backend, sessione.login]);

  const [filtri, setFiltri] = useState<Filtri>(filtriIniziali);
  const cambia = (campo: keyof Filtri) => (e: ChangeEvent<HTMLSelectElement>) => setFiltri((x) => ({ ...x, [campo]: e.target.value }));
  const azzera = () => setFiltri({ anno: String(oggiAnnoMese().anno), mese: '', login: '', servizio: '', centroDiCosto: '', stato: '' });

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
      sottotitolo="Le richieste dei lavoratori assegnati a te. Apri una richiesta per verificarla e approvarla, respingerla o chiedere un’integrazione."
      azioni={
        <Pulsante variante="secondario" icona="grafico" onClick={() => naviga(ROTTE.riepilogo)}>
          Riepilogo mensile del team
        </Pulsante>
      }
    >
      <BarraFiltri onAzzera={azzera} conteggio={`${righe.length} ${righe.length === 1 ? 'richiesta' : 'richieste'}`}>
        <CampoSelezione etichetta="Mese" value={filtri.mese} onChange={cambia('mese')} vuota="Tutti" opzioni={OPZIONI_MESI} />
        <CampoSelezione etichetta="Anno" value={filtri.anno} onChange={cambia('anno')} vuota="Tutti" opzioni={opzioni.anni} />
        <CampoSelezione etichetta="Lavoratore" value={filtri.login} onChange={cambia('login')} vuota="Tutti" opzioni={opzioni.lavoratori} />
        <CampoSelezione etichetta="Servizio" value={filtri.servizio} onChange={cambia('servizio')} vuota="Tutti" opzioni={opzioni.servizi} />
        <CampoSelezione etichetta="Centro di costo" value={filtri.centroDiCosto} onChange={cambia('centroDiCosto')} vuota="Tutti" opzioni={opzioni.centri} />
        <CampoSelezione etichetta="Stato" value={filtri.stato} onChange={cambia('stato')} vuota="Tutti" opzioni={opzioni.stati} />
      </BarraFiltri>

      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
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
                etichetta="Ore di formazione svolte"
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
                  {
                    titolo: 'Stato e segnalazioni',
                    valore: (r) => (
                      <span className="cella-blocco">
                        <BadgeStato stato={r.stato} />
                        <Segnali segnali={segnaliRichiesta(r)} />
                      </span>
                    ),
                  },
                  { titolo: 'Ore formazione svolta', valore: (r) => f.numero(r.oreFrequentate), numerica: true },
                  { titolo: 'Ore richieste (retribuite / gettone)', valore: (r) => <CoppiaOre retribuite={r.oreRetribuiteRichieste} gettone={r.oreGettoneRichieste} />, numerica: true },
                  { titolo: 'Ore riconosciute (retribuite / gettone)', valore: (r) => <OreRiconosciute r={r} />, numerica: true },
                  {
                    titolo: 'Stato lavoratore',
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
          </>
        )
      )}
    </Pagina>
  );
}
