/**
 * Struttura dell'app: accesso, completamento del profilo, intestazione, menu laterale
 * per ruolo e instradamento delle schermate.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import logo from '../assets/logo-societa-dolce.png';
import { config } from '../config';
import type { Backend } from '../data/api';
import { ETICHETTA_RUOLO, ruoloPrincipale, type Ruolo, type Sessione } from '../domain';
import { Icona, type NomeIcona } from './components/Icona';
import { Avviso, Caricamento, Pagina, Pulsante } from './components/ui';
import { ProviderApp, ProviderConferma, ProviderMessaggi, useApp } from './contesto';
import { corrisponde, naviga, ROTTE, usePercorso } from './router';
import { Amministrazione } from './screens/Amministrazione';
import { Chiusura } from './screens/Chiusura';
import { Dettaglio } from './screens/Dettaglio';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { MieRichieste } from './screens/MieRichieste';
import { Permessi } from './screens/Permessi';
import { ModuloRichiesta } from './screens/ModuloRichiesta';
import { Posta } from './screens/Posta';
import { Profilo } from './screens/Profilo';
import { Riepilogo } from './screens/Riepilogo';
import { Team } from './screens/Team';
import { ValidazioneHR } from './screens/ValidazioneHR';

interface VoceMenu {
  percorso: string;
  etichetta: string;
  icona: NomeIcona;
  ruoli: Ruolo[] | 'tutti';
}

export const MENU: VoceMenu[] = [
  { percorso: ROTTE.home, etichetta: 'Home', icona: 'home', ruoli: 'tutti' },
  { percorso: ROTTE.nuovaRichiesta, etichetta: 'Inserisci formazione', icona: 'aggiungi', ruoli: ['lavoratore'] },
  { percorso: ROTTE.mieRichieste, etichetta: 'Le mie richieste', icona: 'lista', ruoli: ['lavoratore'] },
  { percorso: ROTTE.team, etichetta: 'Richieste del team', icona: 'team', ruoli: ['coordinatore'] },
  { percorso: ROTTE.validazione, etichetta: 'Validazione HR', icona: 'valida', ruoli: ['hr', 'admin'] },
  { percorso: ROTTE.permessi, etichetta: 'Monte ore permessi', icona: 'orologio', ruoli: ['hr', 'admin'] },
  { percorso: ROTTE.riepilogo, etichetta: 'Riepilogo mensile', icona: 'grafico', ruoli: ['coordinatore', 'hr', 'admin'] },
  { percorso: ROTTE.chiusura, etichetta: 'Chiusura e file paghe', icona: 'calendario', ruoli: ['hr', 'admin'] },
  { percorso: ROTTE.amministrazione(), etichetta: 'Amministrazione', icona: 'impostazioni', ruoli: ['admin'] },
  { percorso: ROTTE.posta, etichetta: config.modalita === 'demo' ? 'Posta (simulata)' : 'Notifiche', icona: 'posta', ruoli: 'tutti' },
  { percorso: ROTTE.profilo, etichetta: 'Il mio profilo', icona: 'utente', ruoli: ['lavoratore'] },
];

const primoSegmento = (p: string) => p.split('/').filter(Boolean)[0] ?? '';
const consentita = (s: Sessione, ruoli: Ruolo[] | 'tutti') => ruoli === 'tutti' || ruoli.some((r) => s.ruoli.includes(r));

// ---------------------------------------------------------------------------
//  Radice: carica la sessione e mostra l'accesso o l'app
// ---------------------------------------------------------------------------
export function Radice({ backend }: { backend: Backend }) {
  const [sessione, setSessione] = useState<Sessione | null | undefined>(undefined);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    backend
      .sessioneCorrente()
      .then(setSessione)
      .catch(() => {
        setErrore('Impossibile verificare l’accesso. Ricarica la pagina.');
        setSessione(null);
      });
  }, [backend]);

  const aggiorna = useCallback((s: Sessione | null) => setSessione(s), []);

  return (
    <ProviderMessaggi>
      <ProviderConferma>
        {sessione === undefined ? (
          <div className="schermo-centrato">
            <Caricamento testo="Verifica dell’accesso…" />
          </div>
        ) : sessione === null ? (
          <Login backend={backend} onAccesso={aggiorna} errore={errore} />
        ) : (
          <ProviderApp backend={backend} sessione={sessione} onSessione={aggiorna}>
            <Struttura />
          </ProviderApp>
        )}
      </ProviderConferma>
    </ProviderMessaggi>
  );
}

// ---------------------------------------------------------------------------
//  Struttura con intestazione e menu
// ---------------------------------------------------------------------------
function Struttura() {
  const { sessione, esci, backend } = useApp();
  const percorso = usePercorso();
  const [menuAperto, setMenuAperto] = useState(false);
  const principale = ruoloPrincipale(sessione);
  const voci = MENU.filter((v) => consentita(sessione, v.ruoli));
  const esatta = voci.find((v) => v.percorso === percorso);
  const profiloObbligatorio = sessione.ruoli.includes('lavoratore') && !sessione.profiloCompleto;

  useEffect(() => setMenuAperto(false), [percorso]);
  useEffect(() => {
    if (percorso === '/' || percorso === '') naviga(ROTTE.home);
  }, [percorso]);

  return (
    <div className={`app${menuAperto ? ' menu-aperto' : ''}`}>
      <a className="salta-al-contenuto" href="#contenuto" onClick={(e) => { e.preventDefault(); document.getElementById('contenuto')?.focus(); }}>
        Vai al contenuto
      </a>
      <header className="intestazione">
        <button type="button" className="intestazione-menu" aria-label={menuAperto ? 'Chiudi il menu' : 'Apri il menu'} aria-expanded={menuAperto} onClick={() => setMenuAperto(!menuAperto)}>
          <Icona nome={menuAperto ? 'chiudi' : 'menu'} dimensione={22} />
        </button>
        <div className="intestazione-marchio">
          <img className="marchio-logo" src={logo} alt={config.nomeAzienda} />
          <span className="marchio-divisore" aria-hidden />
          <span className="marchio-testo">
            <strong>{config.nomeApp}</strong>
            <small>Rilevazione, approvazione e rendicontazione delle ore</small>
          </span>
        </div>
        {backend.modalita === 'demo' && (
          <span className="etichetta-demo" title="Dati simulati: nessun dato reale viene letto o inviato">
            DEMO
          </span>
        )}
        <div className="intestazione-utente">
          <span className="utente-nome">
            {sessione.nome} {sessione.cognome}
            <small>{principale ? ETICHETTA_RUOLO[principale] : ''}</small>
          </span>
          <Pulsante variante="testo" icona="esci" onClick={() => void esci()} aria-label="Esci">
            <span className="nascosto-mobile">Esci</span>
          </Pulsante>
        </div>
      </header>

      <nav className="menu-laterale" aria-label="Menu principale">
        <ul>
          {voci.map((v) => {
            const attiva = esatta ? v === esatta : v.percorso !== ROTTE.nuovaRichiesta && primoSegmento(v.percorso) === primoSegmento(percorso);
            return (
              <li key={v.percorso}>
                <a href={`#${v.percorso}`} className={attiva ? 'attiva' : undefined} aria-current={attiva ? 'page' : undefined}>
                  <Icona nome={v.icona} />
                  <span>{v.etichetta}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <div className="menu-ruoli">
          <span>I tuoi ruoli</span>
          <div>
            {sessione.ruoli.map((r) => (
              <span key={r} className="chip">
                {ETICHETTA_RUOLO[r]}
              </span>
            ))}
          </div>
        </div>
      </nav>
      <div className="menu-velo" onClick={() => setMenuAperto(false)} aria-hidden />

      <main id="contenuto" className="contenuto" tabIndex={-1}>
        {profiloObbligatorio ? <Profilo obbligatorio /> : <Instradamento percorso={percorso} />}
      </main>

      <footer className="piede">
        {config.nomeAzienda} · {config.nomeApp}
        {backend.modalita === 'demo' && ' · Modalità DEMO: dati e persone inventati, nessuna e-mail viene inviata'}
      </footer>
    </div>
  );
}

function NonAutorizzato() {
  return (
    <Pagina titolo="Accesso non consentito">
      <Avviso tono="avviso">Questa sezione non è disponibile per il tuo ruolo.</Avviso>
      <p>
        <Pulsante variante="secondario" icona="home" onClick={() => naviga(ROTTE.home)}>
          Torna alla home
        </Pulsante>
      </p>
    </Pagina>
  );
}

function Protetta({ ruoli, children }: { ruoli: Ruolo[]; children: ReactNode }) {
  const { sessione } = useApp();
  return consentita(sessione, ruoli) ? <>{children}</> : <NonAutorizzato />;
}

function Instradamento({ percorso }: { percorso: string }) {
  let p: Record<string, string> | null;
  if (percorso === ROTTE.home) return <Home />;
  if (percorso === ROTTE.profilo) return <Protetta ruoli={['lavoratore']}><Profilo /></Protetta>;
  if (percorso === ROTTE.mieRichieste) return <Protetta ruoli={['lavoratore']}><MieRichieste /></Protetta>;
  if (percorso === ROTTE.nuovaRichiesta) return <Protetta ruoli={['lavoratore']}><ModuloRichiesta /></Protetta>;
  if ((p = corrisponde(percorso, '/richieste/:id/modifica'))) return <Protetta ruoli={['lavoratore']}><ModuloRichiesta key={p.id} id={p.id} /></Protetta>;
  if ((p = corrisponde(percorso, '/richiesta/:id'))) return <Dettaglio key={p.id} id={p.id!} />;
  if (percorso === ROTTE.team) return <Protetta ruoli={['coordinatore']}><Team /></Protetta>;
  if (percorso === ROTTE.validazione) return <Protetta ruoli={['hr', 'admin']}><ValidazioneHR /></Protetta>;
  if (percorso === ROTTE.riepilogo) return <Protetta ruoli={['coordinatore', 'hr', 'admin']}><Riepilogo /></Protetta>;
  if (percorso === ROTTE.chiusura) return <Protetta ruoli={['hr', 'admin']}><Chiusura /></Protetta>;
  if (percorso === ROTTE.permessi) return <Protetta ruoli={['hr', 'admin']}><Permessi /></Protetta>;
  if ((p = corrisponde(percorso, '/amministrazione/:sezione'))) return <Protetta ruoli={['admin']}><Amministrazione sezione={p.sezione!} /></Protetta>;
  if (percorso === ROTTE.posta) return <Posta />;
  return (
    <Pagina titolo="Pagina non trovata">
      <Pulsante variante="secondario" icona="home" onClick={() => naviga(ROTTE.home)}>
        Torna alla home
      </Pulsante>
    </Pagina>
  );
}
