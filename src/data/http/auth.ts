/**
 * Accesso Microsoft 365 in produzione.
 *
 * Soluzione consigliata (nessuna libreria nel browser): pubblicare l'app su Azure Static Web Apps
 * o Azure App Service con l'autenticazione Microsoft Entra ID integrata ("EasyAuth").
 * La piattaforma gestisce login, MFA e sessione (cookie sicuro); le API ricevono l'identità
 * verificata nell'intestazione `x-ms-client-principal`. L'app NON vede mai le password.
 *
 * In alternativa (es. API su un dominio diverso) si può fornire un token Bearer tramite MSAL:
 * vedi `creaProviderTokenEntra`.
 */
export interface ProviderAccesso {
  /** Token Bearer da inviare alle API, oppure null se la sessione è gestita con cookie. */
  token(): Promise<string | null>;
  /** Avvia l'accesso Microsoft 365 (reindirizzamento). */
  accedi(): Promise<never>;
  esci(): Promise<never>;
}

function reindirizza(url: string): Promise<never> {
  window.location.assign(url);
  return new Promise<never>(() => undefined);
}

/** Accesso gestito dalla piattaforma (Azure Static Web Apps / App Service). */
export function creaProviderEasyAuth(): ProviderAccesso {
  return {
    token: async () => null,
    accedi: () => reindirizza(`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(window.location.pathname + window.location.hash)}`),
    esci: () => reindirizza('/.auth/logout?post_logout_redirect_uri=/'),
  };
}

/** Interfaccia minima della libreria MSAL (@azure/msal-browser) usata qui. */
interface MsalMinimo {
  initialize(): Promise<void>;
  handleRedirectPromise(): Promise<unknown>;
  getAllAccounts(): { username: string }[];
  acquireTokenSilent(r: { scopes: string[]; account: unknown }): Promise<{ accessToken: string }>;
  loginRedirect(r: { scopes: string[] }): Promise<void>;
  logoutRedirect(): Promise<void>;
}

/**
 * Accesso con token Bearer tramite MSAL. Richiede che l'IT includa @azure/msal-browser
 * (pacchetto npm o script ufficiale) ed esponga l'istanza come `window.sdfMsal`
 * (PublicClientApplication configurata con clientId/tenantId/redirectUri).
 */
export function creaProviderTokenEntra(cfg: { scope: string }): ProviderAccesso {
  const msal = (window as unknown as { sdfMsal?: MsalMinimo }).sdfMsal;
  if (!msal) {
    throw new Error('Accesso Microsoft 365 non configurato: vedi docs/PRODUZIONE.md (EasyAuth consigliato, oppure MSAL come window.sdfMsal).');
  }
  const pronto = msal.initialize().then(() => msal.handleRedirectPromise());
  return {
    async token() {
      await pronto;
      const account = msal.getAllAccounts()[0];
      if (!account) return null;
      return (await msal.acquireTokenSilent({ scopes: [cfg.scope], account })).accessToken;
    },
    async accedi() {
      await pronto;
      await msal.loginRedirect({ scopes: [cfg.scope] });
      return new Promise<never>(() => undefined);
    },
    async esci() {
      await msal.logoutRedirect();
      return new Promise<never>(() => undefined);
    },
  };
}
