/**
 * Il mio profilo (lavoratore).
 *
 * Al primo accesso è obbligatorio (`obbligatorio`): il lavoratore deve indicare l'e-mail di
 * contatto e il codice fiscale prima di usare l'app. I dati organizzativi arrivano
 * dall'organigramma e non sono modificabili: si può solo segnalare una variazione a HR.
 */
import '../../styles/lavoratore.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Profilo as DatiProfilo } from '../../data/api';
import { isCodiceFiscaleValido, isEmailValida, MAX_LUNGHEZZA_NOTE } from '../../domain';
import { Avviso, BarraMonteOre, CampoArea, CampoLettura, CampoTesto, Caricamento, ErroreCaricamento, Etichetta, Griglia, Pagina, Pulsante, Scheda } from '../components/ui';
import { useApp } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, parametriQuery, ROTTE } from '../router';
import { focusPrimoErrore } from './lavoratore/comuni';

const MIN_SEGNALAZIONE = 10;
const ID_SEGNALAZIONE = 'segnala-variazione';

/** Porta alla sezione "Segnala una variazione a HR" e mette il fuoco sul testo. */
function vaiASegnalazione(): void {
  const sezione = document.getElementById(ID_SEGNALAZIONE);
  sezione?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  sezione?.querySelector('textarea')?.focus({ preventScroll: true });
}

export function Profilo({ obbligatorio }: { obbligatorio?: boolean }) {
  const { backend } = useApp();
  const dati = useCarica(() => backend.getProfilo(), [backend]);
  /** Profilo restituito dall'ultimo salvataggio (evita di ricaricare tutta la pagina). */
  const [aggiornato, setAggiornato] = useState<DatiProfilo | null>(null);
  const profilo = aggiornato ?? dati.dati;

  const titolo = obbligatorio ? 'Completa il tuo profilo' : 'Il mio profilo';
  return (
    <Pagina
      titolo={titolo}
      sottotitolo={obbligatorio ? 'Primo accesso: bastano due dati e poi puoi iniziare.' : 'I tuoi dati per le richieste di riconoscimento delle ore di formazione e dei permessi.'}
    >
      {obbligatorio && (
        <Avviso tono="info" titolo="Prima di iniziare completa il profilo">
          Indica un’<strong>e-mail di contatto</strong>, dove riceverai le notifiche sulle tue richieste, e il tuo <strong>codice fiscale</strong>, che
          serve all’Ufficio Paghe per riconoscerti le ore. Li inserisci una volta sola: poi restano in memoria e puoi cambiarli da «Il mio profilo».
        </Avviso>
      )}
      {dati.errore && !profilo && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {!profilo ? (
        !dati.errore && <Caricamento testo="Caricamento del profilo…" />
      ) : (
        <>
          {/* al primo accesso viene prima ciò che va compilato */}
          {obbligatorio && <DatiContatto profilo={profilo} obbligatorio onSalvato={setAggiornato} />}
          <DatiOrganizzativi profilo={profilo} />
          {!obbligatorio && <DatiContatto profilo={profilo} obbligatorio={false} onSalvato={setAggiornato} />}
          {!obbligatorio && <MieiPermessi profilo={profilo} />}
          <Segnalazioni profilo={profilo} onSalvato={setAggiornato} />
        </>
      )}
    </Pagina>
  );
}

function DatiOrganizzativi({ profilo: p }: { profilo: DatiProfilo }) {
  return (
    <Scheda titolo="Dati organizzativi" icona="team">
      <p className="testo-secondario testo-piccolo">
        Arrivano dall’account Microsoft 365 e dall’organigramma aziendale e non si possono modificare qui. Se non sono corretti,{' '}
        {/* pulsante e non link: con l'instradamento basato sull'hash un'ancora cambierebbe pagina */}
        <button type="button" className="link-testo" onClick={vaiASegnalazione}>
          segnala la variazione all’Ufficio HR/Formazione
        </button>
        .
      </p>
      <Griglia colonne={3}>
        <CampoLettura etichetta="Nome e cognome" valore={`${p.nome} ${p.cognome}`} />
        <CampoLettura etichetta="Utente Microsoft 365" valore={p.login} />
        <CampoLettura etichetta="E-mail aziendale" valore={p.emailAziendale ?? <span className="testo-secondario">Nessuna casella aziendale</span>} />
        <CampoLettura etichetta="Area" valore={p.area} />
        <CampoLettura etichetta="Servizio" valore={p.servizio} />
        <CampoLettura etichetta="Centro di costo" valore={p.centroDiCosto} />
        <CampoLettura
          etichetta="Coordinatore"
          className="span-2"
          valore={
            p.coordinatoreNome ? (
              <>
                {p.coordinatoreNome}
                {p.coordinatoreEmail && <span className="testo-secondario"> · {p.coordinatoreEmail}</span>}
              </>
            ) : (
              <span className="testo-pericolo">Nessun coordinatore assegnato: segnalalo a HR, altrimenti non potrai inviare richieste.</span>
            )
          }
        />
      </Griglia>
    </Scheda>
  );
}

/**
 * Permessi con monte ore (diritto allo studio, riqualifica professionale) attivati dall'Ufficio HR
 * per il lavoratore: la scheda compare solo se ce n'è almeno uno.
 */
function MieiPermessi({ profilo: p }: { profilo: DatiProfilo }) {
  if (!p.monteOre.length) return null;
  return (
    <Scheda
      titolo="I miei permessi"
      icona="orologio"
      azioni={
        <Pulsante variante="secondario" piccolo icona="aggiungi" onClick={() => naviga(ROTTE.nuovaRichiesta)}>
          Rendiconta un permesso
        </Pulsante>
      }
    >
      <p className="testo-secondario testo-piccolo">
        L’Ufficio HR/Formazione ti ha assegnato un monte ore per questi permessi: le ore che rendiconti si scalano fino a esaurimento. Le ore «in approvazione» sono
        quelle delle richieste inviate e non ancora validate.
      </p>
      <ul className="permessi-elenco">
        {p.monteOre.map((m) => (
          <li key={m.id} className="riquadro-monte">
            <div className="riquadro-monte-testata">
              <span className="testatina">{m.tipo}</span>
              <span className="testo-secondario testo-piccolo">
                valido dal {f.data(m.validoDal)} al {f.data(m.validoAl)}
              </span>
            </div>
            <dl className="elenco-dati riquadro-monte-dati">
              <div>
                <dt>Monte ore assegnato</dt>
                <dd>{f.ore(m.oreTotali)}</dd>
              </div>
              <div>
                <dt>Ore residue</dt>
                <dd className={m.oreResidue <= 0 ? 'testo-pericolo' : undefined}>
                  <strong>{f.ore(m.oreResidue)}</strong>
                </dd>
              </div>
            </dl>
            <BarraMonteOre situazione={m} />
            {m.oreResidue <= 0 && <p className="testo-piccolo testo-pericolo">Monte ore esaurito: non puoi richiedere altre ore per questo permesso.</p>}
          </li>
        ))}
      </ul>
    </Scheda>
  );
}

function DatiContatto({ profilo: p, obbligatorio, onSalvato }: { profilo: DatiProfilo; obbligatorio: boolean; onSalvato: (p: DatiProfilo) => void }) {
  const { backend, sessione, aggiornaSessione } = useApp();
  const azione = useAzione();
  const rifModulo = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState(p.emailContatto ?? '');
  const [cf, setCf] = useState('');
  const [modificaCf, setModificaCf] = useState(!p.cfRegistrato);
  const [tentato, setTentato] = useState(false);

  const emailPulita = email.trim();
  const cfPulito = cf.trim().toUpperCase();
  const erroreEmail = !emailPulita ? 'Indica un indirizzo e-mail.' : !isEmailValida(emailPulita) ? 'Indirizzo e-mail non valido (es. nome.cognome@gmail.com).' : undefined;
  const erroreCf = !modificaCf
    ? undefined
    : !cfPulito
      ? 'Indica il codice fiscale.'
      : cfPulito.length !== 16
        ? `Il codice fiscale ha 16 caratteri (ne hai inseriti ${cfPulito.length}).`
        : !isCodiceFiscaleValido(cfPulito)
          ? 'Codice fiscale non valido: controlla lettere e numeri (l’ultimo carattere di controllo non corrisponde).'
          : undefined;
  const modificato = emailPulita !== (p.emailContatto ?? '') || modificaCf;

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    setTentato(true);
    if (erroreEmail || erroreCf) {
      focusPrimoErrore(rifModulo.current);
      return;
    }
    const nuovo = await azione.prova(
      () => backend.aggiornaProfilo({ emailContatto: emailPulita, ...(modificaCf ? { codiceFiscale: cfPulito } : {}) }),
      obbligatorio ? 'Profilo completato: ora puoi usare l’app.' : 'Profilo aggiornato.',
    );
    if (!nuovo) {
      focusPrimoErrore(rifModulo.current);
      return;
    }
    setTentato(false);
    setCf('');
    setModificaCf(!nuovo.cfRegistrato);
    setEmail(nuovo.emailContatto ?? '');
    onSalvato(nuovo);
    // sblocca il resto dell'app (il profilo completo è calcolato dal server)
    if (!sessione.profiloCompleto) await aggiornaSessione();
  };

  return (
    <Scheda titolo="E-mail di contatto e codice fiscale" icona="posta">
      <form ref={rifModulo} onSubmit={(e) => void salva(e)} noValidate className="modulo-profilo">
        <Griglia colonne={2}>
          <div className="campo-con-azione">
            <CampoTesto
              etichetta="E-mail di contatto"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              maxLength={254}
              obbligatorio
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              errore={(tentato ? erroreEmail : undefined) ?? azione.erroreDi('emailContatto')}
              aiuto="Qui ricevi le notifiche sulle tue richieste (esiti, integrazioni, promemoria). Molti colleghi non hanno una casella aziendale: puoi indicare un indirizzo personale."
            />
            {p.emailAziendale && emailPulita !== p.emailAziendale && (
              <Pulsante variante="testo" piccolo className="btn-a-capo" onClick={() => setEmail(p.emailAziendale ?? '')}>
                Usa l’e-mail aziendale ({p.emailAziendale})
              </Pulsante>
            )}
          </div>
          {modificaCf ? (
            <div className="campo-con-azione">
              <CampoTesto
                etichetta="Codice fiscale"
                obbligatorio
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={16}
                className="campo-cf"
                placeholder="RSSMRA80A01A944X"
                value={cf}
                onChange={(e) => setCf(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                errore={(tentato ? erroreCf : undefined) ?? azione.erroreDi('codiceFiscale')}
                aiuto={`16 caratteri (${cfPulito.length}/16). Serve per il file dell’Ufficio Paghe ed è visibile in chiaro solo all’Ufficio HR/Formazione.`}
              />
              {p.cfRegistrato && (
                <Pulsante
                  variante="testo"
                  piccolo
                  onClick={() => {
                    setModificaCf(false);
                    setCf('');
                  }}
                >
                  Annulla la modifica del codice fiscale
                </Pulsante>
              )}
            </div>
          ) : (
            <div className="campo-con-azione">
              <CampoLettura etichetta="Codice fiscale" valore={<span className="cf-mascherato">{p.cfMascherato}</span>} />
              <Pulsante variante="secondario" piccolo icona="modifica" onClick={() => setModificaCf(true)}>
                Modifica
              </Pulsante>
            </div>
          )}
        </Griglia>
        <div className="barra-azioni">
          <Pulsante type="submit" icona="salva" inCorso={azione.inCorso} disabled={!obbligatorio && !modificato}>
            {obbligatorio ? 'Salva e continua' : 'Salva'}
          </Pulsante>
        </div>
      </form>
    </Scheda>
  );
}

function Segnalazioni({ profilo: p, onSalvato }: { profilo: DatiProfilo; onSalvato: (p: DatiProfilo) => void }) {
  const { backend } = useApp();
  const azione = useAzione();
  const [testo, setTesto] = useState('');
  const [tentato, setTentato] = useState(false);
  const rifSezione = useRef<HTMLDivElement>(null);
  const breve = testo.trim().length < MIN_SEGNALAZIONE;

  // arrivo dal collegamento "Segnala una variazione a HR" del modulo di richiesta
  useEffect(() => {
    if (parametriQuery().get('sezione') === 'variazione') vaiASegnalazione();
  }, []);

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    setTentato(true);
    if (breve) {
      rifSezione.current?.querySelector('textarea')?.focus();
      return;
    }
    const nuovo = await azione.prova(() => backend.segnalaVariazione(testo.trim()), 'Segnalazione inviata all’Ufficio HR/Formazione.');
    if (!nuovo) return;
    setTesto('');
    setTentato(false);
    onSalvato(nuovo);
  };

  return (
    <div ref={rifSezione} id={ID_SEGNALAZIONE} className="ancora">
      <Scheda titolo="Segnala una variazione a HR" icona="integrazione">
        <form onSubmit={(e) => void invia(e)} noValidate className="modulo-segnalazione">
          <p className="testo-secondario testo-piccolo">
            Hai cambiato servizio, coordinatore o centro di costo? Descrivi la variazione: l’Ufficio HR/Formazione aggiornerà l’organigramma. Le richieste
            già inviate restano con i dati del momento dell’invio.
          </p>
          <CampoArea
            etichetta="Descrizione della variazione"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            maxLength={MAX_LUNGHEZZA_NOTE}
            placeholder="Es. dal 1° novembre lavoro al Centro diurno Il Melograno e il mio coordinatore è Chiara Romano."
            errore={(tentato && breve ? `Descrivi la variazione (almeno ${MIN_SEGNALAZIONE} caratteri).` : undefined) ?? azione.erroreDi('segnalazione')}
            aiuto={`Almeno ${MIN_SEGNALAZIONE} caratteri.`}
          />
          <div className="barra-azioni">
            <Pulsante type="submit" variante="secondario" icona="invia" inCorso={azione.inCorso}>
              Invia la segnalazione
            </Pulsante>
          </div>
        </form>
        {p.segnalazioni.length > 0 && (
          <div className="segnalazioni">
            <h3 className="titoletto">Le tue segnalazioni</h3>
            <ul className="segnalazioni-elenco">
              {p.segnalazioni.map((s) => (
                <li key={`${s.data}-${s.testo.slice(0, 20)}`}>
                  <div className="riga-flessibile">
                    <time dateTime={s.data} className="testo-piccolo testo-secondario">
                      {f.dataOra(s.data)}
                    </time>
                    {s.aperta ? (
                      <Etichetta tono="avviso">Aperta – in carico a HR</Etichetta>
                    ) : (
                      <Etichetta tono="successo">Gestita{s.gestitaIl ? ` il ${f.data(s.gestitaIl)}` : ''}</Etichetta>
                    )}
                  </div>
                  <p>{s.testo}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Scheda>
    </div>
  );
}
