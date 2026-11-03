/**
 * Avvio dell'app: sceglie il backend in base alla configurazione (DEMO o produzione).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from './config';
import type { Backend } from './data/api';
import { BackendDemo } from './data/demo/backend-demo';
import { archivioFilePredefinito, persistenzaPredefinita, SessioneBrowser } from './data/demo/store';
import { BackendHttp } from './data/http/backend-http';
import { creaProviderEasyAuth, creaProviderTokenEntra } from './data/http/auth';
import './styles/app.css'; // prima delle schermate: i loro fogli di stile vengono dopo e possono specializzarlo
import { Radice } from './ui/App';

function creaBackend(): Backend {
  if (config.modalita === 'produzione') {
    // EasyAuth (Azure Static Web Apps / App Service) è la scelta consigliata: nessuna libreria di login nel browser
    const accesso = config.entra ? creaProviderTokenEntra(config.entra) : creaProviderEasyAuth();
    return new BackendHttp({ baseUrl: config.apiBaseUrl ?? '/api', accesso });
  }
  return new BackendDemo({
    persistenza: persistenzaPredefinita(),
    archivio: archivioFilePredefinito(),
    sessione: new SessioneBrowser(),
    ritardoMs: config.ritardoDemoMs,
  });
}

const contenitore = document.getElementById('app');
if (!contenitore) throw new Error('Elemento #app non trovato');
try {
  createRoot(contenitore).render(
    <StrictMode>
      <Radice backend={creaBackend()} />
    </StrictMode>,
  );
} catch (e) {
  const box = document.createElement('div');
  box.className = 'errore-avvio';
  const h = document.createElement('h1');
  h.textContent = "Impossibile avviare l'app";
  const p = document.createElement('p');
  p.textContent = e instanceof Error ? e.message : String(e);
  box.append(h, p);
  contenitore.replaceChildren(box);
}
