/**
 * Anomalie da mostrare a HR: duplicati, attestati mancanti, dati incompleti.
 */
import { arrotonda2 } from './calcoli';
import { APERTI, DEFINITIVI, ESCLUSI_DAI_CONTROLLI } from './stati';
import type { Lavoratore, Richiesta } from './types';

export type TipoAnomalia =
  | 'duplicato'
  | 'attestatoMancante'
  | 'sessioniNonCoincidenti'
  | 'senzaCoordinatore'
  | 'codiceFiscaleMancante'
  | 'segnalazioneAperta'
  | 'sollecitoHR';

export const ETICHETTA_ANOMALIA: Record<TipoAnomalia, string> = {
  duplicato: 'Possibile duplicato',
  attestatoMancante: 'Attestato mancante',
  sessioniNonCoincidenti: 'Ore del corso non coincidenti',
  senzaCoordinatore: 'Coordinatore non assegnato',
  codiceFiscaleMancante: 'Codice fiscale mancante',
  segnalazioneAperta: 'Segnalazione di variazione da gestire',
  sollecitoHR: 'In attesa del coordinatore da oltre 7 giorni lavorativi',
};

export interface Anomalia {
  tipo: TipoAnomalia;
  gravita: 'alta' | 'media' | 'bassa';
  descrizione: string;
  richiestaId?: string;
  lavoratoreId?: string;
}

const CON_ATTESTATO_ATTESO = (r: Richiesta) =>
  r.stato !== 'Bozza' && !ESCLUSI_DAI_CONTROLLI.has(r.stato);

/**
 * @param richieste richieste del periodo da controllare
 * @param tutteLeRichieste tutte le richieste (per il controllo sulla durata complessiva dei corsi)
 */
export function rilevaAnomalie(
  richieste: readonly Richiesta[],
  tutteLeRichieste: readonly Richiesta[],
  lavoratori: readonly Lavoratore[],
): Anomalia[] {
  const out: Anomalia[] = [];
  const perLavoratore = new Map(lavoratori.map((l) => [l.id, l]));

  for (const r of richieste) {
    if (r.stato === 'Bozza' || r.stato === 'Annullata') continue;
    if (r.possibileDuplicato && !ESCLUSI_DAI_CONTROLLI.has(r.stato)) {
      out.push({ tipo: 'duplicato', gravita: 'alta', richiestaId: r.id, descrizione: `${r.numero}: stesso lavoratore, corso e data di un'altra richiesta` });
    }
    if (CON_ATTESTATO_ATTESO(r) && !r.allegati.some((a) => a.tipo === 'Attestato')) {
      out.push({ tipo: 'attestatoMancante', gravita: 'media', richiestaId: r.id, descrizione: `${r.numero}: nessun attestato allegato` });
    }
    if (!r.coordinatoreLogin && APERTI.has(r.stato)) {
      out.push({ tipo: 'senzaCoordinatore', gravita: 'alta', richiestaId: r.id, descrizione: `${r.numero}: richiesta senza coordinatore` });
    }
    if (r.segnalataHR && APERTI.has(r.stato)) {
      out.push({ tipo: 'sollecitoHR', gravita: 'media', richiestaId: r.id, descrizione: `${r.numero}: ${r.giorniAttesa} giorni lavorativi in attesa del coordinatore` });
    }
  }

  // Durata complessiva del corso: somma delle sessioni per lavoratore e codice corso
  const gruppi = new Map<string, Richiesta[]>();
  for (const r of tutteLeRichieste) {
    if (r.stato === 'Bozza' || ESCLUSI_DAI_CONTROLLI.has(r.stato)) continue;
    const k = `${r.login}|${r.codiceCorso}`;
    gruppi.set(k, [...(gruppi.get(k) ?? []), r]);
  }
  const idPeriodo = new Set(richieste.map((r) => r.id));
  for (const righe of gruppi.values()) {
    const primo = righe[0];
    if (!primo || !righe.some((r) => idPeriodo.has(r.id))) continue;
    const somma = arrotonda2(righe.reduce((s, r) => s + r.durataSessione, 0));
    if (Math.abs(somma - primo.durataCorso) > 0.001 && righe.every((r) => DEFINITIVI.has(r.stato) || r.stato === 'In attesa di validazione HR')) {
      out.push({
        tipo: 'sessioniNonCoincidenti',
        gravita: 'bassa',
        richiestaId: righe.find((r) => idPeriodo.has(r.id))?.id,
        descrizione: `${primo.cognome} ${primo.nome} – ${primo.codiceCorso}: sessioni per ${somma} h su ${primo.durataCorso} h di corso`,
      });
    }
  }

  // Dati dei lavoratori coinvolti
  const coinvolti = new Set(richieste.filter((r) => r.stato !== 'Bozza' && r.stato !== 'Annullata').map((r) => r.lavoratoreId));
  for (const id of coinvolti) {
    const l = perLavoratore.get(id);
    if (l && !l.codiceFiscale) {
      out.push({ tipo: 'codiceFiscaleMancante', gravita: 'alta', lavoratoreId: l.id, descrizione: `${l.cognome} ${l.nome}: codice fiscale non registrato` });
    }
  }
  for (const l of lavoratori) {
    if (l.segnalazioni.some((s) => s.aperta)) {
      out.push({ tipo: 'segnalazioneAperta', gravita: 'media', lavoratoreId: l.id, descrizione: `${l.cognome} ${l.nome}: segnalazione di variazione dati da gestire` });
    }
  }
  const ordine = { alta: 0, media: 1, bassa: 2 };
  return out.sort((a, b) => ordine[a.gravita] - ordine[b.gravita]);
}
