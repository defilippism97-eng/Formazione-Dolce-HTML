/**
 * Testi delle notifiche e-mail (flussi F1–F6). In produzione i flussi / il backend
 * devono usare gli stessi contenuti; le e-mail ai lavoratori vanno all'e-mail di contatto.
 * Le e-mail NON contengono dati fiscali: i dettagli si consultano nell'app dopo l'accesso.
 */
import { nomeMese, titoloRichiesta, type KPI } from '../../domain';
import type { MonteOre, Notifica, Richiesta } from '../../domain';

export type Messaggio = Pick<Notifica, 'flusso' | 'oggetto' | 'testo'>;

const FIRMA = '\n\nGestione ore formazione – Società Dolce\nMessaggio automatico, non rispondere.';

const dataIT = (d: string) => d.split('-').reverse().join('/');

/** Ore nelle tre voci (per i permessi: ore di permesso). */
function oreVoci(permesso: boolean, retribuite = 0, gettone = 0, nonRetribuite = 0): string {
  if (permesso) return `${retribuite} ore di permesso${nonRetribuite ? `, ${nonRetribuite} non riconosciute` : ''}`;
  return `${retribuite} retribuite, ${gettone} gettone, ${nonRetribuite} non retribuite`;
}

function riassunto(r: Richiesta): string {
  const permesso = r.tipologia !== 'Formazione';
  return [
    `Richiesta: ${r.numero}`,
    `Lavoratore: ${r.cognome} ${r.nome}`,
    permesso ? `Permesso: ${titoloRichiesta(r)}` : `Corso: ${titoloRichiesta(r)} (${r.codiceCorso})`,
    `Data: ${dataIT(r.dataSessione)} – ${r.oraIngresso}-${r.oraUscita}${r.pausaPrevista ? ` (pausa di ${r.pausaMinuti} minuti)` : ''}`,
    `Ore richieste: ${oreVoci(permesso, r.oreRetribuiteRichieste, r.oreGettoneRichieste, r.oreNonRetribuiteRichieste)}`,
  ].join('\n');
}

export const messaggi = {
  invioCoordinatore(r: Richiesta, duplicato: boolean): Messaggio {
    return {
      flusso: 'F1',
      oggetto: `Nuova richiesta di formazione da approvare – ${r.cognome} ${r.nome}`,
      testo:
        `Gentile ${r.coordinatoreNome ?? 'coordinatore'},\n${r.nome} ${r.cognome} ha inviato una richiesta di riconoscimento ${r.tipologia === 'Formazione' ? 'delle ore di formazione' : `di un permesso (${r.tipologia})`}.\n\n` +
        riassunto(r) +
        (duplicato ? '\n\nATTENZIONE: possibile duplicato (stesso corso e stessa data di un’altra richiesta).' : '') +
        '\n\nApri la richiesta per approvarla, respingerla o chiedere un’integrazione.' +
        FIRMA,
    };
  },

  duplicatoHR(r: Richiesta, altre: string[]): Messaggio {
    return {
      flusso: 'F1',
      oggetto: `Possibile richiesta duplicata – ${r.numero}`,
      testo: `La richiesta ${r.numero} di ${r.cognome} ${r.nome} ha stesso corso e stessa data di: ${altre.join(', ')}.\n\n${riassunto(r)}${FIRMA}`,
    };
  },

  annullamento(r: Richiesta): Messaggio {
    return {
      flusso: 'F2',
      oggetto: `Richiesta annullata dal lavoratore – ${r.numero}`,
      testo: `${r.nome} ${r.cognome} ha annullato la richiesta ${r.numero}: non è più necessaria la tua approvazione.\n\n${riassunto(r)}${FIRMA}`,
    };
  },

  esitoCoordinatore(r: Richiesta): Messaggio {
    const testi: Record<string, string> = {
      'In attesa di validazione HR':
        `il coordinatore ha APPROVATO la tua richiesta, riconoscendo ${oreVoci(r.tipologia !== 'Formazione', r.oreRetribuiteCoord, r.oreGettoneCoord, r.oreNonRetribuiteCoord)}. Ora la richiesta passa all'Ufficio HR/Formazione per la validazione definitiva.`,
      'Respinta dal coordinatore': `il coordinatore ha RESPINTO la tua richiesta.\nMotivazione: ${r.noteCoordinatore ?? ''}`,
      'Integrazione richiesta dal coordinatore': `il coordinatore chiede un'INTEGRAZIONE alla tua richiesta.\nCosa correggere: ${r.noteCoordinatore ?? ''}\n\nApri l'app, modifica la richiesta e inviala di nuovo.`,
    };
    return {
      flusso: 'F2',
      oggetto: `Esito del coordinatore: ${r.stato} – ${r.numero}`,
      testo: `Ciao ${r.nome},\n${testi[r.stato] ?? `la tua richiesta è ora nello stato "${r.stato}".`}\n\n${riassunto(r)}${FIRMA}`,
    };
  },

  esitoHR(r: Richiesta, perCoordinatore: boolean): Messaggio {
    const testi: Record<string, string> = {
      'Validata da HR': `l'Ufficio HR/Formazione ha VALIDATO la richiesta in via definitiva: ${oreVoci(r.tipologia !== 'Formazione', r.oreRetribuiteHR, r.oreGettoneHR, r.oreNonRetribuiteHR)}.`,
      'Respinta da HR': `l'Ufficio HR/Formazione ha RESPINTO la richiesta.\nMotivazione: ${r.noteHR ?? ''}`,
      'Integrazione richiesta da HR': `l'Ufficio HR/Formazione chiede un'INTEGRAZIONE alla richiesta.\nCosa correggere: ${r.noteHR ?? ''}`,
    };
    const saluto = perCoordinatore ? `Gentile ${r.coordinatoreNome ?? 'coordinatore'},\nper la richiesta di ${r.nome} ${r.cognome} ` : `Ciao ${r.nome},\n`;
    return {
      flusso: 'F3',
      oggetto: `Esito HR: ${r.stato} – ${r.numero}`,
      testo: `${saluto}${testi[r.stato] ?? `la richiesta è ora nello stato "${r.stato}".`}\n\n${riassunto(r)}${FIRMA}`,
    };
  },

  promemoria(r: Richiesta, giorni: number): Messaggio {
    return {
      flusso: 'F4',
      oggetto: `Promemoria: richiesta in attesa da ${giorni} giorni lavorativi – ${r.numero}`,
      testo: `Gentile ${r.coordinatoreNome ?? 'coordinatore'},\nla richiesta di ${r.nome} ${r.cognome} attende la tua approvazione da ${giorni} giorni lavorativi.\n\n${riassunto(r)}${FIRMA}`,
    };
  },

  segnalazioneHR(r: Richiesta, giorni: number): Messaggio {
    return {
      flusso: 'F4',
      oggetto: `Sollecito: richiesta ferma dal coordinatore da ${giorni} giorni lavorativi – ${r.numero}`,
      testo: `La richiesta ${r.numero} di ${r.cognome} ${r.nome} attende l'approvazione di ${r.coordinatoreNome ?? 'un coordinatore'} da ${giorni} giorni lavorativi.\n\n${riassunto(r)}${FIRMA}`,
    };
  },

  riepilogoMensile(destinatario: string, anno: number, mese: number, kpi: KPI, aperte: Richiesta[], respinte: Richiesta[], incomplete: Richiesta[]): Messaggio {
    const elenco = (titolo: string, righe: Richiesta[]) =>
      righe.length
        ? `\n\n${titolo} (${righe.length}):\n` + righe.map((r) => `- ${r.numero} ${r.cognome} ${r.nome} – ${titoloRichiesta(r)} – ${r.stato}`).join('\n')
        : '';
    return {
      flusso: 'F5',
      oggetto: `Riepilogo formazione ${nomeMese(mese)} ${anno} – ${destinatario}`,
      testo:
        `Riepilogo della formazione di ${nomeMese(mese)} ${anno} (${destinatario}).\n\n` +
        `Lavoratori coinvolti: ${kpi.lavoratori}\nRichieste: ${kpi.richieste}\nOre frequentate: ${kpi.oreFrequentate}\n` +
        `Ore retribuite richieste: ${kpi.oreRetribuiteRichieste} – riconosciute dai coordinatori: ${kpi.oreRetribuiteCoord} – validate da HR: ${kpi.oreRetribuiteHR}\n` +
        `Ore gettone richieste: ${kpi.oreGettoneRichieste} – riconosciute dai coordinatori: ${kpi.oreGettoneCoord} – validate da HR: ${kpi.oreGettoneHR}\n` +
        `Ore non retribuite richieste: ${kpi.oreNonRetribuiteRichieste} – riconosciute dai coordinatori: ${kpi.oreNonRetribuiteCoord} – validate da HR: ${kpi.oreNonRetribuiteHR}\n` +
        `Ore di permesso (diritto allo studio e riqualifica) richieste: ${kpi.orePermessiRichieste} – validate da HR: ${kpi.orePermessiHR}` +
        elenco('ANCORA APERTE', aperte) +
        elenco('RESPINTE', respinte) +
        elenco('CON ANOMALIE (possibili duplicati, coordinatore mancante)', incomplete) +
        FIRMA,
    };
  },

  filePaghe(periodo: string, nomeFile: string, righe: number): Messaggio {
    return {
      flusso: 'F6',
      oggetto: `File paghe formazione ${periodo} disponibile`,
      testo: `È disponibile il file ${nomeFile} con ${righe} richieste validate da HR per il periodo ${periodo}.\nLo trovi nella raccolta documentale HR (sezione Chiusura mensile dell'app).${FIRMA}`,
    };
  },

  segnalazioneVariazione(nominativo: string, testo: string, coordinatore?: string): Messaggio {
    return {
      flusso: 'Sistema',
      oggetto: `Segnalazione di variazione dati – ${nominativo}`,
      testo:
        (coordinatore
          ? `Il coordinatore ${coordinatore} segnala una variazione dei dati organizzativi di ${nominativo}:`
          : `${nominativo} segnala una variazione dei propri dati organizzativi:`) +
        `\n\n"${testo}"\n\nGestiscila dalla schermata Amministrazione > Lavoratori.${FIRMA}`,
    };
  },

  monteOreAssegnato(nome: string, m: MonteOre): Messaggio {
    return {
      flusso: 'Sistema',
      oggetto: `${m.tipo}: monte ore assegnato`,
      testo: `Ciao ${nome},\nl'Ufficio HR/Formazione ti ha assegnato ${m.oreTotali} ore di "${m.tipo}" dal ${dataIT(m.validoDal)} al ${dataIT(m.validoAl)}.\nDa oggi puoi rendicontare i permessi nell'app: le ore si scalano dal monte ore fino a esaurimento.${FIRMA}`,
    };
  },

  cambioCoordinatore(nominativo: string, numero: number): Messaggio {
    return {
      flusso: 'Sistema',
      oggetto: `Nuovo lavoratore assegnato – ${nominativo}`,
      testo: `Ti è stato assegnato ${nominativo}. ${numero > 0 ? `Ci sono ${numero} richieste aperte che ora attendono te.` : ''}${FIRMA}`,
    };
  },

  riaperturaMese(periodo: string, utente: string, motivo: string): Messaggio {
    return {
      flusso: 'Sistema',
      oggetto: `Periodo ${periodo} riaperto`,
      testo: `Il periodo ${periodo} è stato riaperto da ${utente}.\nMotivo: ${motivo}${FIRMA}`,
    };
  },
};
