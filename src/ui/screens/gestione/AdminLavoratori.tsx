/**
 * Amministrazione › Lavoratori: anagrafica, assegnazione alla struttura e al coordinatore,
 * segnalazioni di variazione inviate dai lavoratori o dai loro coordinatori.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lavoratore, SegnalazioneVariazione, StatoLavoratore, Struttura, UtenteDirectory } from '../../../domain';
import {
  Avviso,
  BarraFiltri,
  CampoLettura,
  CampoSelezione,
  CampoTesto,
  Dialogo,
  Etichetta,
  Griglia,
  Pulsante,
  PulsanteIcona,
  Scheda,
  Tabella,
} from '../../components/ui';
import { useApp } from '../../contesto';
import * as f from '../../format';
import { useAzione } from '../../hooks';
import { naviga, parametriQuery, ROTTE } from '../../router';
import { nominativo, nomeUtente, opzioniDistinte } from './comuni';
import { opzioniUtenti, SceltaUtente, vuotoInNullo, type PropsSezione } from './admin-comuni';

interface ModuloLavoratore {
  id?: string;
  login: string;
  cognome: string;
  nome: string;
  emailAziendale: string;
  emailContatto: string;
  codiceFiscale: string;
  strutturaId: string;
  coordinatoreLogin: string;
  stato: StatoLavoratore;
  inizioAssegnazione: string;
  fineAssegnazione: string;
}

const MODULO_VUOTO: ModuloLavoratore = {
  login: '',
  cognome: '',
  nome: '',
  emailAziendale: '',
  emailContatto: '',
  codiceFiscale: '',
  strutturaId: '',
  coordinatoreLogin: '',
  stato: 'Attivo',
  inizioAssegnazione: '',
  fineAssegnazione: '',
};

function daLavoratore(l: Lavoratore): ModuloLavoratore {
  return {
    id: l.id,
    login: l.login,
    cognome: l.cognome,
    nome: l.nome,
    emailAziendale: l.emailAziendale ?? '',
    emailContatto: l.emailContatto ?? '',
    codiceFiscale: l.codiceFiscale ?? '',
    strutturaId: l.strutturaId,
    coordinatoreLogin: l.coordinatoreLogin ?? '',
    stato: l.stato,
    inizioAssegnazione: l.inizioAssegnazione ?? '',
    fineAssegnazione: l.fineAssegnazione ?? '',
  };
}

const etichettaStruttura = (s: Struttura) => `${s.servizio} – ${s.centroDiCosto}${s.attiva ? '' : ' (non attiva)'}`;

/** Coordinatore proposto per una struttura: quello del servizio, o il responsabile se coincide con il lavoratore. */
function coordinatoreProposto(s: Struttura | undefined, login: string): string | undefined {
  if (!s) return undefined;
  if (s.coordinatoreServizioLogin && s.coordinatoreServizioLogin !== login) return s.coordinatoreServizioLogin;
  return s.coordinatoreResponsabileLogin !== login ? s.coordinatoreResponsabileLogin : undefined;
}

export function AdminLavoratori({ anagrafiche, ricarica }: PropsSezione) {
  const { backend } = useApp();
  const azione = useAzione();
  const { lavoratori, strutture, utenti } = anagrafiche;
  const [testo, setTesto] = useState('');
  const [stato, setStato] = useState('');
  const [coordinatore, setCoordinatore] = useState('');
  const [inModifica, setInModifica] = useState<Lavoratore | 'nuovo' | null>(null);
  const chiudi = useCallback(() => setInModifica(null), []);

  // collegamento diretto (es. dalle anomalie della chiusura): #/amministrazione/lavoratori?lavoratore=<id>
  useEffect(() => {
    const id = parametriQuery().get('lavoratore');
    if (!id) return;
    const l = lavoratori.find((x) => x.id === id);
    if (l) setInModifica(l);
    naviga(ROTTE.amministrazione('lavoratori'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const struttura = useMemo(() => new Map(strutture.map((s) => [s.id, s])), [strutture]);
  const righe = useMemo(() => {
    const t = testo.trim().toLowerCase();
    return lavoratori
      .filter((l) => {
        const s = struttura.get(l.strutturaId);
        return (
          (!stato || l.stato === stato) &&
          (!coordinatore || l.coordinatoreLogin === coordinatore) &&
          (!t || `${l.cognome} ${l.nome} ${l.nome} ${l.cognome} ${l.login} ${s?.servizio ?? ''} ${s?.centroDiCosto ?? ''}`.toLowerCase().includes(t))
        );
      })
      .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
  }, [lavoratori, struttura, testo, stato, coordinatore]);

  const segnalazioni = useMemo(
    () =>
      lavoratori
        .flatMap((l) => l.segnalazioni.map((s, indice) => ({ lavoratore: l, segnalazione: s, indice })))
        .filter((x) => x.segnalazione.aperta)
        .sort((a, b) => b.segnalazione.data.localeCompare(a.segnalazione.data)),
    [lavoratori],
  );

  const gestisci = async (lavoratoreId: string, indice: number) => {
    if (await azione.prova(async () => (await backend.chiudiSegnalazione(lavoratoreId, indice), true), 'Segnalazione segnata come gestita.')) await ricarica();
  };

  const coordinatoriOpzioni = useMemo(
    () => opzioniDistinte(lavoratori, (l) => l.coordinatoreLogin, (l) => nomeUtente(utenti, l.coordinatoreLogin)),
    [lavoratori, utenti],
  );

  return (
    <div className="pagina">
      {segnalazioni.length > 0 && (
        <Scheda titolo={`Segnalazioni da gestire (${segnalazioni.length})`} icona="avviso">
          <p className="testo-secondario" style={{ marginTop: 0 }}>
            Variazioni dell’organigramma segnalate dai lavoratori dal proprio profilo oppure dai coordinatori per sé e per il proprio team. Aggiorna
            l’anagrafica, poi segna la segnalazione come gestita.
          </p>
          <ul className="elenco-segnalazioni">
            {segnalazioni.map(({ lavoratore: l, segnalazione: s, indice }) => (
              <li key={`${l.id}-${indice}`}>
                <div className="segnalazione-testo">
                  <strong>{nominativo(l)}</strong> <time dateTime={s.data}>{f.dataOra(s.data)}</time>
                  <div>{s.testo}</div>
                  <AutoreSegnalazione segnalazione={s} lavoratore={l} utenti={utenti} />
                </div>
                <div className="riga-flessibile">
                  <Pulsante variante="secondario" piccolo icona="modifica" onClick={() => setInModifica(l)}>
                    Modifica lavoratore
                  </Pulsante>
                  <Pulsante variante="successo" piccolo icona="approva" disabled={azione.inCorso} onClick={() => void gestisci(l.id, indice)}>
                    Segna come gestita
                  </Pulsante>
                </div>
              </li>
            ))}
          </ul>
        </Scheda>
      )}

      <div className="riga-flessibile">
        <p className="testo-secondario" style={{ margin: 0, flex: '1 1 320px' }}>
          Ogni lavoratore è collegato al proprio utente Microsoft 365, a una struttura (area, servizio, centro di costo) e al coordinatore che approva le sue
          richieste.
        </p>
        <Pulsante icona="aggiungi" onClick={() => setInModifica('nuovo')}>
          Nuovo lavoratore
        </Pulsante>
      </div>

      <BarraFiltri
        onAzzera={() => {
          setTesto('');
          setStato('');
          setCoordinatore('');
        }}
        conteggio={`${righe.length} di ${lavoratori.length}`}
      >
        <CampoTesto etichetta="Cerca" type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Nome, login, servizio, centro di costo" />
        <CampoSelezione
          etichetta="Stato"
          value={stato}
          onChange={(e) => setStato(e.target.value)}
          vuota="Tutti"
          opzioni={[
            { valore: 'Attivo', etichetta: 'Attivo' },
            { valore: 'Non attivo', etichetta: 'Non attivo' },
          ]}
        />
        <CampoSelezione etichetta="Coordinatore" value={coordinatore} onChange={(e) => setCoordinatore(e.target.value)} vuota="Tutti" opzioni={coordinatoriOpzioni} />
      </BarraFiltri>

      <div className="gestione-tabella tabella-compatta">
        <Tabella
          didascalia="Lavoratori"
          righe={righe}
          chiave={(l) => l.id}
          onApri={(l) => setInModifica(l)}
          vuoto="Nessun lavoratore corrisponde alla ricerca."
          colonne={[
            {
              titolo: 'Nominativo',
              valore: (l) => (
                <span className="cella-blocco">
                  <span className="cella-principale">{nominativo(l)}</span>
                  <span className="cella-secondaria testo-a-capo">{l.login}</span>
                </span>
              ),
            },
            {
              titolo: 'Servizio',
              valore: (l) => {
                const s = struttura.get(l.strutturaId);
                return s ? (
                  <span className="cella-blocco">
                    {s.servizio}
                    <span className="cella-secondaria">{s.area}</span>
                  </span>
                ) : (
                  <Etichetta tono="pericolo">Struttura mancante</Etichetta>
                );
              },
            },
            { titolo: 'Centro di costo', valore: (l) => struttura.get(l.strutturaId)?.centroDiCosto ?? '—', secondaria: true },
            {
              titolo: 'Coordinatore',
              valore: (l) => (l.coordinatoreLogin ? nomeUtente(utenti, l.coordinatoreLogin) : <Etichetta tono="pericolo">Non assegnato</Etichetta>),
            },
            { titolo: 'Stato', valore: (l) => <Etichetta tono={l.stato === 'Attivo' ? 'successo' : 'neutro'}>{l.stato}</Etichetta> },
            {
              titolo: 'Codice fiscale',
              valore: (l) => (l.codiceFiscale ? <Etichetta tono="successo">Registrato</Etichetta> : <Etichetta tono="avviso">Mancante</Etichetta>),
            },
            {
              titolo: 'Segnalazioni aperte',
              numerica: true,
              valore: (l) => {
                const n = l.segnalazioni.filter((s) => s.aperta).length;
                return n ? <Etichetta tono="avviso">{n}</Etichetta> : <span className="testo-secondario">0</span>;
              },
            },
          ]}
          azioni={(l) => <PulsanteIcona icona="modifica" etichetta={`Modifica ${nominativo(l)}`} onClick={() => setInModifica(l)} />}
        />
      </div>

      {inModifica && (
        <DialogoLavoratore
          lavoratore={inModifica === 'nuovo' ? undefined : inModifica}
          anagrafiche={anagrafiche}
          ricarica={ricarica}
          onChiudi={chiudi}
        />
      )}
    </div>
  );
}

function DialogoLavoratore({ lavoratore, anagrafiche, ricarica, onChiudi }: PropsSezione & { lavoratore?: Lavoratore; onChiudi: () => void }) {
  const { backend } = useApp();
  const azione = useAzione();
  const { strutture, utenti, lavoratori } = anagrafiche;
  const [m, setM] = useState<ModuloLavoratore>(() => (lavoratore ? daLavoratore(lavoratore) : MODULO_VUOTO));
  const imposta = <K extends keyof ModuloLavoratore>(k: K, v: ModuloLavoratore[K]) => setM((x) => ({ ...x, [k]: v }));
  const nuovo = !lavoratore;
  // dati aggiornati (es. dopo aver gestito una segnalazione)
  const attuale = lavoratore ? lavoratori.find((l) => l.id === lavoratore.id) ?? lavoratore : undefined;
  const giaCensiti = useMemo(() => new Set(lavoratori.map((l) => l.login)), [lavoratori]);
  const etichettaCensito = useCallback((u: { login: string }) => (giaCensiti.has(u.login) ? 'già censito' : undefined), [giaCensiti]);

  const struttureOpzioni = strutture
    .filter((s) => s.attiva || s.id === m.strutturaId)
    .sort((a, b) => a.area.localeCompare(b.area, 'it') || a.servizio.localeCompare(b.servizio, 'it'))
    .map((s) => ({ valore: s.id, etichetta: etichettaStruttura(s) }));
  const strutturaScelta = strutture.find((s) => s.id === m.strutturaId);

  const scegliUtente = (login: string) => {
    const u = utenti.find((x) => x.login === login);
    setM((x) => ({
      ...x,
      login,
      cognome: u?.cognome ?? x.cognome,
      nome: u?.nome ?? x.nome,
      emailAziendale: u?.emailAziendale ?? '',
      coordinatoreLogin: x.coordinatoreLogin === login ? '' : x.coordinatoreLogin,
    }));
  };
  const scegliStruttura = (id: string) => {
    const s = strutture.find((x) => x.id === id);
    setM((x) => ({ ...x, strutturaId: id, coordinatoreLogin: coordinatoreProposto(s, x.login) ?? x.coordinatoreLogin }));
  };

  const cambioCoordinatore = !!attuale && !!m.coordinatoreLogin && m.coordinatoreLogin !== (attuale.coordinatoreLogin ?? '');

  const salva = async () => {
    const r = await azione.prova(
      () =>
        backend.salvaLavoratore({
          id: m.id,
          login: m.login.trim().toLowerCase(),
          cognome: m.cognome.trim(),
          nome: m.nome.trim(),
          emailAziendale: vuotoInNullo(m.emailAziendale),
          emailContatto: vuotoInNullo(m.emailContatto),
          codiceFiscale: vuotoInNullo(m.codiceFiscale)?.toUpperCase(),
          strutturaId: m.strutturaId,
          coordinatoreLogin: vuotoInNullo(m.coordinatoreLogin),
          stato: m.stato,
          inizioAssegnazione: vuotoInNullo(m.inizioAssegnazione),
          fineAssegnazione: vuotoInNullo(m.fineAssegnazione),
        }),
      nuovo ? 'Lavoratore creato.' : 'Lavoratore aggiornato.',
    );
    if (r) {
      onChiudi();
      await ricarica();
    }
  };

  const gestisci = async (indice: number) => {
    if (attuale && (await azione.prova(async () => (await backend.chiudiSegnalazione(attuale.id, indice), true), 'Segnalazione segnata come gestita.'))) await ricarica();
  };
  const segnalazioniAperte = (attuale?.segnalazioni ?? []).map((s, indice) => ({ ...s, indice })).filter((s) => s.aperta);

  return (
    <Dialogo
      titolo={nuovo ? 'Nuovo lavoratore' : `Modifica ${nominativo(lavoratore)}`}
      largo
      onChiudi={onChiudi}
      piede={
        <>
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante icona="salva" inCorso={azione.inCorso} onClick={() => void salva()}>
            Salva
          </Pulsante>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salva();
        }}
        style={{ display: 'grid', gap: 14 }}
      >
        {azione.erroriCampi.length > 0 && (
          <Avviso tono="pericolo" titolo="Controlla i dati del lavoratore">
            <ul className="elenco-compatto">
              {azione.erroriCampi.map((e) => (
                <li key={`${e.campo}-${e.messaggio}`}>{e.messaggio}</li>
              ))}
            </ul>
          </Avviso>
        )}
        <Griglia colonne={2}>
          {nuovo ? (
            <SceltaUtente
              etichetta="Utente Microsoft 365"
              utenti={utenti}
              valore={m.login}
              onCambia={scegliUtente}
              errore={azione.erroreDi('login')}
              obbligatorio
              etichettaUtente={etichettaCensito}
            />
          ) : (
            <CampoLettura etichetta="Utente Microsoft 365" valore={m.login} className="span-2" />
          )}
          {nuovo && <CampoLettura etichetta="Login (dall’utente scelto)" valore={m.login} className="span-2" />}
          <CampoTesto etichetta="Cognome" value={m.cognome} onChange={(e) => imposta('cognome', e.target.value)} obbligatorio errore={azione.erroreDi('nome')} autoComplete="off" />
          <CampoTesto etichetta="Nome" value={m.nome} onChange={(e) => imposta('nome', e.target.value)} obbligatorio errore={azione.erroreDi('nome')} autoComplete="off" />
          <CampoTesto
            etichetta="E-mail aziendale"
            type="email"
            value={m.emailAziendale}
            onChange={(e) => imposta('emailAziendale', e.target.value)}
            aiuto="Solo se il lavoratore ha una casella aziendale."
            autoComplete="off"
          />
          <CampoTesto
            etichetta="E-mail di contatto"
            type="email"
            value={m.emailContatto}
            onChange={(e) => imposta('emailContatto', e.target.value)}
            aiuto="Riceve le notifiche; di solito la inserisce il lavoratore al primo accesso."
            autoComplete="off"
          />
          <CampoTesto
            etichetta="Codice fiscale"
            value={m.codiceFiscale}
            onChange={(e) => imposta('codiceFiscale', e.target.value.toUpperCase())}
            maxLength={16}
            errore={azione.erroreDi('codiceFiscale')}
            aiuto="16 caratteri; necessario per il file paghe."
            autoComplete="off"
            spellCheck={false}
          />
          <CampoSelezione
            etichetta="Stato"
            value={m.stato}
            onChange={(e) => imposta('stato', e.target.value as StatoLavoratore)}
            opzioni={[
              { valore: 'Attivo', etichetta: 'Attivo' },
              { valore: 'Non attivo', etichetta: 'Non attivo' },
            ]}
            obbligatorio
          />
          <CampoSelezione
            etichetta="Struttura (servizio – centro di costo)"
            value={m.strutturaId}
            onChange={(e) => scegliStruttura(e.target.value)}
            vuota="Seleziona…"
            opzioni={struttureOpzioni}
            obbligatorio
            errore={azione.erroreDi('strutturaId')}
            aiuto={strutturaScelta ? `Area: ${strutturaScelta.area}` : undefined}
          />
          <CampoSelezione
            etichetta="Coordinatore"
            value={m.coordinatoreLogin}
            onChange={(e) => imposta('coordinatoreLogin', e.target.value)}
            vuota="Nessun coordinatore"
            opzioni={opzioniUtenti(utenti.filter((u) => u.login !== m.login))}
            errore={azione.erroreDi('coordinatoreLogin')}
            aiuto={
              strutturaScelta?.coordinatoreServizioLogin
                ? `Coordinatore del servizio: ${nomeUtente(utenti, strutturaScelta.coordinatoreServizioLogin)}`
                : 'Approva le richieste del lavoratore.'
            }
          />
          <CampoTesto etichetta="Inizio validità assegnazione" type="date" value={m.inizioAssegnazione} onChange={(e) => imposta('inizioAssegnazione', e.target.value)} />
          <CampoTesto
            etichetta="Fine validità assegnazione"
            type="date"
            value={m.fineAssegnazione}
            onChange={(e) => imposta('fineAssegnazione', e.target.value)}
            errore={azione.erroreDi('fineAssegnazione')}
          />
        </Griglia>
        {cambioCoordinatore && (
          <Avviso tono="info" titolo="Cambio di coordinatore">
            Le richieste ancora aperte di {m.cognome} {m.nome} passeranno a {nomeUtente(utenti, m.coordinatoreLogin)}, che riceverà una notifica. Il cambio viene
            registrato nello storico.
          </Avviso>
        )}
        {m.stato === 'Non attivo' && attuale?.stato === 'Attivo' && (
          <Avviso tono="avviso">Un lavoratore non attivo non può più accedere all’app né inserire richieste; le richieste già inviate restano consultabili.</Avviso>
        )}
        {/* invio con Invio dalla tastiera */}
        <button type="submit" hidden />
      </form>

      {segnalazioniAperte.length > 0 && (
        <section aria-label="Segnalazioni di variazione">
          <h3 className="pannello-titolo">Segnalazioni da gestire</h3>
          <ul className="elenco-segnalazioni">
            {segnalazioniAperte.map((s) => (
              <li key={s.indice}>
                <div className="segnalazione-testo">
                  <time dateTime={s.data}>{f.dataOra(s.data)}</time>
                  <div>{s.testo}</div>
                  {attuale && <AutoreSegnalazione segnalazione={s} lavoratore={attuale} utenti={utenti} />}
                </div>
                <Pulsante variante="successo" piccolo icona="approva" disabled={azione.inCorso} onClick={() => void gestisci(s.indice)}>
                  Segna come gestita
                </Pulsante>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialogo>
  );
}

/**
 * Chi ha scritto la segnalazione: il lavoratore stesso oppure il suo coordinatore (che può
 * segnalare variazioni dell'organigramma per sé e per il proprio team).
 */
function AutoreSegnalazione({ segnalazione: s, lavoratore, utenti }: { segnalazione: SegnalazioneVariazione; lavoratore: Lavoratore; utenti: readonly UtenteDirectory[] }) {
  if (!s.autoreLogin && !s.autoreNome) return null;
  const diAltri = !!s.autoreLogin && s.autoreLogin !== lavoratore.login;
  const nome = s.autoreNome ?? nomeUtente(utenti, s.autoreLogin);
  return (
    <span className="cella-secondaria">
      {diAltri ? (
        <>
          <Etichetta tono="info">Dal coordinatore</Etichetta> Segnalata da {nome}
        </>
      ) : (
        'Segnalata dal lavoratore'
      )}
    </span>
  );
}
