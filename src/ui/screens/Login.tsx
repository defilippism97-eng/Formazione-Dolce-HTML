/**
 * Schermata 0 – Accesso.
 * DEMO: nome utente e password degli account dimostrativi (nessuna credenziale reale).
 * PRODUZIONE: accesso Microsoft 365 (Single Sign-On) gestito dalla piattaforma: l'app
 * non chiede né riceve mai la password aziendale.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { config } from '../../config';
import type { Backend } from '../../data/api';
import type { Sessione } from '../../domain';
import { Icona } from '../components/Icona';
import { Avviso, CampoTesto, Pulsante } from '../components/ui';
import { messaggioErrore } from '../hooks';

export function Login({ backend, onAccesso, errore: erroreIniziale }: { backend: Backend; onAccesso: (s: Sessione) => void; errore?: string | null }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(erroreIniziale ?? null);
  const [inCorso, setInCorso] = useState(false);
  const demo = backend.demo;

  useEffect(() => {
    document.title = `Accesso – ${config.nomeApp}`;
  }, []);

  const accedi = async (credenziali?: { login: string; password: string }) => {
    setInCorso(true);
    setErrore(null);
    try {
      onAccesso(await backend.accedi(credenziali));
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setInCorso(false);
    }
  };

  const invia = (e: FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setErrore('Inserisci nome utente e password.');
      return;
    }
    void accedi({ login, password });
  };

  return (
    <div className="accesso">
      <div className="accesso-marchio">
        <span className="marchio-logo" aria-hidden style={{ width: 56, height: 56, fontSize: 22 }}>
          SD
        </span>
        <h1>{config.nomeApp}</h1>
        <p>
          Rilevazione, approvazione e rendicontazione delle ore di formazione di {config.nomeAzienda}: dalla richiesta del lavoratore
          all’approvazione del coordinatore, fino alla validazione HR e al file per l’Ufficio Paghe.
        </p>
        <p className="testo-piccolo" style={{ opacity: 0.85 }}>
          <Icona nome="lucchetto" dimensione={14} /> Accesso con l’account Microsoft 365 aziendale.
        </p>
      </div>

      <div className="accesso-modulo">
        {demo ? (
          <form onSubmit={invia} noValidate aria-describedby="nota-demo">
            <h2>Accedi</h2>
            <Avviso tono="avviso" titolo="Modalità DEMO">
              <span id="nota-demo">
                Dati e persone sono inventati. <strong>Non inserire qui la tua password Microsoft 365</strong>: usa gli account dimostrativi qui
                sotto. Nella versione definitiva l’accesso avverrà con il login Microsoft 365, senza digitare la password in questa pagina.
              </span>
            </Avviso>
            {errore && <Avviso tono="pericolo">{errore}</Avviso>}
            <CampoTesto
              etichetta="Nome utente Microsoft 365"
              type="email"
              autoComplete="username"
              placeholder="nome.cognome@demo.societadolce.it"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              obbligatorio
            />
            <CampoTesto etichetta="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} obbligatorio />
            <Pulsante type="submit" icona="sbloccato" inCorso={inCorso}>
              Accedi
            </Pulsante>
            <a href={config.linkResetPassword} target="_blank" rel="noopener noreferrer">
              Hai dimenticato la password? Reimpostala su {config.linkResetPassword.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>

            <div className="separatore">oppure entra con un account dimostrativo</div>
            <div className="account-demo">
              {demo.account.map((a) => (
                <button
                  key={a.login}
                  type="button"
                  disabled={inCorso}
                  onClick={() => {
                    setLogin(a.login);
                    setPassword(a.password);
                    void accedi({ login: a.login, password: a.password });
                  }}
                >
                  <Icona nome="utente" />
                  <span>
                    <strong>{a.ruolo}</strong> – {a.login.split('@')[0]?.replace('.', ' ')}
                    <small>{a.descrizione}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="testo-piccolo testo-secondario">
              Password di tutti gli account dimostrativi: <code>{demo.account[0]?.password}</code>
            </p>
          </form>
        ) : (
          <div style={{ width: 'min(440px, 100%)', display: 'grid', gap: 14 }}>
            <h2>Accedi</h2>
            <p>Usa il tuo account Microsoft 365 aziendale (lo stesso della intranet).</p>
            {errore && <Avviso tono="pericolo">{errore}</Avviso>}
            <Pulsante icona="sbloccato" inCorso={inCorso} onClick={() => void accedi()}>
              Accedi con Microsoft 365
            </Pulsante>
            <a href={config.linkResetPassword} target="_blank" rel="noopener noreferrer">
              Hai dimenticato la password? Reimpostala qui
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
