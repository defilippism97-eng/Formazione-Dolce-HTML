/**
 * Autorizzazioni: chi può vedere e fare cosa. Il backend DEVE applicarle a ogni chiamata.
 */
import { ANNULLABILI_DAL_LAVORATORE, IN_ATTESA_COORDINATORE, IN_ATTESA_HR, MODIFICABILI_DAL_LAVORATORE } from './stati';
import type { Richiesta, Ruolo, RuoloRegistro, Sessione } from './types';

export interface AzioniConsentite {
  modifica: boolean;
  annulla: boolean;
  esitoCoordinatore: boolean;
  esitoHR: boolean;
}

const PRIORITA: Ruolo[] = ['admin', 'hr', 'coordinatore', 'lavoratore'];

export function haRuolo(s: Pick<Sessione, 'ruoli'>, ruolo: Ruolo): boolean {
  return s.ruoli.includes(ruolo);
}

/** HR e amministratori hanno visibilità completa sulle richieste. */
export function isUfficioHR(s: Pick<Sessione, 'ruoli'>): boolean {
  return haRuolo(s, 'hr') || haRuolo(s, 'admin');
}

/** Ruolo "più alto", mostrato nell'intestazione. */
export function ruoloPrincipale(s: Pick<Sessione, 'ruoli'>): Ruolo | null {
  return PRIORITA.find((r) => s.ruoli.includes(r)) ?? null;
}

/**
 * Visibilità di una richiesta:
 * - il lavoratore vede solo le proprie;
 * - il coordinatore quelle dei lavoratori assegnati, escluse le bozze;
 * - HR e amministratori tutte, escluse le bozze altrui.
 */
export function puoVedereRichiesta(s: Sessione, r: Richiesta): boolean {
  if (r.login === s.login) return true;
  if (r.stato === 'Bozza') return false;
  if (haRuolo(s, 'coordinatore') && r.coordinatoreLogin === s.login) return true;
  return isUfficioHR(s);
}

/** Azioni consentite sulla singola richiesta. `meseChiuso` = mese di competenza chiuso. */
export function azioniConsentite(s: Sessione, r: Richiesta, meseChiuso: boolean): AzioniConsentite {
  const proprietario = r.login === s.login;
  return {
    modifica: proprietario && !meseChiuso && MODIFICABILI_DAL_LAVORATORE.has(r.stato),
    annulla: proprietario && !meseChiuso && ANNULLABILI_DAL_LAVORATORE.has(r.stato),
    // nessuno approva le proprie richieste
    esitoCoordinatore:
      !proprietario && !meseChiuso && haRuolo(s, 'coordinatore') && r.coordinatoreLogin === s.login && IN_ATTESA_COORDINATORE.has(r.stato),
    esitoHR: !proprietario && !meseChiuso && isUfficioHR(s) && IN_ATTESA_HR.has(r.stato),
  };
}

/** Ruolo da registrare nello storico per un'azione. */
export function ruoloRegistro(s: Pick<Sessione, 'ruoli'>, ambito: 'lavoratore' | 'coordinatore' | 'hr' | 'admin'): RuoloRegistro {
  switch (ambito) {
    case 'lavoratore':
      return 'Lavoratore';
    case 'coordinatore':
      return 'Coordinatore';
    case 'hr':
      return haRuolo(s, 'hr') ? 'Formazione HR' : 'Amministratore';
    case 'admin':
      return 'Amministratore';
  }
}
