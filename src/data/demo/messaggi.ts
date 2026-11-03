/**
 * Testi delle notifiche e-mail (flussi F1–F6). In produzione i flussi / il backend
 * devono usare gli stessi contenuti; le e-mail ai lavoratori vanno all'e-mail di contatto.
 * Le e-mail NON contengono dati fiscali: i dettagli si consultano nell'app dopo l'accesso.
 */
import { nomeMese, type KPI } from '../../domain';
import type { Notifica, Richiesta } from '../../domain';

export type Messaggio = Pick<Notifica, 'flusso' | 'oggetto' | 'testo'>;

const FIRMA = '\n\nGestione ore formazione – Società Dolce\nMessaggio automatico, non rispondere.';

function riassunto(r: Richiesta): string {
  return [
    `Richiesta: ${r.numero}`,
    `Lavoratore: ${r.cognome} ${r.nome}`,
    `Corso: ${r.titoloCorsoLibero || r.titoloCorso} (${r.codiceCorso})`,
    `Data: ${r.dataSessione.split('-').reverse().join('/')} – ${r.oraIngresso}-${r.oraUscita}`,
    `Ore richieste: ${r.oreRetribuiteRichieste} retribuite, ${r.oreGettoneRichieste} gettone`,
  ].join('\n');
}

export const messaggi = {
  invioCoordinatore(r: Richiesta, duplicato: boolean): Messaggio {
    return {
      flusso: 'F1',
      oggetto: `Nuova richiesta di formazione da approvare – ${r.cognome} ${r.nome}`,
      testo:
        `Gentile ${r.coordinatoreNome ?? 'coordinatore'},\n${r.nome} ${r.cognome} ha inviato una richiesta di riconoscimento delle ore di formazione.\n\n` +
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
        `il coordinatore ha APPROVATO la tua richiesta, riconoscendo ${r.oreRetribuiteCoord ?? 0} ore retribuite e ${r.oreGettoneCoord ?? 0} ore gettone. Ora la richiesta passa all'Ufficio HR/Formazione per la validazione definitiva.`,
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
      'Validata da HR': `l'Ufficio HR/Formazione ha VALIDATO la richiesta: ${r.oreRetribuiteHR ?? 0} ore retribuite e ${r.oreGettoneHR ?? 0} ore gettone riconosciute in via definitiva.`,
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
        ? `\n\n${titolo} (${righe.length}):\n` + righe.map((r) => `- ${r.numero} ${r.cognome} ${r.nome} – ${r.titoloCorsoLibero || r.titoloCorso} – ${r.stato}`).join('\n')
        : '';
    return {
      flusso: 'F5',
      oggetto: `Riepilogo formazione ${nomeMese(mese)} ${anno} – ${destinatario}`,
      testo:
        `Riepilogo della formazione di ${nomeMese(mese)} ${anno} (${destinatario}).\n\n` +
        `Lavoratori coinvolti: ${kpi.lavoratori}\nRichieste: ${kpi.richieste}\nOre frequentate: ${kpi.oreFrequentate}\n` +
        `Ore retribuite richieste: ${kpi.oreRetribuiteRichieste} – riconosciute dai coordinatori: ${kpi.oreRetribuiteCoord} – validate da HR: ${kpi.oreRetribuiteHR}\n` +
        `Ore gettone richieste: ${kpi.oreGettoneRichieste} – riconosciute dai coordinatori: ${kpi.oreGettoneCoord} – validate da HR: ${kpi.oreGettoneHR}` +
        elenco('ANCORA APERTE', aperte) +
        elenco('RESPINTE', respinte) +
        elenco('INCOMPLETE (attestato mancante o anomalie)', incomplete) +
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

  segnalazioneVariazione(nominativo: string, testo: string): Messaggio {
    return {
      flusso: 'Sistema',
      oggetto: `Segnalazione di variazione dati – ${nominativo}`,
      testo: `${nominativo} segnala una variazione dei propri dati organizzativi:\n\n"${testo}"\n\nGestiscila dalla schermata Amministrazione > Lavoratori.${FIRMA}`,
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
