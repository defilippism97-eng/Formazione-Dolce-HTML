/**
 * Schermata 3 – Nuova richiesta di riconoscimento delle ore di formazione
 * (anche modifica di una bozza o di una richiesta per cui è stata chiesta un'integrazione).
 *
 * Sezioni: dati del lavoratore (sola lettura), attività formativa, allegati, dichiarazioni.
 * I controlli sono gli stessi del server (`validaRichiesta`): qui servono solo a dare
 * messaggi immediati, il backend li ripete sempre.
 */
import '../../styles/lavoratore.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErroreApi, type Profilo, type SalvaRichiestaInput } from '../../data/api';
import {
  ANNULLABILI_DAL_LAVORATORE,
  arrotonda2,
  calcolaOre,
  isDataValida,
  MAX_LUNGHEZZA_NOTE,
  MODALITA,
  MODIFICABILI_DAL_LAVORATORE,
  nomeMese,
  oggiRoma,
  sessioniGiaDichiarate,
  trovaDuplicati,
  validaRichiesta,
  type Allegato,
  type ChiusuraMensile,
  type ContestoValidazione,
  type Corso,
  type ErroreValidazione,
  type Richiesta,
  type StatoRichiesta,
} from '../../domain';
import { Avviso, CampoArea, CampoLettura, CampoSelezione, CampoTesto, Caricamento, Casella, ErroreCaricamento, Griglia, Pagina, Pulsante, Scheda } from '../components/ui';
import { useApp, useConferma, useMessaggi } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import { SezioneAllegati, type FileNuovo } from './lavoratore/CaricaAllegati';
import { focusPrimoErrore, isMeseChiuso, sostituisciPercorso, testoNumero, titoloCorso } from './lavoratore/comuni';
import { SelettoreCorso } from './lavoratore/SelettoreCorso';
import {
  corsoDaRichiesta,
  DATORE,
  ESTERNO,
  inputDaStato,
  moduloVuoto,
  numeroCampo,
  statoDaRichiesta,
  storicoCon,
  validaCompilazione,
  type SceltaEsterno,
  type StatoModulo,
} from './lavoratore/statoModulo';

interface DatiModulo {
  profilo: Profilo;
  catalogo: Corso[];
  storico: Corso[];
  chiusure: ChiusuraMensile[];
  mie: Richiesta[];
}

/** Ordine dei campi nel modulo: il riepilogo degli errori li elenca nello stesso ordine. */
const ORDINE_CAMPI = [
  'ente',
  'corsoId',
  'nuovoCorso.titolo',
  'nuovoCorso.modalita',
  'nuovoCorso.durataOre',
  'nuovoCorso.piuGiornate',
  'dataSessione',
  'oraInizioSessione',
  'oraFineSessione',
  'oraIngresso',
  'oraUscita',
  'oreRetribuiteRichieste',
  'oreGettoneRichieste',
  'noteLavoratore',
  'allegati',
  'dichiarazioni.partecipazione',
  'dichiarazioni.correttezza',
  'dichiarazioni.autorizzazione',
  'coordinatore',
  'profilo',
];
const posizioneCampo = (c: string) => {
  const i = ORDINE_CAMPI.indexOf(c);
  return i < 0 ? ORDINE_CAMPI.length : i;
};

/** Errori che non riguardano un campo del modulo (nel riepilogo non sono collegamenti). */
const CAMPI_SENZA_INPUT: ReadonlySet<string> = new Set(['coordinatore', 'profilo', 'allegati']);

const INTEGRAZIONE: ReadonlySet<StatoRichiesta> = new Set<StatoRichiesta>(['Integrazione richiesta dal coordinatore', 'Integrazione richiesta da HR']);

export function ModuloRichiesta({ id }: { id?: string }) {
  const { backend } = useApp();
  const dati = useCarica(async (): Promise<DatiModulo> => {
    const [profilo, catalogo, storico, chiusure, mie] = await Promise.all([
      backend.getProfilo(),
      backend.getCatalogo(),
      backend.getStoricoCorsiEsterni(),
      backend.getChiusure(),
      backend.getMieRichieste(),
    ]);
    return { profilo, catalogo, storico, chiusure, mie };
  }, [backend, id]);

  const titolo = id ? 'Modifica richiesta' : 'Nuova richiesta';
  if (dati.errore) {
    return (
      <Pagina titolo={titolo}>
        <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />
      </Pagina>
    );
  }
  if (!dati.dati) {
    return (
      <Pagina titolo={titolo}>
        <Caricamento testo="Preparazione del modulo…" />
      </Pagina>
    );
  }
  const richiesta = id ? dati.dati.mie.find((r) => r.id === id) : undefined;
  if (id && !richiesta) {
    return (
      <Pagina titolo={titolo}>
        <Avviso tono="pericolo" titolo="Richiesta non trovata">
          La richiesta non esiste o non è tua.
        </Avviso>
        <div className="barra-azioni">
          <Pulsante variante="secondario" icona="lista" onClick={() => naviga(ROTTE.mieRichieste)}>
            Torna alle richieste
          </Pulsante>
        </div>
      </Pagina>
    );
  }
  if (richiesta) {
    const chiuso = isMeseChiuso(dati.dati.chiusure, richiesta.annoCompetenza, richiesta.meseCompetenza);
    if (!MODIFICABILI_DAL_LAVORATORE.has(richiesta.stato) || chiuso) return <NonModificabile r={richiesta} meseChiuso={chiuso} />;
  }
  return <Modulo dati={dati.dati} richiesta={richiesta} />;
}

function NonModificabile({ r, meseChiuso }: { r: Richiesta; meseChiuso: boolean }) {
  return (
    <Pagina titolo={`Richiesta ${r.numero}`} sottotitolo={titoloCorso(r)}>
      <Avviso tono="info" titolo="Questa richiesta non si può modificare">
        {meseChiuso
          ? `Il mese di ${nomeMese(r.meseCompetenza)} ${r.annoCompetenza} è stato chiuso dall’Ufficio HR/Formazione: per correzioni rivolgiti a loro.`
          : `La richiesta è nello stato «${r.stato}». Si può modificare solo quando è in bozza o quando il coordinatore o l’Ufficio HR chiedono un’integrazione.`}
      </Avviso>
      <div className="barra-azioni">
        <Pulsante variante="secondario" icona="lista" onClick={() => naviga(ROTTE.mieRichieste)}>
          Torna alle richieste
        </Pulsante>
        <Pulsante icona="visualizza" onClick={() => naviga(ROTTE.dettaglio(r.id))}>
          Visualizza la richiesta
        </Pulsante>
      </div>
    </Pagina>
  );
}

type Operazione = 'bozza' | 'invia' | 'annulla';
type CampoOrario = 'oraInizioSessione' | 'oraFineSessione' | 'oraIngresso' | 'oraUscita';

function Modulo({ dati, richiesta }: { dati: DatiModulo; richiesta?: Richiesta }) {
  const { backend, sessione } = useApp();
  const conferma = useConferma();
  const mostra = useMessaggi();
  const azione = useAzione();
  const oggi = useMemo(() => oggiRoma(), []);
  const rifModulo = useRef<HTMLFormElement>(null);
  const rifRiepilogo = useRef<HTMLDivElement>(null);

  /** Richiesta già salvata sul server (dopo il primo salvataggio un secondo clic la aggiorna, non ne crea un'altra). */
  const [salvata, setSalvata] = useState<Pick<Richiesta, 'id' | 'numero' | 'stato'> | undefined>(() =>
    richiesta ? { id: richiesta.id, numero: richiesta.numero, stato: richiesta.stato } : undefined,
  );
  const [storico, setStorico] = useState<Corso[]>(() => storicoCon(dati.storico, richiesta, sessione.login));
  const [m, setM] = useState<StatoModulo>(() => (richiesta ? statoDaRichiesta(richiesta, dati.catalogo) : moduloVuoto(dati.storico.length > 0)));
  const [esistenti, setEsistenti] = useState<Allegato[]>(() => richiesta?.allegati ?? []);
  const [rimossi, setRimossi] = useState<string[]>([]);
  const [nuovi, setNuovi] = useState<FileNuovo[]>([]);
  /** Ultimo tentativo di salvataggio: da quel momento tutti i controlli sono visibili. */
  const [verifica, setVerifica] = useState<'bozza' | 'invia' | null>(null);
  /** Campi già visitati: i loro errori si vedono subito, senza aspettare il salvataggio. */
  const [toccati, setToccati] = useState<ReadonlySet<string>>(() => new Set());
  const [sporco, setSporco] = useState(false);
  const [inCorso, setInCorso] = useState<Operazione | null>(null);

  // avviso del browser se si chiude o ricarica la pagina con modifiche non salvate
  useEffect(() => {
    if (!sporco) return;
    const avvisa = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avvisa);
    return () => window.removeEventListener('beforeunload', avvisa);
  }, [sporco]);

  const modificato = () => {
    setSporco(true);
    if (azione.erroriCampi.length) azione.setErroriCampi([]);
  };
  const imposta = <K extends keyof StatoModulo>(campo: K, valore: StatoModulo[K]) => {
    setM((p) => ({ ...p, [campo]: valore }));
    modificato();
  };
  /** Ingresso e uscita si precompilano con inizio e fine della sessione (il caso più comune). */
  const impostaOrario = (campo: CampoOrario, valore: string) => {
    setM((p) => {
      const n = { ...p, [campo]: valore };
      if (campo === 'oraInizioSessione' && (!p.oraIngresso || p.oraIngresso === p.oraInizioSessione)) n.oraIngresso = valore;
      if (campo === 'oraFineSessione' && (!p.oraUscita || p.oraUscita === p.oraFineSessione)) n.oraUscita = valore;
      return n;
    });
    modificato();
  };
  const tocca = (campo: string) => setToccati((t) => (t.has(campo) ? t : new Set(t).add(campo)));

  // --- corso scelto e valori calcolati
  const corsoCatalogo = m.ente === DATORE ? dati.catalogo.find((c) => c.id === m.corsoCatalogoId) : undefined;
  const corsoStorico = m.ente === ESTERNO && m.sceltaEsterno === 'storico' ? storico.find((c) => c.id === m.corsoStoricoId) : undefined;
  const corso = corsoCatalogo ?? corsoStorico ?? null;
  const gettoneNonPrevisto = corso?.gettonePrevisto === false;
  const input = useMemo(() => inputDaStato(m, gettoneNonPrevisto), [m, gettoneNonPrevisto]);
  const { durataSessione, oreFrequentate } = calcolaOre(input);
  const altre = useMemo(() => dati.mie.filter((r) => r.id !== salvata?.id), [dati.mie, salvata?.id]);

  const ctx = useMemo<ContestoValidazione>(
    () => ({
      login: sessione.login,
      corso,
      altreRichieste: altre,
      meseChiuso: (anno, mese) => isMeseChiuso(dati.chiusure, anno, mese),
      coordinatoreLogin: dati.profilo.coordinatoreEmail ?? dati.profilo.coordinatoreNome,
      profiloCompleto: sessione.profiloCompleto,
      oggi,
    }),
    [sessione, corso, altre, dati.chiusure, dati.profilo, oggi],
  );
  const controlla = (perInvio: boolean): ErroreValidazione[] => [...validaCompilazione(m, gettoneNonPrevisto), ...validaRichiesta(input, ctx, perInvio)];
  const erroriLive = useMemo(() => controlla(verifica === 'invia'), [m, gettoneNonPrevisto, input, ctx, verifica]); // eslint-disable-line react-hooks/exhaustive-deps
  const erroreDi = (campo: string): string | undefined =>
    ((verifica || toccati.has(campo)) && erroriLive.find((e) => e.campo === campo)?.messaggio) || azione.erroreDi(campo);
  /** Attributi comuni dei campi: chiave per il riepilogo, campo visitato, messaggio di errore. */
  const campo = (nome: string) => ({ 'data-campo': nome, onBlur: () => tocca(nome), errore: erroreDi(nome) });

  const campiConErrore = [...new Set([...(verifica ? erroriLive : []), ...azione.erroriCampi].map((e) => e.campo))].sort((a, b) => posizioneCampo(a) - posizioneCampo(b));
  const riepilogo = campiConErrore.map((c) => ({ campo: c, messaggio: erroreDi(c) })).filter((e): e is { campo: string; messaggio: string } => !!e.messaggio);

  const duplicati =
    corso && isDataValida(m.dataSessione)
      ? trovaDuplicati({ login: sessione.login, codiceCorso: corso.codice, dataSessione: m.dataSessione, id: salvata?.id }, dati.mie)
      : [];
  const integrazione = richiesta && INTEGRAZIONE.has(richiesta.stato) && salvata?.stato === richiesta.stato ? richiesta : undefined;
  const annullabile = !!salvata && ANNULLABILI_DAL_LAVORATORE.has(salvata.stato);
  const occupato = inCorso !== null;

  // --- azioni
  const salva = async (tipo: 'bozza' | 'invia') => {
    setVerifica(tipo);
    if (controlla(tipo === 'invia').length) {
      mostra('errore', tipo === 'invia' ? 'Per inviare la richiesta correggi i campi evidenziati.' : 'Per salvare la bozza correggi i campi evidenziati.');
      focusPrimoErrore(rifModulo.current, rifRiepilogo.current);
      return;
    }
    const daInviare: SalvaRichiestaInput = {
      ...input,
      id: salvata?.id,
      allegatiNuovi: nuovi.map((n) => ({ tipo: n.tipo, nome: n.file.name, mime: n.mime, contenuto: n.file })),
      allegatiRimossi: rimossi,
    };
    setInCorso(tipo);
    let r: Richiesta | undefined;
    try {
      r = await azione.esegui(() => backend.salvaRichiesta(daInviare, tipo));
    } catch (e) {
      if (e instanceof ErroreApi && e.richiestaConferma === 'duplicato') {
        const ok = await conferma({
          titolo: 'Possibile richiesta duplicata',
          testo: `${e.message}\n\nInvia comunque solo se si tratta di un’altra sessione dello stesso giorno (ad esempio mattina e pomeriggio): il coordinatore e l’Ufficio HR/Formazione riceveranno una segnalazione.`,
          etichettaConferma: 'Invia comunque',
        });
        if (ok) r = await azione.prova(() => backend.salvaRichiesta({ ...daInviare, confermaDuplicato: true }, 'invia'));
      } else {
        focusPrimoErrore(rifModulo.current, rifRiepilogo.current);
      }
    } finally {
      setInCorso(null);
    }
    if (!r) return;
    setSporco(false);
    setVerifica(null);
    setToccati(new Set());
    if (tipo === 'invia') {
      mostra('successo', `Richiesta ${r.numero} inviata${r.coordinatoreNome ? ` a ${r.coordinatoreNome}` : ' al coordinatore'}: riceverai un’e-mail con l’esito.`);
      sostituisciPercorso(ROTTE.dettaglio(r.id));
      return;
    }
    mostra('successo', `Bozza ${r.numero} salvata: potrai completarla e inviarla quando vuoi.`);
    setSalvata({ id: r.id, numero: r.numero, stato: r.stato });
    setEsistenti(r.allegati);
    setRimossi([]);
    setNuovi([]);
    // il corso esterno nuovo è stato creato dal server: d'ora in poi si usa quello (niente doppioni)
    if (m.ente === ESTERNO && m.sceltaEsterno === 'nuovo' && r.corsoId) {
      const creato = corsoDaRichiesta(r, sessione.login);
      setStorico((s) => [...s.filter((c) => c.id !== creato.id), creato]);
      setM((p) => ({ ...p, sceltaEsterno: 'storico', corsoStoricoId: creato.id }));
    }
  };

  const annulla = async () => {
    if (!salvata) return;
    const ok = await conferma({
      titolo: 'Annullare la richiesta?',
      testo: `La richiesta ${salvata.numero} verrà annullata e non potrà più essere inviata.${salvata.stato !== 'Bozza' ? '\nIl coordinatore riceverà un avviso.' : ''}${sporco ? '\nLe modifiche non salvate andranno perse.' : ''}`,
      etichettaConferma: 'Annulla la richiesta',
      pericolo: true,
    });
    if (!ok) return;
    setInCorso('annulla');
    const r = await azione.prova(() => backend.annullaRichiesta(salvata.id), 'Richiesta annullata.');
    setInCorso(null);
    if (!r) return;
    setSporco(false);
    sostituisciPercorso(ROTTE.dettaglio(r.id));
  };

  /** Esce dal modulo chiedendo conferma se ci sono modifiche non salvate. */
  const esci = async (percorso: string) => {
    if (sporco) {
      const ok = await conferma({
        titolo: 'Uscire senza salvare?',
        testo: 'Hai modifiche non salvate: se esci andranno perse.\nPer conservarle usa «Salva bozza».',
        etichettaConferma: 'Esci senza salvare',
        pericolo: true,
      });
      if (!ok) return;
      setSporco(false);
    }
    naviga(percorso);
  };

  const vaiAlCampo = (nome: string) => {
    const el = rifModulo.current?.querySelector<HTMLElement>(`[data-campo="${nome}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const p = dati.profilo;
  const titoloPagina = salvata ? (salvata.stato === 'Bozza' ? `Bozza ${salvata.numero}` : `Modifica richiesta ${salvata.numero}`) : 'Nuova richiesta';
  const titoloPrecedente = richiesta && richiesta.ente === DATORE && !dati.catalogo.some((c) => c.id === richiesta.corsoId) ? titoloCorso(richiesta) : undefined;

  return (
    <Pagina titolo={titoloPagina} sottotitolo="Richiesta di riconoscimento delle ore di formazione. I campi con * sono obbligatori per l’invio.">
      {integrazione && (
        <Avviso tono="avviso" titolo={integrazione.stato === 'Integrazione richiesta da HR' ? 'L’Ufficio HR/Formazione chiede un’integrazione' : 'Il coordinatore chiede un’integrazione'}>
          {(integrazione.stato === 'Integrazione richiesta da HR' ? integrazione.noteHR : integrazione.noteCoordinatore) && (
            <p className="avviso-nota">«{integrazione.stato === 'Integrazione richiesta da HR' ? integrazione.noteHR : integrazione.noteCoordinatore}»</p>
          )}
          <p className="avviso-nota">Correggi i dati e premi «Invia al coordinatore».</p>
        </Avviso>
      )}

      <form ref={rifModulo} className="modulo-richiesta" noValidate onSubmit={(e) => e.preventDefault()} aria-label={titoloPagina}>
        {/* ---------------------------------------------------------------- 1 */}
        <Scheda titolo="1. Dati del lavoratore" icona="utente">
          <Griglia colonne={3}>
            <CampoLettura etichetta="Nome e cognome" valore={`${p.nome} ${p.cognome}`} />
            <CampoLettura etichetta="E-mail di contatto" valore={p.emailContatto} />
            <CampoLettura etichetta="Codice fiscale" valore={p.cfMascherato || 'Non registrato'} />
            <CampoLettura etichetta="Area" valore={p.area} />
            <CampoLettura etichetta="Servizio" valore={p.servizio} />
            <CampoLettura etichetta="Centro di costo" valore={p.centroDiCosto} />
            <CampoLettura etichetta="Coordinatore" valore={p.coordinatoreNome} />
          </Griglia>
          {!p.coordinatoreNome && (
            <Avviso tono="avviso" titolo="Nessun coordinatore assegnato">
              Puoi salvare la richiesta in bozza ma non inviarla finché l’Ufficio HR/Formazione non aggiorna l’organigramma.
            </Avviso>
          )}
          <p className="testo-piccolo testo-secondario dati-lavoratore-nota">
            Questi dati arrivano dall’organigramma e non sono modificabili.{' '}
            <button type="button" className="link-testo" onClick={() => void esci(`${ROTTE.profilo}?sezione=variazione`)}>
              Segnala una variazione a HR
            </button>
          </p>
        </Scheda>

        {/* ---------------------------------------------------------------- 2 */}
        <Scheda titolo="2. Attività formativa" icona="file">
          <div className="sezione-modulo">
            <h3>Corso</h3>
            <GruppoRadio etichetta="Ente erogatore" obbligatorio errore={erroreDi('ente')}>
              <SchedaRadio
                name="ente"
                valore={DATORE}
                scelto={m.ente}
                onScegli={(v) => imposta('ente', v)}
                titolo="Datore di lavoro"
                descrizione="Corso a catalogo organizzato da Società Dolce"
                campo="ente"
                invalido={!!erroreDi('ente')}
              />
              <SchedaRadio
                name="ente"
                valore={ESTERNO}
                scelto={m.ente}
                onScegli={(v) => imposta('ente', v)}
                titolo="Committente o altro soggetto"
                descrizione="Corso esterno: Regione, AUSL, Comune, committente o altro ente"
              />
            </GruppoRadio>

            {m.ente === DATORE && (
              <>
                <SelettoreCorso
                  catalogo={dati.catalogo}
                  valore={m.corsoCatalogoId}
                  onCambia={(idCorso) => imposta('corsoCatalogoId', idCorso)}
                  errore={erroreDi('corsoId')}
                  titoloPrecedente={titoloPrecedente}
                />
                {corsoCatalogo && <DettagliCorso corso={corsoCatalogo} />}
              </>
            )}

            {m.ente === ESTERNO && (
              <>
                <GruppoRadio etichetta="Il corso è…">
                  <SchedaRadio
                    name="scelta-esterno"
                    valore="storico"
                    scelto={m.sceltaEsterno}
                    onScegli={(v: SceltaEsterno) => imposta('sceltaEsterno', v)}
                    titolo="Già inserito (storico)"
                    descrizione={storico.length ? `Un corso su più giornate che hai già dichiarato (${storico.length} nel tuo storico)` : 'Il tuo storico è ancora vuoto'}
                    disabled={!storico.length}
                  />
                  <SchedaRadio
                    name="scelta-esterno"
                    valore="nuovo"
                    scelto={m.sceltaEsterno}
                    onScegli={(v: SceltaEsterno) => imposta('sceltaEsterno', v)}
                    titolo="Nuovo corso"
                    descrizione="Inserisci titolo, ente, modalità e durata"
                  />
                </GruppoRadio>
                {m.sceltaEsterno === 'storico' ? (
                  <>
                    <CampoSelezione
                      etichetta="Corso dal tuo storico"
                      obbligatorio
                      value={m.corsoStoricoId}
                      onChange={(e) => imposta('corsoStoricoId', e.target.value)}
                      vuota="Seleziona un corso…"
                      opzioni={storico.map((c) => ({ valore: c.id, etichetta: `${c.titolo} (${c.codice})` }))}
                      aiuto="Nello storico trovi i corsi esterni su più giornate che hai già inserito."
                      {...campo('corsoId')}
                    />
                    {corsoStorico && <DettagliCorso corso={corsoStorico} />}
                  </>
                ) : (
                  <Griglia colonne={2}>
                    <CampoTesto
                      etichetta="Titolo del corso"
                      className="span-2"
                      obbligatorio
                      maxLength={200}
                      placeholder="Es. Convegno regionale sui servizi 0-6"
                      value={m.nuovoTitolo}
                      onChange={(e) => imposta('nuovoTitolo', e.target.value)}
                      {...campo('nuovoCorso.titolo')}
                    />
                    <CampoTesto
                      etichetta="Ente che ha organizzato il corso"
                      maxLength={200}
                      placeholder="Es. AUSL di Bologna"
                      value={m.nuovoNomeEnte}
                      onChange={(e) => imposta('nuovoNomeEnte', e.target.value)}
                    />
                    <CampoSelezione
                      etichetta="Modalità di svolgimento"
                      obbligatorio
                      value={m.nuovaModalita}
                      onChange={(e) => imposta('nuovaModalita', e.target.value as StatoModulo['nuovaModalita'])}
                      vuota="Seleziona…"
                      opzioni={MODALITA.map((x) => ({ valore: x, etichetta: x }))}
                      {...campo('nuovoCorso.modalita')}
                    />
                    <CampoTesto
                      etichetta="Durata complessiva del corso (ore)"
                      obbligatorio
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Es. 16"
                      value={m.nuovaDurata}
                      onChange={(e) => imposta('nuovaDurata', e.target.value)}
                      aiuto="Tutte le giornate del corso, non solo questa sessione."
                      {...campo('nuovoCorso.durataOre')}
                    />
                    <GruppoRadio etichetta="Previste più giornate formative?" obbligatorio errore={erroreDi('nuovoCorso.piuGiornate')} inLinea>
                      <SchedaRadio
                        name="piu-giornate"
                        valore="si"
                        scelto={m.nuovoPiuGiornate}
                        onScegli={(v) => imposta('nuovoPiuGiornate', v)}
                        titolo="Sì"
                        campo="nuovoCorso.piuGiornate"
                        invalido={!!erroreDi('nuovoCorso.piuGiornate')}
                      />
                      <SchedaRadio name="piu-giornate" valore="no" scelto={m.nuovoPiuGiornate} onScegli={(v) => imposta('nuovoPiuGiornate', v)} titolo="No" />
                    </GruppoRadio>
                    <CampoLettura etichetta="Codice univoco del corso" valore={<span className="testo-secondario">Generato automaticamente al salvataggio</span>} />
                    <p className="testo-piccolo testo-secondario span-2 nota-corso-nuovo">
                      Il codice (EXT-…) si crea la prima volta che salvi. Se il corso prevede più giornate, nelle richieste successive lo ritrovi nello storico.
                    </p>
                  </Griglia>
                )}
              </>
            )}
          </div>

          <div className="sezione-modulo">
            <h3>Sessione e presenza</h3>
            <Griglia colonne={3}>
              <CampoTesto
                etichetta="Data della sessione"
                type="date"
                max={oggi}
                obbligatorio
                value={m.dataSessione}
                onChange={(e) => imposta('dataSessione', e.target.value)}
                aiuto="Non può essere nel futuro né in un mese già chiuso."
                {...campo('dataSessione')}
              />
            </Griglia>
            <Griglia colonne={3}>
              <CampoTesto etichetta="Ora inizio sessione" type="time" step={300} obbligatorio value={m.oraInizioSessione} onChange={(e) => impostaOrario('oraInizioSessione', e.target.value)} {...campo('oraInizioSessione')} />
              <CampoTesto etichetta="Ora fine sessione" type="time" step={300} obbligatorio value={m.oraFineSessione} onChange={(e) => impostaOrario('oraFineSessione', e.target.value)} {...campo('oraFineSessione')} />
              <CampoLettura etichetta="Durata della sessione" valore={<Calcolato ore={durataSessione} />} />
              <CampoTesto
                etichetta="Ora di ingresso"
                type="time"
                step={300}
                obbligatorio
                value={m.oraIngresso}
                onChange={(e) => impostaOrario('oraIngresso', e.target.value)}
                aiuto="Quando sei entrato/a: cambiala se sei arrivato/a dopo l’inizio."
                {...campo('oraIngresso')}
              />
              <CampoTesto
                etichetta="Ora di uscita"
                type="time"
                step={300}
                obbligatorio
                value={m.oraUscita}
                onChange={(e) => impostaOrario('oraUscita', e.target.value)}
                aiuto="Quando sei uscito/a: cambiala se sei uscito/a prima della fine."
                {...campo('oraUscita')}
              />
              <CampoLettura etichetta="Ore frequentate" valore={<Calcolato ore={oreFrequentate} />} />
            </Griglia>
            {duplicati.length > 0 && (
              <Avviso tono="avviso" titolo="Hai già una richiesta per questo corso in questa data">
                {duplicati.map((d) => d.numero).join(', ')}. Se è un’altra sessione dello stesso giorno puoi procedere: all’invio ti verrà chiesta una conferma.
              </Avviso>
            )}
            {corso && <OreCorso corso={corso} altre={altre} durataSessione={durataSessione} />}
          </div>

          <div className="sezione-modulo">
            <h3>Ore richieste e note</h3>
            <Griglia colonne={3}>
              <CampoTesto
                etichetta="Ore retribuite richieste"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={m.oreRetribuite}
                onChange={(e) => imposta('oreRetribuite', e.target.value)}
                {...campo('oreRetribuiteRichieste')}
              />
              <CampoTesto
                etichetta="Ore gettone richieste"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                disabled={gettoneNonPrevisto}
                value={gettoneNonPrevisto ? '0' : m.oreGettone}
                onChange={(e) => imposta('oreGettone', e.target.value)}
                aiuto={gettoneNonPrevisto ? 'Per questo corso il gettone non è previsto.' : undefined}
                {...campo('oreGettoneRichieste')}
              />
              <CampoLettura etichetta="Totale richiesto" valore={<TotaleRichiesto ret={m.oreRetribuite} get={gettoneNonPrevisto ? '0' : m.oreGettone} frequentate={oreFrequentate} />} />
            </Griglia>
            <p className="testo-piccolo testo-secondario">
              Ore retribuite + ore gettone non possono superare le ore frequentate. Per i decimali usa la virgola (1,5 = un’ora e mezza).
              {oreFrequentate !== null && oreFrequentate > 0 && !m.oreRetribuite.trim() && !m.oreGettone.trim() && (
                <>
                  {' '}
                  <button type="button" className="link-testo" onClick={() => imposta('oreRetribuite', testoNumero(oreFrequentate))}>
                    Richiedi tutte le {f.numero(oreFrequentate)} ore come retribuite
                  </button>
                </>
              )}
            </p>
            <CampoArea
              etichetta="Note"
              value={m.note}
              maxLength={MAX_LUNGHEZZA_NOTE}
              onChange={(e) => imposta('note', e.target.value)}
              placeholder="Es. sede del corso, docente, motivo dell’uscita anticipata…"
              aiuto={`${m.note.length}/${MAX_LUNGHEZZA_NOTE} caratteri. Le legge il coordinatore.`}
              {...campo('noteLavoratore')}
            />
          </div>
        </Scheda>

        {/* ---------------------------------------------------------------- 3 */}
        <Scheda titolo="3. Allegati" icona="allegato">
          <SezioneAllegati
            richiestaId={salvata?.id}
            esistenti={esistenti}
            rimossi={rimossi}
            nuovi={nuovi}
            onRimossi={(x) => {
              setRimossi(x);
              modificato();
            }}
            onNuovi={(x) => {
              setNuovi(x);
              modificato();
            }}
            errore={azione.erroreDi('allegati')}
          />
        </Scheda>

        {/* ---------------------------------------------------------------- 4 */}
        <Scheda titolo="4. Dichiarazioni" icona="valida">
          <div className="dichiarazioni-modulo">
            <Casella
              etichetta="Confermo di aver partecipato all’attività formativa indicata."
              checked={m.dichiarazioni.partecipazione}
              onChange={(e) => imposta('dichiarazioni', { ...m.dichiarazioni, partecipazione: e.target.checked })}
              errore={erroreDi('dichiarazioni.partecipazione')}
              data-campo="dichiarazioni.partecipazione"
            />
            <Casella
              etichetta="Confermo che i dati inseriti sono corretti e completi."
              checked={m.dichiarazioni.correttezza}
              onChange={(e) => imposta('dichiarazioni', { ...m.dichiarazioni, correttezza: e.target.checked })}
              errore={erroreDi('dichiarazioni.correttezza')}
              data-campo="dichiarazioni.correttezza"
            />
            <Casella
              etichetta="Autorizzo l’invio della richiesta al coordinatore e all’Ufficio HR/Formazione per il riconoscimento delle ore."
              checked={m.dichiarazioni.autorizzazione}
              onChange={(e) => imposta('dichiarazioni', { ...m.dichiarazioni, autorizzazione: e.target.checked })}
              errore={erroreDi('dichiarazioni.autorizzazione')}
              data-campo="dichiarazioni.autorizzazione"
            />
          </div>
          <p className="testo-piccolo testo-secondario">Le dichiarazioni servono per l’invio; puoi salvare la bozza anche senza.</p>
        </Scheda>

        {riepilogo.length > 0 && (
          <div ref={rifRiepilogo} tabIndex={-1} className="riepilogo-errori">
            <Avviso tono="pericolo" titolo={verifica === 'invia' ? 'La richiesta non può ancora essere inviata' : 'Controlla i dati inseriti'}>
              <ul>
                {riepilogo.map((e) => (
                  <li key={e.campo}>
                    {!CAMPI_SENZA_INPUT.has(e.campo) ? (
                      <button type="button" className="link-testo" onClick={() => vaiAlCampo(e.campo)}>
                        {e.messaggio}
                      </button>
                    ) : (
                      e.messaggio
                    )}
                  </li>
                ))}
              </ul>
            </Avviso>
          </div>
        )}

        <div className="barra-azioni barra-azioni-modulo">
          <Pulsante variante="testo" icona="indietro" className="spinta-sinistra" disabled={occupato} onClick={() => void esci(ROTTE.mieRichieste)}>
            Torna alle richieste
          </Pulsante>
          {annullabile && (
            <Pulsante variante="secondario" icona="annulla" className="btn-annulla-richiesta" inCorso={inCorso === 'annulla'} disabled={occupato} onClick={() => void annulla()}>
              Annulla richiesta
            </Pulsante>
          )}
          <Pulsante variante="secondario" icona="salva" inCorso={inCorso === 'bozza'} disabled={occupato} onClick={() => void salva('bozza')}>
            Salva bozza
          </Pulsante>
          <Pulsante icona="invia" inCorso={inCorso === 'invia'} disabled={occupato} onClick={() => void salva('invia')}>
            Invia al coordinatore
          </Pulsante>
        </div>
        {salvata && !sporco && <p className="testo-piccolo testo-secondario stato-salvataggio">Tutte le modifiche sono salvate ({salvata.numero}, {salvata.stato.toLowerCase()}).</p>}
        {sporco && <p className="testo-piccolo testo-secondario stato-salvataggio">Modifiche non ancora salvate.</p>}
      </form>
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
//  Componenti del modulo
// ---------------------------------------------------------------------------
function GruppoRadio({ etichetta, obbligatorio, errore, inLinea, children }: { etichetta: string; obbligatorio?: boolean; errore?: string; inLinea?: boolean; children: ReactNode }) {
  return (
    <fieldset className={`gruppo-scelta${errore ? ' campo-errore' : ''}${inLinea ? ' gruppo-scelta-in-linea' : ''}`}>
      <legend className="campo-etichetta">
        {etichetta}
        {obbligatorio && (
          <span className="obbligatorio" aria-hidden>
            {' '}
            *
          </span>
        )}
      </legend>
      <div className="radio-gruppo">{children}</div>
      {errore && (
        <span className="campo-messaggio-errore" role="alert">
          {errore}
        </span>
      )}
    </fieldset>
  );
}

function SchedaRadio<T extends string>({
  name,
  valore,
  scelto,
  onScegli,
  titolo,
  descrizione,
  disabled,
  campo,
  invalido,
}: {
  name: string;
  valore: T;
  scelto: string;
  onScegli: (v: T) => void;
  titolo: string;
  descrizione?: string;
  disabled?: boolean;
  /** Chiave del campo (per il riepilogo degli errori). */
  campo?: string;
  invalido?: boolean;
}) {
  return (
    <label className={`radio-scheda${disabled ? ' radio-scheda-disabilitata' : ''}`}>
      <input type="radio" name={name} value={valore} checked={scelto === valore} disabled={disabled} onChange={() => onScegli(valore)} data-campo={campo} aria-invalid={invalido || undefined} />
      <span>
        <strong>{titolo}</strong>
        {descrizione && <small>{descrizione}</small>}
      </span>
    </label>
  );
}

function DettagliCorso({ corso: c }: { corso: Corso }) {
  const esterno = c.ente === ESTERNO;
  return (
    <div className="dettagli-corso" aria-label="Dati del corso">
      <Griglia colonne={4}>
        <CampoLettura etichetta="Codice univoco" valore={c.codice} />
        <CampoLettura etichetta="Modalità di svolgimento" valore={c.modalita} />
        <CampoLettura etichetta="Durata complessiva" valore={f.ore(c.durataOre)} />
        {esterno ? (
          <CampoLettura etichetta="Ente" valore={c.nomeEnte ?? c.ente} />
        ) : (
          <CampoLettura etichetta="Gettone previsto" valore={c.gettonePrevisto ? 'Sì' : 'No'} />
        )}
      </Griglia>
    </div>
  );
}

function Calcolato({ ore }: { ore: number | null }) {
  if (ore === null) return <span className="testo-secondario">Calcolata dagli orari</span>;
  return (
    <span className={ore > 0 ? 'calcolato' : 'calcolato calcolato-errato'} aria-live="polite">
      {f.ore(ore)}
    </span>
  );
}

function TotaleRichiesto({ ret, get, frequentate }: { ret: string; get: string; frequentate: number | null }) {
  const totale = numeroCampo(ret) + numeroCampo(get);
  if (!Number.isFinite(totale)) return <span className="testo-secondario">—</span>;
  const oltre = frequentate !== null && totale > frequentate + 0.001;
  return (
    <span className={oltre ? 'calcolato calcolato-errato' : 'calcolato'} aria-live="polite">
      {f.ore(arrotonda2(totale))}
      {frequentate !== null && frequentate > 0 && <span className="testo-secondario"> su {f.ore(frequentate)} frequentate</span>}
    </span>
  );
}

/** R6: ore già dichiarate sullo stesso corso rispetto alla durata complessiva. */
function OreCorso({ corso, altre, durataSessione }: { corso: Corso; altre: Richiesta[]; durataSessione: number | null }) {
  const gia = sessioniGiaDichiarate(altre, corso.codice);
  const conQuesta = durataSessione !== null && durataSessione > 0 ? arrotonda2(gia + durataSessione) : null;
  const oltre = conQuesta !== null && conQuesta > corso.durataOre + 0.001;
  return (
    <Avviso tono={oltre ? 'avviso' : 'info'}>
      Ore già dichiarate per questo corso:{' '}
      <strong>
        {f.numero(gia)} di {f.ore(corso.durataOre)}
      </strong>
      {conQuesta !== null && (
        <>
          {' '}
          · con questa sessione: <strong>{f.ore(conQuesta)}</strong>
        </>
      )}
      {oltre ? ' – oltre la durata complessiva del corso: controlla gli orari.' : '.'}
    </Avviso>
  );
}
