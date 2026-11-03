/**
 * Schermata 5 – Dettaglio della richiesta (tutti i ruoli), con le azioni consentite:
 *  - lavoratore: modifica e annullamento;
 *  - coordinatore: approvazione, respingimento, richiesta di integrazione;
 *  - Formazione HR: validazione della singola richiesta e storico delle modifiche.
 */
import '../../styles/lavoratore.css';
import type { ReactNode } from 'react';
import { ErroreApi, type DettaglioRichiesta } from '../../data/api';
import { INFO_STATI, nomeMese, type Richiesta, type VoceRegistro } from '../../domain';
import { Icona } from '../components/Icona';
import { Avviso, BadgeStato, Caricamento, ErroreCaricamento, Etichetta, Pagina, Pulsante, PulsanteIcona, Scheda, Vuoto } from '../components/ui';
import { useApp, useConferma } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import { ETICHETTE_CAMPI, titoloCorso, tornaIndietro, useAllegatiRichiesta } from './lavoratore/comuni';
import { PannelloDecisione } from './lavoratore/PannelloDecisione';

export function Dettaglio({ id }: { id: string }) {
  const { backend, sessione, ha } = useApp();
  const dati = useCarica(() => backend.getDettaglio(id), [backend, id]);

  // elenco "di provenienza" se la pagina è stata aperta direttamente (es. dal link nell'e-mail)
  const proprio = dati.dati?.richiesta.login === sessione.login;
  const gestione = ha('coordinatore') || ha('hr') || ha('admin');
  const elenco = proprio || !gestione ? ROTTE.mieRichieste : ha('hr') || ha('admin') ? ROTTE.validazione : ROTTE.team;
  const indietro = () => tornaIndietro(elenco);

  if (dati.errore) {
    return (
      <Pagina titolo="Dettaglio richiesta" indietro={indietro}>
        <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />
      </Pagina>
    );
  }
  if (!dati.dati) {
    return (
      <Pagina titolo="Dettaglio richiesta" indietro={indietro}>
        <Caricamento testo="Caricamento della richiesta…" />
      </Pagina>
    );
  }
  return <ContenutoDettaglio d={dati.dati} ricarica={dati.ricarica} indietro={indietro} elenco={elenco} />;
}

function ContenutoDettaglio({ d, ricarica, indietro, elenco }: { d: DettaglioRichiesta; ricarica: () => Promise<void>; indietro: () => void; elenco: string }) {
  const { backend, sessione } = useApp();
  const conferma = useConferma();
  const azione = useAzione();
  const r = d.richiesta;
  const proprio = r.login === sessione.login;
  const info = INFO_STATI[r.stato];

  const annulla = async () => {
    const ok = await conferma({
      titolo: 'Annullare la richiesta?',
      testo: `La richiesta ${r.numero} (${titoloCorso(r)}) verrà annullata e non potrà più essere inviata.${r.stato !== 'Bozza' ? '\nIl coordinatore riceverà un avviso.' : ''}`,
      etichettaConferma: 'Annulla la richiesta',
      pericolo: true,
    });
    if (!ok) return;
    try {
      await azione.esegui(() => backend.annullaRichiesta(r.id), 'Richiesta annullata.');
      await ricarica();
    } catch (e) {
      // stato cambiato nel frattempo: mostro quello aggiornato
      if (e instanceof ErroreApi && e.codice === 'CONFLITTO') await ricarica();
    }
  };

  const azioniPagina =
    d.azioni.modifica || d.azioni.annulla ? (
      <>
        {d.azioni.modifica && (
          <Pulsante icona="modifica" onClick={() => naviga(ROTTE.modificaRichiesta(r.id))}>
            {r.stato === 'Bozza' ? 'Modifica e invia' : 'Modifica'}
          </Pulsante>
        )}
        {d.azioni.annulla && (
          <Pulsante variante="secondario" icona="annulla" inCorso={azione.inCorso} onClick={() => void annulla()}>
            Annulla richiesta
          </Pulsante>
        )}
      </>
    ) : undefined;

  const decisione = d.azioni.esitoCoordinatore ? 'coordinatore' : d.azioni.esitoHR ? 'hr' : null;

  return (
    <Pagina
      titolo={`Richiesta ${r.numero}`}
      indietro={indietro}
      sottotitolo={
        <span className="dettaglio-sottotitolo">
          <BadgeStato stato={r.stato} />
          <span>{info.descrizione}</span>
          {r.possibileDuplicato && (
            <Etichetta tono="pericolo" titolo="Stesso lavoratore, stesso corso e stessa data di un'altra richiesta">
              <Icona nome="duplicato" dimensione={14} /> Possibile duplicato
            </Etichetta>
          )}
        </span>
      }
      azioni={azioniPagina}
    >
      <Avvisi d={d} proprio={proprio} />

      <div className="dettaglio-colonne">
        <div className="dettaglio-principale">
          <Scheda titolo="Lavoratore" icona="utente">
            <dl className="elenco-dati">
              <Dato etichetta="Nome e cognome" valore={`${r.nome} ${r.cognome}`} />
              <Dato etichetta="Utente Microsoft 365" valore={r.login} />
              <Dato etichetta="E-mail di contatto" valore={r.emailContatto} />
              <Dato etichetta="Area" valore={r.area} />
              <Dato etichetta="Servizio" valore={r.servizio} />
              <Dato etichetta="Centro di costo" valore={r.centroDiCosto} />
              <Dato etichetta="Coordinatore" valore={r.coordinatoreNome} />
            </dl>
          </Scheda>

          <Scheda titolo="Corso" icona="file">
            <dl className="elenco-dati">
              <Dato
                etichetta="Titolo"
                className="span-tutto"
                valore={
                  <>
                    {titoloCorso(r)} {r.titoloCorsoLibero && <Etichetta tono="info">Corso esterno</Etichetta>}
                  </>
                }
              />
              <Dato etichetta="Codice univoco" valore={r.codiceCorso} />
              <Dato etichetta="Ente erogatore" valore={r.ente} />
              <Dato etichetta="Modalità di svolgimento" valore={r.modalita} />
              <Dato etichetta="Durata complessiva" valore={f.ore(r.durataCorso)} />
              <Dato etichetta="Più giornate formative" valore={r.piuGiornate ? 'Sì' : 'No'} />
            </dl>
          </Scheda>

          <Scheda titolo="Sessione e presenza" icona="orologio">
            <dl className="elenco-dati">
              <Dato etichetta="Data della sessione" valore={f.data(r.dataSessione)} />
              <Dato etichetta="Orario della sessione" valore={`${r.oraInizioSessione} – ${r.oraFineSessione}`} />
              <Dato etichetta="Durata della sessione" valore={f.ore(r.durataSessione)} />
              <Dato etichetta="Orario di presenza" valore={`${r.oraIngresso} – ${r.oraUscita}`} />
              <Dato etichetta="Ore frequentate" valore={<strong>{f.ore(r.oreFrequentate)}</strong>} />
              <Dato etichetta="Mese di competenza" valore={`${nomeMese(r.meseCompetenza)} ${r.annoCompetenza}`} />
            </dl>
          </Scheda>

          <Scheda titolo="Ore" icona="grafico">
            <TabellaOre r={r} />
          </Scheda>

          <Allegati r={r} />

          <Note r={r} />
        </div>

        <div className="dettaglio-laterale">
          {decisione && <PannelloDecisione key={`${r.id}-${r.stato}`} ruolo={decisione} richiesta={r} onFatto={ricarica} />}

          <Scheda titolo="Date" icona="calendario">
            <dl className="elenco-dati elenco-dati-compatto">
              <Dato etichetta="Creazione" valore={f.dataOra(r.creatoIl)} />
              <Dato etichetta="Invio al coordinatore" valore={f.dataOra(r.inviatoIl)} />
              <Dato etichetta="Approvazione del coordinatore" valore={f.dataOra(r.approvatoCoordIl)} />
              <Dato etichetta="Validazione HR" valore={f.dataOra(r.validatoHRIl)} />
              <Dato etichetta="Ultima modifica" valore={`${f.dataOra(r.modificatoIl)}${r.modificatoDa ? ` · ${r.modificatoDa}` : ''}`} />
              {r.stato === 'In attesa del coordinatore' && r.giorniAttesa > 0 && (
                <Dato etichetta="In attesa da" valore={`${r.giorniAttesa} ${r.giorniAttesa === 1 ? 'giorno lavorativo' : 'giorni lavorativi'}`} />
              )}
              {r.periodoChiusura && <Dato etichetta="Chiusura mensile" valore={r.periodoChiusura} />}
            </dl>
          </Scheda>

          <Storico voci={d.storico} completo={d.storico.some((v) => v.campo !== 'Stato')} />
        </div>
      </div>

      <div className="barra-azioni">
        <Pulsante variante="secondario" icona="indietro" onClick={() => naviga(elenco)}>
          {elenco === ROTTE.mieRichieste ? 'Torna alle mie richieste' : elenco === ROTTE.team ? 'Torna alle richieste del team' : 'Torna alla validazione'}
        </Pulsante>
      </div>
    </Pagina>
  );
}

function Dato({ etichetta, valore, className }: { etichetta: string; valore: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt>{etichetta}</dt>
      <dd>{valore === undefined || valore === null || valore === '' ? '—' : valore}</dd>
    </div>
  );
}

/** Avvisi in testa: duplicati, mese chiuso, integrazioni e respingimenti. */
function Avvisi({ d, proprio }: { d: DettaglioRichiesta; proprio: boolean }) {
  const r = d.richiesta;
  const integrazione = r.stato === 'Integrazione richiesta dal coordinatore' || r.stato === 'Integrazione richiesta da HR';
  const notaIntegrazione = r.stato === 'Integrazione richiesta da HR' ? r.noteHR : r.noteCoordinatore;
  return (
    <>
      {d.duplicati.length > 0 && (
        <Avviso tono="pericolo" titolo="Possibile richiesta duplicata">
          Stesso lavoratore, stesso corso e stessa data di: {d.duplicati.join(', ')}. Verifica che non si tratti della stessa sessione.
        </Avviso>
      )}
      {d.meseChiuso && (
        <Avviso tono="info" titolo="Mese chiuso">
          {nomeMese(r.meseCompetenza)} {r.annoCompetenza} è stato chiuso dall’Ufficio HR/Formazione: la richiesta non è più modificabile.
        </Avviso>
      )}
      {integrazione && (
        <Avviso tono="avviso" titolo={r.stato === 'Integrazione richiesta da HR' ? 'L’Ufficio HR/Formazione chiede un’integrazione' : 'Il coordinatore chiede un’integrazione'}>
          {notaIntegrazione && <p className="avviso-nota">«{notaIntegrazione}»</p>}
          {proprio && d.azioni.modifica && (
            <p className="avviso-nota">
              <a href={`#${ROTTE.modificaRichiesta(r.id)}`}>Correggi la richiesta e inviala di nuovo</a>.
            </p>
          )}
        </Avviso>
      )}
      {(r.stato === 'Respinta dal coordinatore' || r.stato === 'Respinta da HR') && (
        <Avviso tono="pericolo" titolo={r.stato}>
          Motivazione: {(r.stato === 'Respinta da HR' ? r.noteHR : r.noteCoordinatore) ?? 'non indicata.'}
        </Avviso>
      )}
      {r.segnalataHR && r.stato === 'In attesa del coordinatore' && (
        <Avviso tono="avviso">In attesa del coordinatore da {r.giorniAttesa} giorni lavorativi: la richiesta è stata segnalata all’Ufficio HR/Formazione.</Avviso>
      )}
    </>
  );
}

function TabellaOre({ r }: { r: Richiesta }) {
  const somma = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  const righe: { voce: string; richieste?: number; coord?: number; hr?: number }[] = [
    { voce: 'Retribuite', richieste: r.oreRetribuiteRichieste, coord: r.oreRetribuiteCoord, hr: r.oreRetribuiteHR },
    { voce: 'Gettone', richieste: r.oreGettoneRichieste, coord: r.oreGettoneCoord, hr: r.oreGettoneHR },
    {
      voce: 'Totale',
      richieste: r.oreRetribuiteRichieste + r.oreGettoneRichieste,
      coord: somma(r.oreRetribuiteCoord, r.oreGettoneCoord),
      hr: somma(r.oreRetribuiteHR, r.oreGettoneHR),
    },
  ];
  return (
    <>
      <div className="tabella-ore-contenitore">
        <table className="tabella-ore">
          <caption className="sr-only">Ore richieste, riconosciute dal coordinatore e approvate da HR</caption>
          <thead>
            <tr>
              <th scope="col">Ore</th>
              <th scope="col" className="num">
                Richieste
              </th>
              <th scope="col" className="num">
                Riconosciute coordinatore
              </th>
              <th scope="col" className="num">
                Approvate HR
              </th>
            </tr>
          </thead>
          <tbody>
            {righe.map((x) => (
              <tr key={x.voce} className={x.voce === 'Totale' ? 'riga-totale' : undefined}>
                <th scope="row">{x.voce}</th>
                <td className="num">{f.ore(x.richieste)}</td>
                <td className="num">{f.ore(x.coord)}</td>
                <td className="num">{f.ore(x.hr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="testo-piccolo testo-secondario">
        Ore frequentate: <strong>{f.ore(r.oreFrequentate)}</strong>. Il trattino «—» indica un valore non ancora inserito.
      </p>
    </>
  );
}

function Allegati({ r }: { r: Richiesta }) {
  const allegati = useAllegatiRichiesta();
  const senzaAttestato = !r.allegati.some((a) => a.tipo === 'Attestato');
  return (
    <Scheda titolo={`Allegati (${r.allegati.length})`} icona="allegato" azioni={senzaAttestato ? <Etichetta tono="avviso">Attestato non allegato</Etichetta> : undefined}>
      {r.allegati.length === 0 ? (
        <Vuoto titolo="Nessun allegato" icona="allegato" />
      ) : (
        <ul className="allegati">
          {r.allegati.map((a) => (
            <li key={a.id} className="allegato">
              <Icona nome="file" />
              <button type="button" className="allegato-nome link-file" onClick={() => void allegati.apri(r.id, a)} disabled={allegati.inCorso === a.id} title={`Apri ${a.nome}`}>
                {a.nome}
              </button>
              <Etichetta tono={a.tipo === 'Attestato' ? 'successo' : 'neutro'}>{a.tipo}</Etichetta>
              <small className="testo-secondario nascosto-mobile">
                {f.dimensioneFile(a.dimensione)} · {f.data(a.caricatoIl)}
              </small>
              <PulsanteIcona icona="visualizza" etichetta={`Apri ${a.nome}`} onClick={() => void allegati.apri(r.id, a)} disabled={allegati.inCorso === a.id} />
              <PulsanteIcona icona="scarica" etichetta={`Scarica ${a.nome}`} onClick={() => void allegati.scarica(r.id, a)} disabled={allegati.inCorso === a.id} />
            </li>
          ))}
        </ul>
      )}
    </Scheda>
  );
}

function Note({ r }: { r: Richiesta }) {
  const dich = r.dichiarazioni;
  return (
    <Scheda titolo="Note e dichiarazioni" icona="info">
      <div className="note-dettaglio">
        {!r.noteLavoratore && !r.noteCoordinatore && !r.noteHR && <p className="testo-secondario">Nessuna nota.</p>}
        {r.noteLavoratore && (
          <div>
            <h3 className="titoletto">Note del lavoratore</h3>
            <div className="nota-box">{r.noteLavoratore}</div>
          </div>
        )}
        {r.noteCoordinatore && (
          <div>
            <h3 className="titoletto">Nota del coordinatore</h3>
            <div className="nota-box nota-coordinatore">{r.noteCoordinatore}</div>
          </div>
        )}
        {r.noteHR && (
          <div>
            <h3 className="titoletto">Nota dell’Ufficio HR/Formazione</h3>
            <div className="nota-box nota-hr">{r.noteHR}</div>
          </div>
        )}
        <div>
          <h3 className="titoletto">Dichiarazioni del lavoratore</h3>
          <ul className="dichiarazioni">
            <Dichiarazione ok={dich.partecipazione}>Partecipazione al corso</Dichiarazione>
            <Dichiarazione ok={dich.correttezza}>Correttezza dei dati</Dichiarazione>
            <Dichiarazione ok={dich.autorizzazione}>Autorizzazione all’invio</Dichiarazione>
          </ul>
        </div>
      </div>
    </Scheda>
  );
}

function Dichiarazione({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={ok ? 'dichiarazione-si' : 'dichiarazione-no'}>
      <Icona nome={ok ? 'approva' : 'chiudi'} dimensione={16} />
      <span>
        {children}
        <span className="sr-only">{ok ? ': confermata' : ': non confermata'}</span>
      </span>
    </li>
  );
}

/** Ordine delle voci registrate nello stesso istante: creazione, modifiche, cambi di stato. */
function rangoVoce(v: VoceRegistro): number {
  if (v.azione === 'Creazione richiesta') return 0;
  return v.campo === 'Stato' ? 2 : 1;
}

/** Ordine cronologico; a parità di istante segue la catena degli stati (prima -> dopo). */
function ordinaStorico(voci: readonly VoceRegistro[]): VoceRegistro[] {
  return [...voci].sort((a, b) => {
    const d = a.data.localeCompare(b.data);
    if (d !== 0) return d;
    const r = rangoVoce(a) - rangoVoce(b);
    if (r !== 0) return r;
    if (a.campo === 'Stato' && b.campo === 'Stato') {
      if (a.dopo && a.dopo === b.prima) return -1;
      if (b.dopo && b.dopo === a.prima) return 1;
    }
    return 0;
  });
}

function Storico({ voci, completo }: { voci: VoceRegistro[]; completo: boolean }) {
  // ordine cronologico: dalla creazione all'ultima azione
  const ordinate = ordinaStorico(voci);
  return (
    <Scheda titolo={completo ? 'Storico delle modifiche' : 'Storico degli stati'} icona="storico">
      {ordinate.length === 0 ? (
        <p className="testo-secondario">Nessuna voce nello storico.</p>
      ) : (
        <ol className="cronologia">
          {ordinate.map((v) => (
            <li key={v.id}>
              <time dateTime={v.data}>{f.dataOra(v.data)}</time>
              <div className="cronologia-azione">{v.azione}</div>
              {v.campo && v.campo !== 'Stato' && (v.prima !== undefined || v.dopo !== undefined) && (
                <div className="cronologia-modifica">
                  {ETICHETTE_CAMPI[v.campo] ?? v.campo}: <del>{v.prima || '—'}</del> <span aria-hidden>→</span>
                  <span className="sr-only">diventa</span> <ins>{v.dopo || '—'}</ins>
                </div>
              )}
              {v.campo === 'Stato' && v.prima && <div className="testo-piccolo testo-secondario">da «{v.prima}»</div>}
              <div className="testo-piccolo testo-secondario">{v.autore === v.ruolo ? v.ruolo : `${v.autore} · ${v.ruolo}`}</div>
              {v.nota && <div className="nota-box cronologia-nota">{v.nota}</div>}
            </li>
          ))}
        </ol>
      )}
    </Scheda>
  );
}
