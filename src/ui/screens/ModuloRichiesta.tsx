/**
 * Schermata 3 – Nuova richiesta (anche modifica di una bozza o di una richiesta per cui è
 * stata chiesta un'integrazione).
 *
 * Cosa si può rendicontare:
 *  - Formazione: si parte dal catalogo di Società Dolce (ente erogatore = Datore di lavoro);
 *    se il corso non è a catalogo è un corso esterno (Committente o altro soggetto);
 *  - Diritto allo studio / Riqualifica professionale: solo per i lavoratori a cui l'Ufficio HR
 *    ha assegnato un monte ore; le ore richieste si scalano dal monte ore fino a esaurimento.
 *
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
  consumoMonteOre,
  isDataValida,
  MAX_LUNGHEZZA_NOTE,
  MAX_PAUSA_MINUTI,
  MODALITA,
  MODIFICABILI_DAL_LAVORATORE,
  nomeMese,
  oggiRoma,
  sessioniGiaDichiarate,
  TIPI_PERMESSO,
  titoloRichiesta,
  trovaDuplicati,
  validaRichiesta,
  type Allegato,
  type ChiusuraMensile,
  type ContestoValidazione,
  type Corso,
  type ErroreValidazione,
  type Richiesta,
  type SituazioneMonteOre,
  type StatoRichiesta,
  type Tipologia,
} from '../../domain';
import { Avviso, BarraMonteOre, CampoArea, CampoLettura, CampoSelezione, CampoTesto, Caricamento, Casella, ErroreCaricamento, Griglia, Pagina, Pulsante, Scheda } from '../components/ui';
import { useApp, useConferma, useMessaggi } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import { SezioneAllegati, type FileNuovo } from './lavoratore/CaricaAllegati';
import { focusPrimoErrore, isMeseChiuso, sostituisciPercorso, testoNumero } from './lavoratore/comuni';
import { oreMancanti, Ripartizione } from './lavoratore/Ripartizione';
import { SelettoreCorso } from './lavoratore/SelettoreCorso';
import {
  corsoDaRichiesta,
  DATORE,
  ESTERNO,
  inputDaStato,
  moduloPermesso,
  moduloVuoto,
  numeroCampo,
  presenzaParziale,
  statoDaRichiesta,
  storicoCon,
  validaCompilazione,
  type OrigineCorso,
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
  'tipologia',
  'descrizioneAttivita',
  'corsoId',
  'nuovoCorso.titolo',
  'nuovoCorso.modalita',
  'nuovoCorso.durataOre',
  'nuovoCorso.piuGiornate',
  'dataSessione',
  'oraInizioSessione',
  'oraFineSessione',
  'pausaPrevista',
  'pausaMinuti',
  'oraIngresso',
  'oraUscita',
  'pausaInPresenza',
  'oreRetribuiteRichieste',
  'oreGettoneRichieste',
  'oreNonRetribuiteRichieste',
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

const DESCRIZIONE_TIPOLOGIA: Record<Tipologia, string> = {
  Formazione: 'Un corso di Società Dolce oppure di un altro ente',
  'Diritto allo studio': 'Permesso per lezioni, esami o tirocini: le ore si scalano dal tuo monte ore',
  'Riqualifica professionale': 'Permesso per il percorso di riqualifica: le ore si scalano dal tuo monte ore',
};

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
    <Pagina titolo={`Richiesta ${r.numero}`} sottotitolo={titoloRichiesta(r)}>
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
  /** Dopo il passaggio catalogo <-> corso esterno il fuoco va sul primo campo della nuova sezione. */
  const fuocoOrigine = useRef(false);

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

  useEffect(() => {
    if (!fuocoOrigine.current) return;
    fuocoOrigine.current = false;
    const bersaglio =
      m.origineCorso === 'catalogo'
        ? rifModulo.current?.querySelector<HTMLElement>('.selettore-corso input, .corso-scelto button')
        : rifModulo.current?.querySelector<HTMLElement>('input[name="scelta-esterno"]:checked, input[name="scelta-esterno"]:not(:disabled)');
    bersaglio?.focus();
  }, [m.origineCorso]);

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
  const cambiaOrigine = (origine: OrigineCorso) => {
    fuocoOrigine.current = true;
    imposta('origineCorso', origine);
  };
  const tocca = (campo: string) => setToccati((t) => (t.has(campo) ? t : new Set(t).add(campo)));

  // --- cosa si rendiconta
  const p = dati.profilo;
  const permesso = moduloPermesso(m);
  /** Permessi per cui HR ha assegnato al lavoratore un monte ore attivo. */
  const permessiAttivi = useMemo(() => TIPI_PERMESSO.filter((t) => p.monteOre.some((x) => x.tipo === t && x.attivo)), [p.monteOre]);
  const tipologie: Tipologia[] = ['Formazione', ...permessiAttivi];
  /** La tipologia di una richiesta già salvata non si può cambiare (lo impone il server). */
  const tipologiaBloccata = !!salvata;

  // --- corso scelto e valori calcolati
  const esterno = !permesso && m.origineCorso === 'esterno';
  const corsoCatalogo = !permesso && m.origineCorso === 'catalogo' ? dati.catalogo.find((c) => c.id === m.corsoCatalogoId) : undefined;
  const corsoStorico = esterno && m.sceltaEsterno === 'storico' ? storico.find((c) => c.id === m.corsoStoricoId) : undefined;
  const corso = corsoCatalogo ?? corsoStorico ?? null;
  const gettoneNonPrevisto = corso?.gettonePrevisto === false;
  const input = useMemo(() => inputDaStato(m, gettoneNonPrevisto), [m, gettoneNonPrevisto]);
  const { durataSessione, oreFrequentate } = calcolaOre(input);
  const altre = useMemo(() => dati.mie.filter((r) => r.id !== salvata?.id), [dati.mie, salvata?.id]);
  const parziale = presenzaParziale(m);

  // --- monte ore del permesso valido per la data indicata (se la data manca: quello valido oggi)
  const monte = useMemo<SituazioneMonteOre | null>(() => {
    if (!permesso) return null;
    const delTipo = p.monteOre.filter((x) => x.tipo === m.tipologia && x.attivo);
    const perData = (d: string) => delTipo.find((x) => d >= x.validoDal && d <= x.validoAl);
    return (isDataValida(m.dataSessione) ? perData(m.dataSessione) : perData(oggi)) ?? delTipo[0] ?? null;
  }, [permesso, p.monteOre, m.tipologia, m.dataSessione, oggi]);
  /** Ore ancora disponibili senza contare la richiesta che si sta modificando. */
  const residuoMonte = useMemo(() => (monte ? consumoMonteOre(monte, dati.mie, salvata?.id).oreResidue : 0), [monte, dati.mie, salvata?.id]);

  const ctx = useMemo<ContestoValidazione>(
    () => ({
      login: sessione.login,
      corso,
      altreRichieste: altre,
      meseChiuso: (anno, mese) => isMeseChiuso(dati.chiusure, anno, mese),
      coordinatoreLogin: dati.profilo.coordinatoreEmail ?? dati.profilo.coordinatoreNome,
      profiloCompleto: sessione.profiloCompleto,
      oggi,
      monteOre: permesso ? (monte ? { oreResidue: residuoMonte, validoDal: monte.validoDal, validoAl: monte.validoAl } : null) : undefined,
    }),
    [sessione, corso, altre, dati.chiusure, dati.profilo, oggi, permesso, monte, residuoMonte],
  );
  const controlla = (perInvio: boolean): ErroreValidazione[] => [...validaCompilazione(m, gettoneNonPrevisto, perInvio), ...validaRichiesta(input, ctx, perInvio)];
  const erroriLive = useMemo(() => controlla(verifica === 'invia'), [m, gettoneNonPrevisto, input, ctx, verifica]); // eslint-disable-line react-hooks/exhaustive-deps
  const erroreDi = (campo: string): string | undefined =>
    ((verifica || toccati.has(campo)) && erroriLive.find((e) => e.campo === campo)?.messaggio) || azione.erroreDi(campo);
  /** Attributi comuni dei campi: chiave per il riepilogo, campo visitato, messaggio di errore. */
  const campo = (nome: string) => ({ 'data-campo': nome, onBlur: () => tocca(nome), errore: erroreDi(nome) });

  const campiConErrore = [...new Set([...(verifica ? erroriLive : []), ...azione.erroriCampi].map((e) => e.campo))].sort((a, b) => posizioneCampo(a) - posizioneCampo(b));
  const riepilogo = campiConErrore.map((c) => ({ campo: c, messaggio: erroreDi(c) })).filter((e): e is { campo: string; messaggio: string } => !!e.messaggio);

  const duplicati =
    corso && isDataValida(m.dataSessione)
      ? trovaDuplicati({ login: sessione.login, codiceCorso: corso.codice, dataSessione: m.dataSessione, id: salvata?.id, tipologia: m.tipologia }, dati.mie)
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
      // l'attestato si allega solo per i corsi esterni
      allegatiNuovi: nuovi.filter((n) => esterno || n.tipo !== 'Attestato').map((n) => ({ tipo: n.tipo, nome: n.file.name, mime: n.mime, contenuto: n.file })),
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
    if (esterno && m.sceltaEsterno === 'nuovo' && r.corsoId) {
      const creato = corsoDaRichiesta(r, sessione.login);
      setStorico((s) => [...s.filter((c) => c.id !== creato.id), creato]);
      setM((prec) => ({ ...prec, sceltaEsterno: 'storico', corsoStoricoId: creato.id }));
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

  const titoloPagina = salvata ? (salvata.stato === 'Bozza' ? `Bozza ${salvata.numero}` : `Modifica richiesta ${salvata.numero}`) : 'Nuova richiesta';
  const titoloPrecedente =
    richiesta && richiesta.tipologia === 'Formazione' && richiesta.ente !== ESTERNO && !dati.catalogo.some((c) => c.id === richiesta.corsoId) ? titoloRichiesta(richiesta) : undefined;
  const mostraTipologia = permessiAttivi.length > 0 || permesso;
  let numeroSezione = 0;
  const sezione = (titolo: string) => `${++numeroSezione}. ${titolo}`;

  // --- parti comuni a formazione e permessi
  const campiPausa = (
    <>
      <GruppoRadio etichetta="Era prevista una pausa?" obbligatorio errore={erroreDi('pausaPrevista')} inLinea aiuto="Ad esempio la pausa pranzo: non conta tra le ore.">
        <SchedaRadio
          name="pausa-prevista"
          valore="si"
          scelto={m.pausaPrevista}
          onScegli={(v) => imposta('pausaPrevista', v)}
          titolo="Sì"
          campo="pausaPrevista"
          invalido={!!erroreDi('pausaPrevista')}
        />
        <SchedaRadio name="pausa-prevista" valore="no" scelto={m.pausaPrevista} onScegli={(v) => imposta('pausaPrevista', v)} titolo="No" />
      </GruppoRadio>
      {m.pausaPrevista === 'si' && (
        <CampoTesto
          etichetta="Durata della pausa (minuti)"
          obbligatorio
          inputMode="numeric"
          autoComplete="off"
          placeholder="Es. 60"
          value={m.pausaMinuti}
          onChange={(e) => imposta('pausaMinuti', e.target.value)}
          aiuto={`Da 5 a ${MAX_PAUSA_MINUTI} minuti (un’ora = 60).`}
          {...campo('pausaMinuti')}
        />
      )}
    </>
  );

  const campoNote = (
    <CampoArea
      etichetta="Note"
      value={m.note}
      maxLength={MAX_LUNGHEZZA_NOTE}
      onChange={(e) => imposta('note', e.target.value)}
      placeholder={permesso ? 'Es. sede dell’esame, università o ente, altre informazioni utili…' : 'Es. sede del corso, docente, motivo dell’uscita anticipata…'}
      aiuto={`${m.note.length}/${MAX_LUNGHEZZA_NOTE} caratteri. Le legge il coordinatore.`}
      {...campo('noteLavoratore')}
    />
  );

  return (
    <Pagina
      titolo={titoloPagina}
      sottotitolo={
        permesso
          ? `Richiesta di ore di permesso per ${m.tipologia.toLowerCase()}. I campi con * sono obbligatori per l’invio.`
          : 'Richiesta di riconoscimento delle ore di formazione. I campi con * sono obbligatori per l’invio.'
      }
    >
      {integrazione && (
        <Avviso tono="avviso" titolo={integrazione.stato === 'Integrazione richiesta da HR' ? 'L’Ufficio HR/Formazione chiede un’integrazione' : 'Il coordinatore chiede un’integrazione'}>
          {(integrazione.stato === 'Integrazione richiesta da HR' ? integrazione.noteHR : integrazione.noteCoordinatore) && (
            <p className="avviso-nota">«{integrazione.stato === 'Integrazione richiesta da HR' ? integrazione.noteHR : integrazione.noteCoordinatore}»</p>
          )}
          <p className="avviso-nota">Correggi i dati e premi «Invia al coordinatore».</p>
        </Avviso>
      )}

      <form ref={rifModulo} className="modulo-richiesta" noValidate onSubmit={(e) => e.preventDefault()} aria-label={titoloPagina}>
        {/* ------------------------------------------------- dati del lavoratore */}
        <Scheda titolo={sezione('Dati del lavoratore')} icona="utente">
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

        {/* ------------------------------------------------- cosa si rendiconta */}
        {mostraTipologia && (
          <Scheda titolo={sezione('Cosa vuoi rendicontare?')} icona="lista">
            {tipologiaBloccata ? (
              <>
                <Griglia colonne={3}>
                  <CampoLettura etichetta="Tipologia" valore={m.tipologia} />
                </Griglia>
                <p className="testo-piccolo testo-secondario nota-sotto">
                  La tipologia di una richiesta già salvata non si può cambiare: se è sbagliata, annulla la richiesta e creane una nuova.
                </p>
                {erroreDi('tipologia') && (
                  <span className="campo-messaggio-errore" role="alert">
                    {erroreDi('tipologia')}
                  </span>
                )}
              </>
            ) : (
              <GruppoRadio etichetta="Tipologia" obbligatorio errore={erroreDi('tipologia')} aiuto="Oltre alla formazione vedi solo i permessi che l’Ufficio HR/Formazione ha attivato per te.">
                {tipologie.map((t, i) => (
                  <SchedaRadio
                    key={t}
                    name="tipologia"
                    valore={t}
                    scelto={m.tipologia}
                    onScegli={(v) => imposta('tipologia', v)}
                    titolo={t}
                    descrizione={DESCRIZIONE_TIPOLOGIA[t]}
                    campo={i === 0 ? 'tipologia' : undefined}
                    invalido={!!erroreDi('tipologia')}
                  />
                ))}
              </GruppoRadio>
            )}
          </Scheda>
        )}

        {permesso ? (
          <>
            {/* ----------------------------------------------------- permesso */}
            <Scheda titolo={sezione(`Permesso – ${m.tipologia}`)} icona="orologio">
              <div className="sezione-modulo">
                <h3>Attività</h3>
                <CampoTesto
                  etichetta="Descrizione dell’attività"
                  obbligatorio
                  maxLength={200}
                  placeholder={m.tipologia === 'Diritto allo studio' ? 'Es. Esame di Pedagogia generale – Università di Bologna' : 'Es. Lezione del corso di riqualifica OSS – modulo 3'}
                  value={m.descrizioneAttivita}
                  onChange={(e) => imposta('descrizioneAttivita', e.target.value)}
                  aiuto="Che cosa hai fatto con questo permesso: lezione, esame, tirocinio…"
                  {...campo('descrizioneAttivita')}
                />
              </div>

              <div className="sezione-modulo">
                <h3>Data e orario</h3>
                <Griglia colonne={3}>
                  <CampoTesto
                    etichetta="Data del permesso"
                    type="date"
                    max={oggi}
                    obbligatorio
                    value={m.dataSessione}
                    onChange={(e) => imposta('dataSessione', e.target.value)}
                    aiuto="Non può essere nel futuro, in un mese già chiuso o fuori dal periodo del monte ore."
                    {...campo('dataSessione')}
                  />
                  <CampoTesto etichetta="Ora di inizio" type="time" step={300} obbligatorio value={m.oraInizioSessione} onChange={(e) => impostaOrario('oraInizioSessione', e.target.value)} {...campo('oraInizioSessione')} />
                  <CampoTesto etichetta="Ora di fine" type="time" step={300} obbligatorio value={m.oraFineSessione} onChange={(e) => impostaOrario('oraFineSessione', e.target.value)} {...campo('oraFineSessione')} />
                </Griglia>
                <Griglia colonne={3}>
                  {campiPausa}
                  <CampoLettura etichetta="Ore di permesso richieste" valore={<Calcolato ore={oreFrequentate} />} />
                </Griglia>
              </div>

              <div className="sezione-modulo">
                <h3>Il tuo monte ore</h3>
                <RiquadroMonteOre monte={monte} tipologia={m.tipologia} residuo={residuoMonte} richieste={oreFrequentate} />
              </div>

              <div className="sezione-modulo">{campoNote}</div>
            </Scheda>
          </>
        ) : (
          <>
            {/* -------------------------------------------------------- corso */}
            <Scheda titolo={sezione('Corso')} icona="file">
              {m.origineCorso === 'catalogo' ? (
                <div className="sezione-modulo">
                  <SelettoreCorso catalogo={dati.catalogo} valore={m.corsoCatalogoId} onCambia={(idCorso) => imposta('corsoCatalogoId', idCorso)} errore={erroreDi('corsoId')} titoloPrecedente={titoloPrecedente} />
                  {corsoCatalogo ? (
                    <DettagliCorso corso={corsoCatalogo} />
                  ) : (
                    <div className="origine-corso">
                      <div>
                        <strong>Non trovi il corso nel catalogo?</strong>
                        <p>Allora è un corso esterno (organizzato da un committente o da un altro ente).</p>
                      </div>
                      <Pulsante variante="secondario" icona="aggiungi" onClick={() => cambiaOrigine('esterno')}>
                        Inserisci un corso esterno
                      </Pulsante>
                    </div>
                  )}
                </div>
              ) : (
                <div className="sezione-modulo">
                  <div className="origine-corso origine-corso-esterno">
                    <div>
                      <span className="testatina">Corso esterno</span>
                      <p>
                        Ente erogatore: <strong>{ESTERNO}</strong> (Regione, AUSL, Comune, committente o altro ente). Il corso non è nel catalogo di Società Dolce.
                      </p>
                    </div>
                    <Pulsante variante="secondario" icona="indietro" onClick={() => cambiaOrigine('catalogo')}>
                      Torna al catalogo di Società Dolce
                    </Pulsante>
                  </div>

                  <GruppoRadio etichetta="Quale corso esterno?" obbligatorio>
                    <SchedaRadio
                      name="scelta-esterno"
                      valore="storico"
                      scelto={m.sceltaEsterno}
                      onScegli={(v: SceltaEsterno) => imposta('sceltaEsterno', v)}
                      titolo="Un corso esterno che hai già inserito"
                      descrizione={
                        storico.length
                          ? `Per aggiungere un’altra giornata dello stesso corso (${storico.length === 1 ? '1 corso disponibile' : `${storico.length} corsi disponibili`})`
                          : 'Per aggiungere un’altra giornata dello stesso corso: non ne hai ancora inseriti'
                      }
                      disabled={!storico.length}
                    />
                    <SchedaRadio
                      name="scelta-esterno"
                      valore="nuovo"
                      scelto={m.sceltaEsterno}
                      onScegli={(v: SceltaEsterno) => imposta('sceltaEsterno', v)}
                      titolo="Un nuovo corso esterno"
                      descrizione="Inserisci titolo, ente, modalità e durata"
                    />
                  </GruppoRadio>

                  {m.sceltaEsterno === 'storico' ? (
                    <>
                      <CampoSelezione
                        etichetta="Corso esterno già inserito"
                        obbligatorio
                        value={m.corsoStoricoId}
                        onChange={(e) => imposta('corsoStoricoId', e.target.value)}
                        vuota="Seleziona un corso…"
                        opzioni={storico.map((c) => ({ valore: c.id, etichetta: `${c.titolo} (${c.codice})` }))}
                        aiuto="Qui trovi i corsi esterni su più giornate che hai inserito nelle richieste precedenti: scegline uno per dichiarare un’altra giornata."
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
                      <p className="testo-piccolo testo-secondario span-2 nota-corso-nuovo">
                        Il codice univoco del corso (EXT-…) si crea la prima volta che salvi. Se il corso prevede più giornate, nelle richieste successive lo ritrovi tra i
                        corsi esterni che hai già inserito. Il coordinatore può correggere titolo e dati del corso prima di approvare.
                      </p>
                    </Griglia>
                  )}
                </div>
              )}
            </Scheda>

            {/* --------------------------------------------- sessione e presenza */}
            <Scheda titolo={sezione('Sessione e presenza')} icona="orologio">
              <div className="sezione-modulo">
                <h3>Orario della sessione</h3>
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
                  <CampoTesto etichetta="Ora inizio sessione" type="time" step={300} obbligatorio value={m.oraInizioSessione} onChange={(e) => impostaOrario('oraInizioSessione', e.target.value)} {...campo('oraInizioSessione')} />
                  <CampoTesto etichetta="Ora fine sessione" type="time" step={300} obbligatorio value={m.oraFineSessione} onChange={(e) => impostaOrario('oraFineSessione', e.target.value)} {...campo('oraFineSessione')} />
                </Griglia>
                <Griglia colonne={3}>
                  {campiPausa}
                  <CampoLettura etichetta={m.pausaPrevista === 'si' ? 'Durata della sessione (al netto della pausa)' : 'Durata della sessione'} valore={<Calcolato ore={durataSessione} />} />
                </Griglia>
              </div>

              <div className="sezione-modulo">
                <h3>La tua presenza</h3>
                <Griglia colonne={3}>
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
                  {m.pausaPrevista === 'si' && parziale && (
                    <GruppoRadio
                      etichetta="Eri presente a cavallo della pausa?"
                      inLinea
                      className="span-tutto"
                      aiuto="Rispondi «No» se sei uscito/a prima della pausa o sei entrato/a dopo: in quel caso la pausa non viene tolta dalle tue ore frequentate."
                    >
                      <SchedaRadio name="pausa-in-presenza" valore="si" scelto={m.pausaInPresenza} onScegli={(v) => imposta('pausaInPresenza', v)} titolo="Sì" campo="pausaInPresenza" />
                      <SchedaRadio name="pausa-in-presenza" valore="no" scelto={m.pausaInPresenza} onScegli={(v) => imposta('pausaInPresenza', v)} titolo="No" />
                    </GruppoRadio>
                  )}
                </Griglia>
                {duplicati.length > 0 && (
                  <Avviso tono="avviso" titolo="Hai già una richiesta per questo corso in questa data">
                    {duplicati.map((d) => d.numero).join(', ')}. Se è un’altra sessione dello stesso giorno puoi procedere: all’invio ti verrà chiesta una conferma.
                  </Avviso>
                )}
                {corso && <OreCorso corso={corso} altre={altre} durataSessione={durataSessione} />}
              </div>
            </Scheda>

            {/* --------------------------------------------- ripartizione delle ore */}
            <Scheda titolo={sezione('Ripartizione delle ore')} icona="grafico">
              <div className="sezione-modulo">
                <p className="testo-secondario nota-sopra">
                  Indica come ripartire le ore frequentate: la somma delle tre voci deve essere <strong>uguale</strong> alle ore frequentate. Per i decimali usa la virgola
                  (1,5 = un’ora e mezza).
                </p>
                <Griglia colonne={3}>
                  <CampoTesto
                    etichetta="Ore retribuite"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={m.oreRetribuite}
                    onChange={(e) => imposta('oreRetribuite', e.target.value)}
                    aiuto="Ore da riconoscere come orario di lavoro."
                    {...campo('oreRetribuiteRichieste')}
                  />
                  <CampoTesto
                    etichetta="Ore a gettone"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    disabled={gettoneNonPrevisto}
                    value={gettoneNonPrevisto ? '0' : m.oreGettone}
                    onChange={(e) => imposta('oreGettone', e.target.value)}
                    aiuto={gettoneNonPrevisto ? 'Per questo corso il gettone non è previsto.' : 'Ore da riconoscere con il gettone di presenza.'}
                    {...campo('oreGettoneRichieste')}
                  />
                  <CampoTesto
                    etichetta="Ore da non retribuire"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={m.oreNonRetribuite}
                    onChange={(e) => imposta('oreNonRetribuite', e.target.value)}
                    aiuto="Ore frequentate che non vanno pagate (né retribuite né a gettone)."
                    {...campo('oreNonRetribuiteRichieste')}
                  />
                </Griglia>
                <Ripartizione
                  valori={[m.oreRetribuite, gettoneNonPrevisto ? '' : m.oreGettone, m.oreNonRetribuite]}
                  frequentate={oreFrequentate}
                  senzaOrari="Indica gli orari della sessione e della tua presenza: qui vedrai quante ore restano da ripartire."
                  azioni={(diff, vuoti) =>
                    vuoti ? (
                      <button type="button" className="link-testo" onClick={() => imposta('oreRetribuite', testoNumero(oreFrequentate))}>
                        Richiedi tutte le {f.numero(oreFrequentate ?? 0)} ore come retribuite
                      </button>
                    ) : (
                      <button type="button" className="link-testo" onClick={() => imposta('oreNonRetribuite', testoNumero(arrotonda2(numeroCampo(m.oreNonRetribuite) + diff)))}>
                        {oreMancanti(diff)} in «Ore da non retribuire»
                      </button>
                    )
                  }
                />
              </div>
              <div className="sezione-modulo">{campoNote}</div>
            </Scheda>
          </>
        )}

        {/* ---------------------------------------------------------- allegati */}
        <Scheda titolo={sezione('Allegati')} icona="allegato">
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
            attestato={esterno}
            nota={
              permesso
                ? 'Per i permessi non serve l’attestato: se vuoi puoi allegare un documento giustificativo.'
                : esterno
                  ? 'Per i corsi esterni puoi allegare l’attestato rilasciato dall’ente: è facoltativo.'
                  : 'Per i corsi di Società Dolce l’attestato non va allegato.'
            }
            descrizioneAltra={
              permesso
                ? 'Ad esempio certificato di frequenza, statino dell’esame o altra documentazione utile.'
                : 'Ad esempio foglio firme, programma del corso o altra documentazione utile.'
            }
          />
        </Scheda>

        {/* ------------------------------------------------------ dichiarazioni */}
        <Scheda titolo={sezione('Dichiarazioni')} icona="valida">
          <div className="dichiarazioni-modulo">
            <Casella
              etichetta={permesso ? 'Confermo di aver usufruito del permesso nella data e negli orari indicati.' : 'Confermo di aver partecipato all’attività formativa indicata.'}
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
              etichetta={
                permesso
                  ? 'Autorizzo l’invio della richiesta al coordinatore e all’Ufficio HR/Formazione per il riconoscimento delle ore di permesso.'
                  : 'Autorizzo l’invio della richiesta al coordinatore e all’Ufficio HR/Formazione per il riconoscimento delle ore.'
              }
              checked={m.dichiarazioni.autorizzazione}
              onChange={(e) => imposta('dichiarazioni', { ...m.dichiarazioni, autorizzazione: e.target.checked })}
              errore={erroreDi('dichiarazioni.autorizzazione')}
              data-campo="dichiarazioni.autorizzazione"
            />
          </div>
          <p className="testo-piccolo testo-secondario nota-sotto">Le dichiarazioni servono per l’invio; puoi salvare la bozza anche senza.</p>
        </Scheda>

        {riepilogo.length > 0 && (
          <div ref={rifRiepilogo} tabIndex={-1} className="riepilogo-errori">
            <Avviso tono="pericolo" titolo={verifica === 'invia' ? 'La richiesta non può ancora essere inviata' : 'Controlla i dati inseriti'}>
              <ul>
                {riepilogo.map((e) => (
                  <li key={e.campo}>
                    {!CAMPI_SENZA_INPUT.has(e.campo) && !(e.campo === 'tipologia' && tipologiaBloccata) ? (
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
function GruppoRadio({
  etichetta,
  obbligatorio,
  errore,
  inLinea,
  aiuto,
  className,
  children,
}: {
  etichetta: string;
  obbligatorio?: boolean;
  errore?: string;
  inLinea?: boolean;
  aiuto?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={`gruppo-scelta${errore ? ' campo-errore' : ''}${inLinea ? ' gruppo-scelta-in-linea' : ''}${className ? ` ${className}` : ''}`}>
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
      {aiuto && !errore && <span className="campo-aiuto">{aiuto}</span>}
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

/** Dati del corso scelto: l'ente erogatore è dedotto dal corso e non si modifica. */
function DettagliCorso({ corso: c }: { corso: Corso }) {
  const esterno = c.ente === ESTERNO;
  return (
    <div className="dettagli-corso" aria-label="Dati del corso">
      <Griglia colonne={4}>
        <CampoLettura etichetta="Ente erogatore" valore={esterno ? `${ESTERNO}${c.nomeEnte ? ` – ${c.nomeEnte}` : ''}` : `${DATORE} (Società Dolce)`} />
        <CampoLettura etichetta="Codice univoco" valore={c.codice} />
        <CampoLettura etichetta="Modalità di svolgimento" valore={c.modalita} />
        <CampoLettura etichetta="Durata complessiva" valore={f.ore(c.durataOre)} />
        {!esterno && <CampoLettura etichetta="Gettone previsto" valore={c.gettonePrevisto ? 'Sì' : 'No'} />}
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

/** Monte ore del permesso: situazione, residuo disponibile e residuo dopo questa richiesta. */
function RiquadroMonteOre({ monte, tipologia, residuo, richieste }: { monte: SituazioneMonteOre | null; tipologia: Tipologia; residuo: number; richieste: number | null }) {
  if (!monte) {
    return (
      <Avviso tono="pericolo" titolo="Nessun monte ore attivo">
        Non hai un monte ore attivo per «{tipologia}»: rivolgiti all’Ufficio HR/Formazione.
      </Avviso>
    );
  }
  const ore = richieste !== null && richieste > 0 ? richieste : null;
  const dopo = ore !== null ? arrotonda2(residuo - ore) : null;
  const oltre = dopo !== null && dopo < -0.005;
  return (
    <div className={`riquadro-monte${oltre ? ' riquadro-monte-esaurito' : ''}`}>
      <div className="riquadro-monte-testata">
        <span className="testatina">{monte.tipo}</span>
        <span className="testo-secondario testo-piccolo">
          {f.ore(monte.oreTotali)} assegnate · valido dal {f.data(monte.validoDal)} al {f.data(monte.validoAl)}
        </span>
      </div>
      <BarraMonteOre situazione={monte} />
      <dl className="elenco-dati riquadro-monte-dati">
        <div>
          <dt>Residuo disponibile</dt>
          <dd>{f.ore(residuo)}</dd>
        </div>
        <div>
          <dt>Ore di questa richiesta</dt>
          <dd>{ore !== null ? f.ore(ore) : '—'}</dd>
        </div>
        <div>
          <dt>Residuo dopo questa richiesta</dt>
          <dd className={oltre ? 'testo-pericolo' : undefined} aria-live="polite">
            {dopo !== null ? f.ore(dopo) : '—'}
          </dd>
        </div>
      </dl>
      {oltre ? (
        <Avviso tono="pericolo" titolo={residuo <= 0 ? 'Monte ore esaurito' : 'Ore oltre il monte ore residuo'}>
          {residuo <= 0 ? 'Il tuo monte ore è esaurito: non puoi richiedere altre ore.' : `Stai chiedendo ${f.numero(ore ?? 0)} ore ma nel tuo monte ore ne restano ${f.numero(residuo)}: la richiesta non può essere inviata.`}
        </Avviso>
      ) : (
        <p className="testo-piccolo testo-secondario">
          Le ore richieste si scalano dal monte ore: restano «in approvazione» finché il coordinatore e l’Ufficio HR/Formazione non decidono.
        </p>
      )}
    </div>
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
