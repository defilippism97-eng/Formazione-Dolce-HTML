/**
 * Configurazione letta a runtime da `window.SDF_CONFIG` (definita in index.html),
 * così l'IT può passare da DEMO a produzione senza ricompilare.
 */
export interface ConfigurazioneApp {
  /** `demo`: dati simulati nel browser. `produzione`: API reali con accesso Microsoft 365. */
  modalita: 'demo' | 'produzione';
  /** URL di base delle API REST (solo produzione), es. https://formazione.societadolce.it/api */
  apiBaseUrl?: string;
  /** Parametri Microsoft Entra ID per l'accesso (solo produzione). */
  entra?: { clientId: string; tenantId: string; scope: string; redirectUri?: string };
  linkResetPassword: string;
  nomeApp: string;
  nomeAzienda: string;
  /** Ritardo simulato delle chiamate in DEMO (ms). */
  ritardoDemoMs: number;
}

declare global {
  interface Window {
    SDF_CONFIG?: Partial<ConfigurazioneApp>;
  }
}

const PREDEFINITA: ConfigurazioneApp = {
  modalita: 'demo',
  linkResetPassword: 'https://password.societadolce.it/',
  nomeApp: 'Gestione ore formazione',
  nomeAzienda: 'Società Dolce',
  ritardoDemoMs: 150,
};

export const config: ConfigurazioneApp = {
  ...PREDEFINITA,
  ...(typeof window !== 'undefined' ? window.SDF_CONFIG : undefined),
};
