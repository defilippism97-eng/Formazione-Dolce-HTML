/**
 * Schermata 6 – Validazione HR.
 *
 * HR consulta tutte le richieste – formazione e permessi con monte ore (diritto allo studio,
 * riqualifica professionale) – in modo predefinito quelle approvate dai coordinatori e in attesa
 * di validazione. Può correggere le ore riconosciute direttamente in tabella e decidere:
 *  - sulle richieste selezionate (con le ore eventualmente corrette);
 *  - su un intero perimetro (coordinatore, centro di costo, servizio, area) di un mese o di un anno,
 *    con le ore riconosciute dai coordinatori.
 * In validazione le voci devono sommare esattamente alle ore frequentate: retribuite + gettone +
 * da non retribuire per la formazione; ore di permesso + non riconosciute per i permessi, entro
 * il monte ore residuo del lavoratore.
 * Il backend ricontrolla ogni richiesta e restituisce quelle scartate con il motivo.
 */
import { useCallback, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { DecisioneMultiplaInput, RisultatoMultiplo } from '../../data/api';
import {
  arrotonda2,
  AREE,
  IN_ATTESA_HR,
  isPermesso,
  orePermesso,
  STATI_RICHIESTA,
  titoloRichiesta,
  validaDecisione,
  type Area,
  type ChiusuraMensile,
  type EsitoDecisione,
  type FiltriRichieste,
  type OpzioniDecisione,
  type Richiesta,
  type StatoRichiesta,
} from '../../domain';
import { Icona } from '../components/Icona';
import {
  Avviso,
  BadgeStato,
  BarraFiltri,
  Caricamento,
  CampoSelezione,
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
import { useApp, useConferma, useMessaggi } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import {
  CellaTitolo,
  comeTipologia,
  LegendaSegnali,
  LegendaVoci,
  meseChiusoIn,
  nominativo,
  nomeUtente,
  oggiAnnoMese,
  opzioniAnni,
  opzioniDistinte,
  OPZIONI_MESI,
  OPZIONI_TIPOLOGIA,
  oreRidotteDalCoordinatore,
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

/** Valore speciale del filtro "stato": tutti gli stati in cui decide HR. */
const DA_VALIDARE = 'davalidare';
const STATO_PREDEFINITO: StatoRichiesta = 'In attesa di validazione HR';

interface Filtri {
  tipologia: string;
  anno: string;
  mese: string;
  area: string;
  servizio: string;
  centroDiCosto: string;
  coordinatoreLogin: string;
  login: string;
  codiceCorso: string;
  stato: string;
}
const FILTRI_INIZIALI: Filtri = { tipologia: '', anno: '', mese: '', area: '', servizio: '', centroDiCosto: '', coordinatoreLogin: '', login: '', codiceCorso: '', stato: STATO_PREDEFINITO };

type TipoPerimetro = 'coordinatoreLogin' | 'centroDiCosto' | 'servizio' | 'area';
const TIPI_PERIMETRO: { valore: TipoPerimetro; etichetta: string }[] = [
  { valore: 'coordinatoreLogin', etichetta: 'Coordinatore' },
  { valore: 'centroDiCosto', etichetta: 'Centro di costo' },
  { valore: 'servizio', etichetta: 'Servizio' },
  { valore: 'area', etichetta: 'Area' },
];
interface Perimetro {
  tipo: TipoPerimetro;
  valore: string;
  anno: string;
  mese: string;
}

/** Ore HR inserite nella tabella (testo, con la virgola decimale): le tre voci della ripartizione. */
interface OreTesto {
  /** Retribuite oppure, per i permessi, ore di permesso a carico del monte ore. */
  ret: string;
  get: string;
  /** Da non retribuire oppure, per i permessi, ore non riconosciute. */
  non: string;
}
interface OreNumeri {
  ret: number;
  get: number;
  non: number;
}

interface EsitoMostrato {
  esito: EsitoDecisione;
  descrizione: string;
  risultato: RisultatoMultiplo;
}

const TESTI_ESITO: Record<EsitoDecisione, { fatto: string; azione: string }> = {
  approva: { fatto: 'Validate', azione: 'Validazione' },
  respingi: { fatto: 'Respinte', azione: 'Respingimento' },
  integrazione: { fatto: 'Integrazione richiesta per', azione: 'Richiesta di integrazione' },
};

const testoOre = (n: number) => String(arrotonda2(n)).replace('.', ',');
const parseOre = (t: string) => {
  const v = t.trim().replace(',', '.');
  return v === '' || !/^\d+(\.\d+)?$/.test(v) ? NaN : Number(v);
};
/** Ore riconosciute dal coordinatore (punto di partenza della validazione HR). */
const oreCoordinatore = (r: Richiesta): OreNumeri => ({
  ret: r.oreRetribuiteCoord ?? r.oreRetribuiteRichieste,
  get: r.oreGettoneCoord ?? r.oreGettoneRichieste,
  non: r.oreNonRetribuiteCoord ?? r.oreNonRetribuiteRichieste,
});
const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

/** Totali per voce di un insieme di richieste: formazione e permessi restano distinti. */
function totaliVoci(voci: { r: Richiesta; ore: OreNumeri }[]) {
  const somma = (sel: (o: OreNumeri) => number, quali: (r: Richiesta) => boolean) => arrotonda2(voci.filter((v) => quali(v.r)).reduce((t, v) => t + sel(v.ore), 0));
  const formazione = (r: Richiesta) => !isPermesso(r);
  return {
    retribuite: somma((o) => o.ret, formazione),
    gettone: somma((o) => o.get, formazione),
    nonRetribuite: somma((o) => o.non, formazione),
    permessi: somma((o) => o.ret, isPermesso),
    permessiNonRiconosciute: somma((o) => o.non, isPermesso),
    numeroPermessi: voci.filter((v) => isPermesso(v.r)).length,
  };
}

/** Frase con i totali, es. "12 h retribuite, 2 h gettone, 1 h da non retribuire e 4 h di permesso". */
function FraseTotali({ t }: { t: ReturnType<typeof totaliVoci> }) {
  return (
    <>
      <strong>{f.numero(t.retribuite)} h retribuite</strong>, <strong>{f.numero(t.gettone)} h gettone</strong> e{' '}
      <strong>{f.numero(t.nonRetribuite)} h da non retribuire</strong>
      {t.numeroPermessi > 0 && (
        <>
          ; per i permessi <strong>{f.numero(t.permessi)} h scalate dal monte ore</strong>
          {t.permessiNonRiconosciute > 0 && <> e {f.numero(t.permessiNonRiconosciute)} h non riconosciute</>}
        </>
      )}
    </>
  );
}

/**
 * Controlli sulle ore inserite da HR (gli stessi del backend, con messaggi brevi per la tabella):
 * numeri validi, somma uguale alle ore frequentate, gettone solo se previsto, monte ore residuo.
 */
function erroreOre(r: Richiesta, v: OreTesto, opzioni: OpzioniDecisione): string | null {
  const ret = parseOre(v.ret);
  const get = parseOre(v.get);
  const non = parseOre(v.non);
  if (Number.isNaN(ret) || Number.isNaN(get) || Number.isNaN(non)) return 'Inserisci numeri validi (es. 3,5), non negativi.';
  const somma = arrotonda2(ret + get + non);
  if (somma > r.oreFrequentate + TOLLERANZA_ORE) return `Totale ${f.numero(somma)} h: supera le ore frequentate (${f.numero(r.oreFrequentate)} h).`;
  if (somma < r.oreFrequentate - TOLLERANZA_ORE) {
    return `Totale ${f.numero(somma)} h: mancano ${f.numero(arrotonda2(r.oreFrequentate - somma))} h per arrivare alle ${f.numero(r.oreFrequentate)} h frequentate.`;
  }
  return validaDecisione('approva', { retribuite: ret, gettone: get, nonRetribuite: non }, r.oreFrequentate, undefined, opzioni)[0]?.messaggio ?? null;
}

export function ValidazioneHR() {
  const { backend, sessione } = useApp();
  const conferma = useConferma();
  const mostra = useMessaggi();
  const azione = useAzione();

  const [filtri, setFiltri] = useState<Filtri>(FILTRI_INIZIALI);
  const cambia = (campo: keyof Filtri) => (e: ChangeEvent<HTMLSelectElement>) => setFiltri((x) => ({ ...x, [campo]: e.target.value }));
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [ore, setOre] = useState<Record<string, OreTesto>>({});
  const [esito, setEsito] = useState<EsitoMostrato | null>(null);
  const [perimetro, setPerimetro] = useState<Perimetro>({ tipo: 'coordinatoreLogin', valore: '', anno: String(oggiAnnoMese().anno), mese: '' });
  const [perimetroAperto, setPerimetroAperto] = useState(false);
  // funzione stabile: il dialogo rimette il focus sul primo campo se cambia
  const chiudiPerimetro = useCallback(() => setPerimetroAperto(false), []);

  // Dati di supporto: anagrafiche (opzioni dei filtri, codici fiscali mancanti, gettone previsto dai corsi),
  // mesi chiusi e monte ore dei permessi (per il controllo immediato sul residuo)
  const supporto = useCarica(async () => {
    const [anagrafiche, chiusure, monti] = await Promise.all([backend.getAnagrafiche(), backend.getChiusure(), backend.getMontiOre()]);
    return { anagrafiche, chiusure, monti };
  }, [backend]);

  const filtriApi = useMemo<FiltriRichieste>(
    () => ({
      tipologia: comeTipologia(filtri.tipologia),
      anno: filtri.anno ? Number(filtri.anno) : undefined,
      mese: filtri.mese ? Number(filtri.mese) : undefined,
      area: (filtri.area || undefined) as Area | undefined,
      servizio: filtri.servizio || undefined,
      centroDiCosto: filtri.centroDiCosto || undefined,
      coordinatoreLogin: filtri.coordinatoreLogin || undefined,
      login: filtri.login || undefined,
      codiceCorso: filtri.codiceCorso || undefined,
      stato: filtri.stato && filtri.stato !== DA_VALIDARE ? (filtri.stato as StatoRichiesta) : undefined,
    }),
    [filtri],
  );
  const dati = useCarica(() => backend.getRichieste('tutte', filtriApi), [backend, JSON.stringify(filtriApi)]);
  // dopo una decisione si ricarica con i filtri del momento, anche se sono cambiati mentre l'operazione era in corso
  const ricaricaRif = useRef(dati.ricarica);
  ricaricaRif.current = dati.ricarica;

  const chiusure = supporto.dati?.chiusure;
  const anagrafiche = supporto.dati?.anagrafiche;
  const cfMancante = useMemo(() => new Set((anagrafiche?.lavoratori ?? []).filter((l) => !l.codiceFiscale).map((l) => l.id)), [anagrafiche]);
  const corsi = useMemo(() => new Map((anagrafiche?.corsi ?? []).map((c) => [c.id, c])), [anagrafiche]);
  const monti = useMemo(() => new Map((supporto.dati?.monti ?? []).map((m) => [m.id, m])), [supporto.dati]);

  /**
   * Opzioni dei controlli per una richiesta: gettone previsto dal corso e, per i permessi, monte ore
   * residuo senza contare la richiesta stessa (che, essendo in attesa, è già tra le ore «in approvazione»).
   */
  const opzioniDi = (r: Richiesta): OpzioniDecisione => {
    if (!isPermesso(r)) return { gettonePrevisto: r.corsoId ? corsi.get(r.corsoId)?.gettonePrevisto : undefined };
    const m = r.monteOreId ? monti.get(r.monteOreId) : undefined;
    return { gettonePrevisto: false, oreResidueMonteOre: m ? arrotonda2(m.oreResidue + orePermesso(r)) : undefined };
  };

  const righe = useMemo(() => {
    const tutte = dati.dati ?? [];
    return filtri.stato === DA_VALIDARE ? tutte.filter((r) => IN_ATTESA_HR.has(r.stato)) : tutte;
  }, [dati.dati, filtri.stato]);

  const meseChiuso = (r: Richiesta) => meseChiusoIn(chiusure, r.annoCompetenza, r.meseCompetenza);
  const propria = (r: Richiesta) => r.login === sessione.login;
  const decidibile = (r: Richiesta) => IN_ATTESA_HR.has(r.stato) && !propria(r) && !meseChiuso(r);
  const valoreOre = (r: Richiesta): OreTesto => {
    const c = oreCoordinatore(r);
    return ore[r.id] ?? { ret: testoOre(c.ret), get: testoOre(c.get), non: testoOre(c.non) };
  };
  const oreModificate = (r: Richiesta) => {
    const v = valoreOre(r);
    const c = oreCoordinatore(r);
    return Math.abs(parseOre(v.ret) - c.ret) > TOLLERANZA_ORE || Math.abs(parseOre(v.get) - c.get) > TOLLERANZA_ORE || Math.abs(parseOre(v.non) - c.non) > TOLLERANZA_ORE;
  };
  const selezionate = righe.filter((r) => selezionati.has(r.id) && decidibile(r));
  const decidibiliVisibili = righe.filter(decidibile).length;

  // ---------------------------------------------------------------------------
  //  Opzioni dei filtri: anagrafiche + valori presenti nelle richieste (storico)
  // ---------------------------------------------------------------------------
  const opzioni = useMemo(() => {
    const strutture = anagrafiche?.strutture ?? [];
    const utenti = anagrafiche?.utenti ?? [];
    const loginCoordinatori = [
      ...strutture.map((s) => s.coordinatoreServizioLogin),
      ...(anagrafiche?.lavoratori ?? []).map((l) => l.coordinatoreLogin),
    ].filter((x): x is string => !!x);
    const elenco = dati.dati ?? [];
    const coordinatori = unisciOpzioni(
      [...new Set(loginCoordinatori)].map((l) => ({ valore: l, etichetta: nomeUtente(utenti, l) })),
      opzioniDistinte(elenco, (r) => r.coordinatoreLogin, (r) => r.coordinatoreNome ?? r.coordinatoreLogin ?? ''),
    );
    return {
      anni: opzioniAnni(elenco.map((r) => r.annoCompetenza)),
      aree: AREE.map((a) => ({ valore: a, etichetta: a })),
      servizi: unisciOpzioni(opzioniDistinte(strutture, (s) => s.servizio), opzioniDistinte(elenco, (r) => r.servizio)),
      centri: unisciOpzioni(
        opzioniDistinte(strutture, (s) => s.centroDiCosto, (s) => `${s.centroDiCosto} – ${s.servizio}`),
        opzioniDistinte(elenco, (r) => r.centroDiCosto, (r) => `${r.centroDiCosto} – ${r.servizio}`),
      ),
      coordinatori,
      lavoratori: unisciOpzioni(opzioniDistinte(anagrafiche?.lavoratori ?? [], (l) => l.login, nominativo), opzioniDistinte(elenco, (r) => r.login, nominativo)),
      corsi: unisciOpzioni(
        opzioniDistinte(anagrafiche?.corsi ?? [], (c) => c.codice, (c) => `${c.codice} – ${c.titolo}`),
        opzioniDistinte(elenco, (r) => r.codiceCorso, (r) => `${r.codiceCorso} – ${titoloRichiesta(r)}`),
      ),
      stati: [
        { valore: DA_VALIDARE, etichetta: 'Da validare (tutti gli stati in attesa di HR)' },
        ...STATI_RICHIESTA.filter((s) => s !== 'Bozza').map((s) => ({ valore: s, etichetta: s })),
      ],
    };
  }, [anagrafiche, dati.dati]);

  // ---------------------------------------------------------------------------
  //  Decisioni
  // ---------------------------------------------------------------------------
  const decidi = async (input: DecisioneMultiplaInput, descrizione: string) => {
    const r = await azione.prova(() => backend.decisioneHR(input));
    if (!r) return;
    const scartate = new Set(r.scartate.map((s) => s.id));
    const elaborate = new Set(input.voci.map((v) => v.id).filter((id) => !scartate.has(id)));
    setEsito({ esito: input.esito, descrizione, risultato: r });
    setSelezionati(new Set());
    setOre((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !elaborate.has(id))));
    mostra(
      r.scartate.length ? 'avviso' : 'successo',
      `${TESTI_ESITO[input.esito].fatto} ${plurale(r.elaborate, 'richiesta', 'richieste')}${r.scartate.length ? `; ${r.scartate.length} non elaborate` : ''}.`,
    );
    await Promise.all([ricaricaRif.current(), supporto.ricarica()]);
  };

  /** Chiede la conferma (e la nota, se serve). Restituisce null se l'utente annulla. */
  const chiediConferma = async (esitoScelto: EsitoDecisione, n: number, dettagli: ReactNode): Promise<{ nota?: string } | null> => {
    const quante = plurale(n, 'richiesta', 'richieste');
    if (esitoScelto === 'approva') {
      const ok = await conferma({ titolo: `Validare ${quante}?`, testo: dettagli, etichettaConferma: `Valida ${quante}` });
      return ok ? {} : null;
    }
    const respingi = esitoScelto === 'respingi';
    const nota = await conferma({
      titolo: respingi ? `Respingere ${quante}?` : `Richiedere un’integrazione per ${quante}?`,
      testo: (
        <>
          {dettagli}
          <p>
            {respingi
              ? 'La motivazione è obbligatoria: sarà inviata ai lavoratori e ai coordinatori e registrata nello storico di ogni richiesta.'
              : 'Indica cosa devono integrare o correggere i lavoratori: la nota sarà inviata anche ai coordinatori e le richieste torneranno modificabili.'}
          </p>
        </>
      ),
      etichettaConferma: respingi ? `Respingi ${quante}` : 'Richiedi integrazione',
      pericolo: respingi,
      campoTesto: { etichetta: respingi ? 'Motivazione del respingimento' : 'Cosa deve essere integrato o corretto', obbligatorio: true, minimo: 5 },
    });
    return nota ? { nota } : null;
  };

  const decidiSelezione = async (esitoScelto: EsitoDecisione) => {
    const scelte = selezionate;
    if (!scelte.length) return;
    if (esitoScelto === 'approva') {
      const errate = scelte.filter((r) => erroreOre(r, valoreOre(r), opzioniDi(r)));
      if (errate.length) {
        mostra('errore', `Correggi le ore di ${errate.map((r) => r.numero).join(', ')} prima di validare.`);
        return;
      }
      const inserite = scelte.map((r) => {
        const v = valoreOre(r);
        return { r, ore: { ret: parseOre(v.ret), get: parseOre(v.get), non: parseOre(v.non) } };
      });
      const voci = inserite.map(({ r, ore: o }) => ({ id: r.id, oreRetribuite: o.ret, oreGettone: o.get, oreNonRetribuite: o.non }));
      const totali = totaliVoci(inserite);
      const modificate = scelte.filter(oreModificate).length;
      const ok = await chiediConferma(
        'approva',
        scelte.length,
        <>
          <p>
            Le ore saranno riconosciute in via definitiva: <FraseTotali t={totali} />.
          </p>
          {modificate > 0 && (
            <p>
              {plurale(modificate, 'richiesta ha', 'richieste hanno')} ore diverse da quelle approvate dal coordinatore: la modifica sarà registrata nello storico.
            </p>
          )}
          <p>Lavoratori e coordinatori riceveranno una notifica. Dopo la validazione le richieste non saranno più modificabili.</p>
        </>,
      );
      if (ok) await decidi({ esito: 'approva', voci }, `Richieste selezionate: ${scelte.map((r) => r.numero).join(', ')}`);
      return;
    }
    const ok = await chiediConferma(esitoScelto, scelte.length, <p>Richieste: {scelte.map((r) => r.numero).join(', ')}.</p>);
    if (ok) await decidi({ esito: esitoScelto, nota: ok.nota, voci: scelte.map((r) => ({ id: r.id })) }, `Richieste selezionate: ${scelte.map((r) => r.numero).join(', ')}`);
  };

  const decidiPerimetro = async (esitoScelto: EsitoDecisione, candidati: Richiesta[], descrizione: string) => {
    // la conferma si apre al posto del dialogo del perimetro (mai due finestre modali sovrapposte)
    setPerimetroAperto(false);
    const totali = totaliVoci(candidati.map((r) => ({ r, ore: oreCoordinatore(r) })));
    const ok = await chiediConferma(
      esitoScelto,
      candidati.length,
      <>
        <p>
          Perimetro: <strong>{descrizione}</strong>.
        </p>
        {esitoScelto === 'approva' && (
          <p>
            Saranno riconosciute le ore approvate dai coordinatori: <FraseTotali t={totali} />. Lavoratori e coordinatori riceveranno una notifica.
          </p>
        )}
      </>,
    );
    if (!ok) {
      setPerimetroAperto(true);
      return;
    }
    await decidi({ esito: esitoScelto, nota: ok.nota, voci: candidati.map((r) => ({ id: r.id })) }, `Perimetro: ${descrizione}`);
  };

  const apriPerimetro = () => {
    // il perimetro parte dai filtri impostati, se ce ne sono
    const tipo: TipoPerimetro = filtri.coordinatoreLogin ? 'coordinatoreLogin' : filtri.centroDiCosto ? 'centroDiCosto' : filtri.servizio ? 'servizio' : filtri.area ? 'area' : perimetro.tipo;
    setPerimetro((p) => ({
      tipo,
      valore: filtri[tipo] || (tipo === p.tipo ? p.valore : ''),
      anno: filtri.anno || p.anno,
      mese: filtri.anno ? filtri.mese : p.mese,
    }));
    setPerimetroAperto(true);
  };

  const opzioniPerimetro: Record<TipoPerimetro, Opzione[]> = {
    coordinatoreLogin: opzioni.coordinatori,
    centroDiCosto: opzioni.centri,
    servizio: opzioni.servizi,
    area: opzioni.aree,
  };

  return (
    <Pagina
      titolo="Validazione HR"
      sottotitolo="Richieste di formazione e di permesso approvate dai coordinatori, da validare. Puoi correggere le ore riconosciute nella tabella (le voci devono sommare alle ore frequentate), decidere sulle richieste selezionate o su un intero perimetro."
      azioni={
        <Pulsante icona="team" variante="secondario" onClick={apriPerimetro} disabled={azione.inCorso}>
          Azioni su un perimetro
        </Pulsante>
      }
    >
      <BarraFiltri onAzzera={() => setFiltri(FILTRI_INIZIALI)} conteggio={`${plurale(righe.length, 'richiesta', 'richieste')} · ${decidibiliVisibili} da decidere`}>
        <CampoSelezione etichetta="Tipologia" value={filtri.tipologia} onChange={cambia('tipologia')} vuota="Tutte" opzioni={OPZIONI_TIPOLOGIA} />
        <CampoSelezione etichetta="Mese" value={filtri.mese} onChange={cambia('mese')} vuota="Tutti" opzioni={OPZIONI_MESI} />
        <CampoSelezione etichetta="Anno" value={filtri.anno} onChange={cambia('anno')} vuota="Tutti" opzioni={opzioni.anni} />
        <CampoSelezione etichetta="Area" value={filtri.area} onChange={cambia('area')} vuota="Tutte" opzioni={opzioni.aree} />
        <CampoSelezione etichetta="Servizio" value={filtri.servizio} onChange={cambia('servizio')} vuota="Tutti" opzioni={opzioni.servizi} />
        <CampoSelezione etichetta="Centro di costo" value={filtri.centroDiCosto} onChange={cambia('centroDiCosto')} vuota="Tutti" opzioni={opzioni.centri} />
        <CampoSelezione etichetta="Coordinatore" value={filtri.coordinatoreLogin} onChange={cambia('coordinatoreLogin')} vuota="Tutti" opzioni={opzioni.coordinatori} />
        <CampoSelezione etichetta="Lavoratore" value={filtri.login} onChange={cambia('login')} vuota="Tutti" opzioni={opzioni.lavoratori} />
        <CampoSelezione etichetta="Corso" value={filtri.codiceCorso} onChange={cambia('codiceCorso')} vuota="Tutti" opzioni={opzioni.corsi} />
        <CampoSelezione etichetta="Stato" value={filtri.stato} onChange={cambia('stato')} vuota="Tutti gli stati" opzioni={opzioni.stati} />
      </BarraFiltri>

      {esito && (
        <Avviso
          tono={esito.risultato.scartate.length ? 'avviso' : 'successo'}
          titolo={`${TESTI_ESITO[esito.esito].azione}: ${plurale(esito.risultato.elaborate, 'richiesta elaborata', 'richieste elaborate')}${
            esito.risultato.scartate.length ? `, ${esito.risultato.scartate.length} non elaborate` : ''
          }`}
        >
          <span className="testo-a-capo">{esito.descrizione}</span>
          {esito.risultato.scartate.length > 0 && (
            <>
              <p style={{ margin: '8px 0 0' }}>Non elaborate (il backend le ha escluse):</p>
              <ul className="elenco-esito">
                {esito.risultato.scartate.map((s) => (
                  <li key={s.id}>
                    <a href={`#${ROTTE.dettaglio(s.id)}`}>{s.numero}</a>: {s.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div style={{ marginTop: 6 }}>
            <Pulsante variante="testo" piccolo onClick={() => setEsito(null)}>
              Chiudi il messaggio
            </Pulsante>
          </div>
        </Avviso>
      )}

      {supporto.errore && (
        <Avviso tono="avviso">
          Alcune informazioni di supporto non sono disponibili ({supporto.errore}): i filtri mostrano solo i valori presenti nelle richieste e il monte ore residuo
          dei permessi viene controllato solo al momento della validazione.
        </Avviso>
      )}
      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {dati.caricamento && !dati.dati ? (
        <Caricamento />
      ) : (
        dati.dati && (
          <>
            <LegendaSegnali />
            <div className="gestione-tabella tabella-compatta tabella-validazione">
              <Tabella
                didascalia="Richieste per la validazione HR"
                righe={righe}
                chiave={(r) => r.id}
                onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
                vuoto={filtri.stato === STATO_PREDEFINITO || filtri.stato === DA_VALIDARE ? 'Nessuna richiesta da validare con questi filtri.' : 'Nessuna richiesta corrisponde ai filtri.'}
                selezione={{ selezionati, onCambia: setSelezionati, selezionabile: decidibile }}
                colonne={[
                  {
                    titolo: 'Richiesta e stato',
                    valore: (r) => (
                      <span className="cella-blocco">
                        <span className="cella-principale">{r.numero}</span>
                        <span className="cella-secondaria">
                          <BadgeStato stato={r.stato} />
                        </span>
                        <Segnali compatto segnali={segnaliRichiesta(r, { cfMancante: cfMancante.has(r.lavoratoreId), oreRidotte: oreRidotteDalCoordinatore(r) })} />
                        {meseChiuso(r) && (
                          <span className="cella-secondaria">
                            <Icona nome="lucchetto" dimensione={13} /> Mese chiuso
                          </span>
                        )}
                        {propria(r) && IN_ATTESA_HR.has(r.stato) && <span className="cella-secondaria">Tua richiesta: decide un collega</span>}
                      </span>
                    ),
                  },
                  {
                    titolo: 'Lavoratore e coordinatore',
                    valore: (r) => (
                      <span className="cella-blocco">
                        <span className="cella-principale">{nominativo(r)}</span>
                        <span className="cella-secondaria">
                          {r.servizio} · {r.centroDiCosto}
                        </span>
                        <span className="cella-secondaria">Coord.: {r.coordinatoreNome ?? 'non assegnato'}</span>
                      </span>
                    ),
                  },
                  { titolo: 'Tipologia e corso / attività', valore: (r) => <CellaTitolo r={r} /> },
                  { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
                  { titolo: 'Ore frequentate', valore: (r) => f.numero(r.oreFrequentate), numerica: true },
                  { titolo: 'Ore richieste', valore: (r) => <VociOre tipologia={r.tipologia} {...vociRichieste(r)} />, numerica: true, secondaria: true },
                  { titolo: 'Approvate coord.', valore: (r) => <VociOre tipologia={r.tipologia} {...vociCoordinatore(r)} />, numerica: true },
                  {
                    titolo: 'Ore riconosciute HR',
                    numerica: true,
                    valore: (r) =>
                      decidibile(r) ? (
                        <CellaOreHR
                          r={r}
                          valore={valoreOre(r)}
                          opzioni={opzioniDi(r)}
                          modificate={oreModificate(r)}
                          onCambia={(v) => setOre((o) => ({ ...o, [r.id]: v }))}
                          onRipristina={() =>
                            setOre((o) => {
                              const { [r.id]: _, ...resto } = o;
                              return resto;
                            })
                          }
                        />
                      ) : (
                        <VociOre tipologia={r.tipologia} {...vociHR(r)} />
                      ),
                  },
                ]}
                azioni={(r) => <PulsanteIcona icona="visualizza" etichetta={`Apri ${r.numero} (dettaglio e storico)`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />}
              />
            </div>
            {righe.length > 0 && <LegendaVoci />}
            {decidibiliVisibili > 0 && selezionate.length === 0 && (
              <p className="testo-secondario testo-piccolo">
                Seleziona le richieste con la casella a sinistra per validarle, respingerle o chiedere un’integrazione, oppure usa «Azioni su un perimetro».
              </p>
            )}
          </>
        )
      )}

      {selezionate.length > 0 && (
        <div className="barra-selezione" role="region" aria-label="Azioni sulle richieste selezionate">
          <strong aria-live="polite">{plurale(selezionate.length, 'richiesta selezionata', 'richieste selezionate')}</strong>
          <Pulsante variante="successo" icona="approva" inCorso={azione.inCorso} onClick={() => void decidiSelezione('approva')}>
            Valida
          </Pulsante>
          <Pulsante variante="pericolo" icona="respingi" disabled={azione.inCorso} onClick={() => void decidiSelezione('respingi')}>
            Respingi
          </Pulsante>
          <Pulsante variante="avviso" icona="integrazione" disabled={azione.inCorso} onClick={() => void decidiSelezione('integrazione')}>
            Richiedi integrazione
          </Pulsante>
          <Pulsante variante="testo" disabled={azione.inCorso} onClick={() => setSelezionati(new Set())}>
            Deseleziona
          </Pulsante>
        </div>
      )}

      {perimetroAperto && (
        <DialogoPerimetro
          perimetro={perimetro}
          onCambia={setPerimetro}
          opzioniValori={opzioniPerimetro}
          anni={opzioni.anni}
          chiusure={chiusure}
          loginUtente={sessione.login}
          inCorso={azione.inCorso}
          onChiudi={chiudiPerimetro}
          onEsegui={(e, candidati, descrizione) => void decidiPerimetro(e, candidati, descrizione)}
        />
      )}
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
//  Ore HR modificabili nella riga
// ---------------------------------------------------------------------------
function CellaOreHR({
  r,
  valore,
  opzioni,
  modificate,
  onCambia,
  onRipristina,
}: {
  r: Richiesta;
  valore: OreTesto;
  opzioni: OpzioniDecisione;
  modificate: boolean;
  onCambia: (v: OreTesto) => void;
  onRipristina: () => void;
}) {
  const id = useId();
  const permesso = isPermesso(r);
  const errore = erroreOre(r, valore, opzioni);
  // resto da assegnare alla voce "non retribuite" / "non riconosciute" per pareggiare le ore frequentate
  const ret = parseOre(valore.ret);
  const get = permesso ? 0 : parseOre(valore.get);
  const resto = Number.isNaN(ret) || Number.isNaN(get) ? NaN : arrotonda2(r.oreFrequentate - ret - get);
  const pareggiabile = !Number.isNaN(resto) && resto >= 0 && Math.abs(resto - parseOre(valore.non)) > TOLLERANZA_ORE;
  const gettoneNonPrevisto = !permesso && opzioni.gettonePrevisto === false;
  const campo = (chiave: keyof OreTesto, sigla: string, descrizione: string, extra: { disabled?: boolean; title?: string } = {}) => (
    <>
      <label htmlFor={`${id}-${chiave}`}>{sigla}</label>
      <input
        id={`${id}-${chiave}`}
        inputMode="decimal"
        autoComplete="off"
        value={valore[chiave]}
        onChange={(e) => onCambia({ ...valore, [chiave]: e.target.value })}
        aria-label={`${descrizione} per ${r.numero}`}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${id}-e` : undefined}
        {...extra}
      />
    </>
  );
  return (
    // i clic sui campi non devono aprire il dettaglio della riga
    <div className="ore-hr" onClick={(e) => e.stopPropagation()}>
      {permesso ? (
        <>
          {campo('ret', 'Permesso', 'Ore di permesso riconosciute da HR')}
          {campo('non', 'Non ric.', 'Ore di permesso non riconosciute da HR')}
          {opzioni.oreResidueMonteOre !== undefined && (
            <span className="ore-hr-nota testo-secondario" title="Ore ancora disponibili nel monte ore del lavoratore, senza contare questa richiesta">
              Monte ore residuo: {f.numero(opzioni.oreResidueMonteOre)} h
            </span>
          )}
        </>
      ) : (
        <>
          {campo('ret', 'Retr.', 'Ore retribuite riconosciute da HR')}
          {campo(
            'get',
            'Gett.',
            'Ore gettone riconosciute da HR',
            gettoneNonPrevisto && parseOre(valore.get) === 0 ? { disabled: true, title: 'Per questo corso il gettone non è previsto' } : {},
          )}
          {campo('non', 'Non retr.', 'Ore da non retribuire riconosciute da HR')}
        </>
      )}
      {errore && (
        <span className="ore-hr-errore" id={`${id}-e`}>
          {errore}
        </span>
      )}
      {(pareggiabile || modificate) && (
        <span className="ore-hr-nota">
          {modificate && !errore && <Etichetta tono="info">Modificate</Etichetta>}{' '}
          {pareggiabile && (
            <button
              type="button"
              className="btn-link"
              onClick={() => onCambia({ ...valore, non: testoOre(resto) })}
              title={`Mette le ${f.numero(resto)} h restanti tra le ore ${permesso ? 'non riconosciute' : 'da non retribuire'}`}
            >
              Resto → {permesso ? 'non ric.' : 'non retr.'}
            </button>
          )}{' '}
          {modificate && (
            <button type="button" className="btn-link" onClick={onRipristina}>
              Ripristina
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Dialogo delle azioni su un perimetro
// ---------------------------------------------------------------------------
function DialogoPerimetro({
  perimetro,
  onCambia,
  opzioniValori,
  anni,
  chiusure,
  loginUtente,
  inCorso,
  onChiudi,
  onEsegui,
}: {
  perimetro: Perimetro;
  onCambia: (p: Perimetro) => void;
  opzioniValori: Record<TipoPerimetro, Opzione[]>;
  anni: Opzione[];
  chiusure: ChiusuraMensile[] | undefined;
  loginUtente: string;
  inCorso: boolean;
  onChiudi: () => void;
  onEsegui: (esito: EsitoDecisione, candidati: Richiesta[], descrizione: string) => void;
}) {
  const { backend } = useApp();
  const filtriPerimetro: FiltriRichieste | null =
    perimetro.valore && perimetro.anno
      ? { anno: Number(perimetro.anno), mese: perimetro.mese ? Number(perimetro.mese) : undefined, [perimetro.tipo]: perimetro.valore }
      : null;
  const elenco = useCarica(async () => (filtriPerimetro ? backend.getRichieste('tutte', filtriPerimetro) : []), [backend, JSON.stringify(filtriPerimetro)]);

  const inAttesa = (elenco.dati ?? []).filter((r) => IN_ATTESA_HR.has(r.stato));
  const proprie = inAttesa.filter((r) => r.login === loginUtente);
  const chiuse = inAttesa.filter((r) => r.login !== loginUtente && meseChiusoIn(chiusure, r.annoCompetenza, r.meseCompetenza));
  const candidati = inAttesa.filter((r) => r.login !== loginUtente && !meseChiusoIn(chiusure, r.annoCompetenza, r.meseCompetenza));
  const totali = totaliVoci(candidati.map((r) => ({ r, ore: oreCoordinatore(r) })));
  const lavoratori = new Set(candidati.map((r) => r.login)).size;

  const tipo = TIPI_PERIMETRO.find((t) => t.valore === perimetro.tipo) ?? TIPI_PERIMETRO[0]!;
  const etichettaValore = opzioniValori[perimetro.tipo].find((o) => o.valore === perimetro.valore)?.etichetta ?? perimetro.valore;
  const periodoTesto = perimetro.mese ? f.periodo(Number(perimetro.anno), Number(perimetro.mese)) : `anno ${perimetro.anno}`;
  const descrizione = `${tipo.etichetta} ${etichettaValore} – ${periodoTesto}`;
  const pronto = !!filtriPerimetro && !elenco.caricamento && !elenco.errore;
  const disabilitato = !pronto || candidati.length === 0 || inCorso;

  return (
    <Dialogo
      titolo="Azioni su un perimetro"
      largo
      onChiudi={onChiudi}
      piede={
        <div className="dialogo-azioni-perimetro">
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante variante="avviso" icona="integrazione" disabled={disabilitato} onClick={() => onEsegui('integrazione', candidati, descrizione)}>
            Richiedi integrazione
          </Pulsante>
          <Pulsante variante="pericolo" icona="respingi" disabled={disabilitato} onClick={() => onEsegui('respingi', candidati, descrizione)}>
            Respingi tutto
          </Pulsante>
          <Pulsante variante="successo" icona="approva" disabled={disabilitato} onClick={() => onEsegui('approva', candidati, descrizione)}>
            Valida tutto{pronto && candidati.length ? ` (${candidati.length})` : ''}
          </Pulsante>
        </div>
      }
    >
      <p style={{ margin: 0 }}>
        Decidi in un’unica operazione su tutte le richieste <strong>approvate dai coordinatori e in attesa di validazione HR</strong> di un coordinatore, centro di
        costo, servizio o area (formazione e permessi). Si usano le ore riconosciute dai coordinatori: le correzioni inserite nella tabella valgono solo per le
        richieste selezionate.
      </p>
      <Griglia colonne={2}>
        <CampoSelezione
          etichetta="Tipo di perimetro"
          value={perimetro.tipo}
          onChange={(e) => onCambia({ ...perimetro, tipo: e.target.value as TipoPerimetro, valore: '' })}
          opzioni={TIPI_PERIMETRO}
          obbligatorio
        />
        <CampoSelezione
          etichetta={tipo.etichetta}
          value={perimetro.valore}
          onChange={(e) => onCambia({ ...perimetro, valore: e.target.value })}
          vuota="Seleziona…"
          opzioni={opzioniValori[perimetro.tipo]}
          obbligatorio
        />
        <CampoSelezione etichetta="Anno" value={perimetro.anno} onChange={(e) => onCambia({ ...perimetro, anno: e.target.value })} opzioni={anni} obbligatorio />
        <CampoSelezione etichetta="Mese" value={perimetro.mese} onChange={(e) => onCambia({ ...perimetro, mese: e.target.value })} vuota="Tutti i mesi dell’anno" opzioni={OPZIONI_MESI} />
      </Griglia>

      <div aria-live="polite">
        {!filtriPerimetro ? (
          <Avviso tono="info">Scegli {tipo.etichetta.toLowerCase() === 'area' ? 'l’area' : `il ${tipo.etichetta.toLowerCase()}`} per vedere quante richieste sono interessate.</Avviso>
        ) : elenco.errore ? (
          <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />
        ) : elenco.caricamento ? (
          <Caricamento testo="Conteggio delle richieste del perimetro…" />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="perimetro-conteggio">
              <Indicatore etichetta="Richieste interessate" valore={candidati.length} tono={candidati.length ? 'avviso' : 'neutro'} />
              <Indicatore etichetta="Lavoratori" valore={lavoratori} />
              <Indicatore etichetta="Ore retribuite (coord.)" valore={f.numero(totali.retribuite)} />
              <Indicatore etichetta="Ore gettone (coord.)" valore={f.numero(totali.gettone)} />
              <Indicatore etichetta="Ore non retribuite (coord.)" valore={f.numero(totali.nonRetribuite)} />
              <Indicatore etichetta="Ore di permesso (coord.)" valore={f.numero(totali.permessi)} tono={totali.numeroPermessi ? 'info' : 'neutro'} />
            </div>
            {candidati.length === 0 && <Avviso tono="info">Nel perimetro {descrizione} non ci sono richieste in attesa di validazione HR.</Avviso>}
            {(proprie.length > 0 || chiuse.length > 0) && (
              <Avviso tono="avviso" titolo="Richieste escluse">
                <ul className="elenco-compatto">
                  {proprie.length > 0 && <li>{plurale(proprie.length, 'richiesta è tua', 'richieste sono tue')}: deve decidere un collega.</li>}
                  {chiuse.length > 0 && <li>{plurale(chiuse.length, 'richiesta è', 'richieste sono')} di un mese già chiuso.</li>}
                </ul>
              </Avviso>
            )}
            {candidati.length > 0 && (
              <div className="perimetro-anteprima" tabIndex={0} aria-label="Elenco delle richieste interessate">
                <ul>
                  {candidati.map((r) => (
                    <li key={r.id}>
                      <span>
                        <strong>{r.numero}</strong> · {nominativo(r)} · {titoloRichiesta(r)} · {f.data(r.dataSessione)}
                      </span>
                      <span className="num" style={{ whiteSpace: 'nowrap' }}>
                        {testoVoci(r.tipologia, vociCoordinatore(r))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialogo>
  );
}
