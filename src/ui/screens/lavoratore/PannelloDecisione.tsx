/**
 * Pannello di decisione sulla singola richiesta:
 *  - coordinatore: ore riconosciute, nota, approva / respingi / richiedi integrazione;
 *  - Formazione HR: ore approvate in via definitiva, nota, valida / respingi / richiedi integrazione.
 */
import { useMemo, useRef, useState } from 'react';
import { arrotonda2, validaDecisione, type EsitoDecisione, type ErroreValidazione, type Richiesta } from '../../../domain';
import { Avviso, CampoArea, CampoTesto, Pulsante, Scheda } from '../../components/ui';
import { useApp, useConferma, useMessaggi } from '../../contesto';
import * as f from '../../format';
import { useAzione } from '../../hooks';
import { focusPrimoErrore, testoNumero } from './comuni';
import { numeroCampo } from './statoModulo';

type RuoloDecisione = 'coordinatore' | 'hr';

const MESSAGGI: Record<RuoloDecisione, Record<EsitoDecisione, string>> = {
  coordinatore: {
    approva: 'Richiesta approvata: passa all’Ufficio HR/Formazione per la validazione.',
    respingi: 'Richiesta respinta: il lavoratore riceverà la motivazione.',
    integrazione: 'Integrazione richiesta: il lavoratore potrà correggere e reinviare la richiesta.',
  },
  hr: {
    approva: 'Richiesta validata: le ore sono riconosciute in via definitiva.',
    respingi: 'Richiesta respinta: lavoratore e coordinatore riceveranno la motivazione.',
    integrazione: 'Integrazione richiesta: lavoratore e coordinatore riceveranno la notifica.',
  },
};

export function PannelloDecisione({ ruolo, richiesta: r, onFatto }: { ruolo: RuoloDecisione; richiesta: Richiesta; onFatto: () => void | Promise<void> }) {
  const { backend } = useApp();
  const conferma = useConferma();
  const mostra = useMessaggi();
  const azione = useAzione();
  const rifPannello = useRef<HTMLDivElement>(null);
  const hr = ruolo === 'hr';
  const [oreRet, setOreRet] = useState(() => testoNumero(hr ? r.oreRetribuiteCoord ?? r.oreRetribuiteRichieste : r.oreRetribuiteRichieste));
  const [oreGet, setOreGet] = useState(() => testoNumero(hr ? r.oreGettoneCoord ?? r.oreGettoneRichieste : r.oreGettoneRichieste));
  const [nota, setNota] = useState('');
  /** Esito tentato: da quel momento i controlli sono mostrati e aggiornati mentre si scrive. */
  const [tentato, setTentato] = useState<EsitoDecisione | null>(null);
  const [inCorso, setInCorso] = useState<EsitoDecisione | null>(null);

  const controlla = (esito: EsitoDecisione): ErroreValidazione[] => {
    const ret = numeroCampo(oreRet);
    const get = numeroCampo(oreGet);
    const errori: ErroreValidazione[] = [];
    if (esito === 'approva') {
      if (Number.isNaN(ret)) errori.push({ campo: 'oreRetribuite', messaggio: 'Inserisci un numero valido (es. 2,5).' });
      if (Number.isNaN(get)) errori.push({ campo: 'oreGettone', messaggio: 'Inserisci un numero valido (es. 2,5).' });
    }
    return [...errori, ...validaDecisione(esito, ret, get, r.oreFrequentate, nota)];
  };
  const errori = useMemo(() => (tentato ? controlla(tentato) : []), [tentato, oreRet, oreGet, nota]); // eslint-disable-line react-hooks/exhaustive-deps
  const erroreDi = (campo: string) => errori.find((e) => e.campo === campo)?.messaggio ?? azione.erroreDi(campo);

  const totale = numeroCampo(oreRet) + numeroCampo(oreGet);
  const ridotte = Number.isFinite(totale) && totale < r.oreRetribuiteRichieste + r.oreGettoneRichieste;

  const decidi = async (esito: EsitoDecisione) => {
    setTentato(esito);
    const problemi = controlla(esito);
    if (problemi.length) {
      focusPrimoErrore(rifPannello.current);
      return;
    }
    if (esito === 'respingi') {
      const ok = await conferma({
        titolo: 'Respingere la richiesta?',
        testo: `La richiesta ${r.numero} di ${r.nome} ${r.cognome} verrà respinta e non potrà più essere reinviata.\nMotivazione: ${nota.trim()}`,
        etichettaConferma: 'Respingi',
        pericolo: true,
      });
      if (!ok) return;
    }
    const ret = arrotonda2(numeroCampo(oreRet));
    const get = arrotonda2(numeroCampo(oreGet));
    const testoNota = nota.trim() || undefined;
    setInCorso(esito);
    try {
      if (hr) {
        const esitoHR = await azione.prova(() =>
          backend.decisioneHR({ esito, nota: testoNota, voci: [esito === 'approva' ? { id: r.id, oreRetribuite: ret, oreGettone: get } : { id: r.id }] }),
        );
        if (!esitoHR) return;
        const scartata = esitoHR.scartate[0];
        if (scartata) {
          mostra('errore', `La richiesta ${scartata.numero} non è stata elaborata: ${scartata.motivo}`);
          return;
        }
        mostra('successo', MESSAGGI.hr[esito]);
      } else {
        const fatto = await azione.prova(() => backend.decisioneCoordinatore(r.id, { esito, oreRetribuite: ret, oreGettone: get, nota: testoNota }), MESSAGGI.coordinatore[esito]);
        if (!fatto) {
          focusPrimoErrore(rifPannello.current);
          return;
        }
      }
      setTentato(null);
      await onFatto();
    } finally {
      setInCorso(null);
    }
  };

  const occupato = inCorso !== null;
  return (
    <Scheda titolo={hr ? 'Validazione HR' : 'Decisione del coordinatore'} icona="valida" className="pannello-decisione">
      <div ref={rifPannello} className="pannello-decisione-corpo">
        <dl className="elenco-dati elenco-dati-compatto">
          <div>
            <dt>Ore frequentate</dt>
            <dd>{f.ore(r.oreFrequentate)}</dd>
          </div>
          <div>
            <dt>Richieste dal lavoratore</dt>
            <dd>
              {f.ore(r.oreRetribuiteRichieste)} retrib. · {f.ore(r.oreGettoneRichieste)} gettone
            </dd>
          </div>
          {hr && (
            <div>
              <dt>Riconosciute dal coordinatore</dt>
              <dd>
                {f.ore(r.oreRetribuiteCoord)} retrib. · {f.ore(r.oreGettoneCoord)} gettone
              </dd>
            </div>
          )}
        </dl>
        <div className="griglia griglia-2">
          <CampoTesto
            etichetta={hr ? 'Ore retribuite approvate' : 'Ore retribuite riconosciute'}
            inputMode="decimal"
            autoComplete="off"
            value={oreRet}
            onChange={(e) => setOreRet(e.target.value)}
            errore={erroreDi('oreRetribuite')}
          />
          <CampoTesto
            etichetta={hr ? 'Ore gettone approvate' : 'Ore gettone riconosciute'}
            inputMode="decimal"
            autoComplete="off"
            value={oreGet}
            onChange={(e) => setOreGet(e.target.value)}
            errore={erroreDi('oreGettone')}
          />
        </div>
        <p className="testo-piccolo testo-secondario" aria-live="polite">
          Totale {hr ? 'approvato' : 'riconosciuto'}: <strong>{Number.isFinite(totale) ? f.ore(arrotonda2(totale)) : '—'}</strong> su {f.ore(r.oreFrequentate)} frequentate
          {ridotte && ' (meno di quanto richiesto: indica il motivo nella nota)'}.
        </p>
        <CampoArea
          etichetta="Nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          errore={erroreDi('nota')}
          aiuto={`Obbligatoria per respingere o chiedere un’integrazione: la riceve il lavoratore${hr ? ' (e il coordinatore)' : ''}.`}
          placeholder={hr ? 'Es. manca l’attestato: caricalo per completare la validazione.' : 'Es. allega l’attestato di partecipazione.'}
        />
        {r.possibileDuplicato && (
          <Avviso tono="avviso">Possibile duplicato: verifica che la sessione non sia già stata rendicontata prima di {hr ? 'validare' : 'approvare'}.</Avviso>
        )}
        <div className="decisione-pulsanti">
          <Pulsante variante="successo" icona={hr ? 'valida' : 'approva'} inCorso={inCorso === 'approva'} disabled={occupato} onClick={() => void decidi('approva')}>
            {hr ? 'Valida' : 'Approva'}
          </Pulsante>
          <Pulsante variante="avviso" icona="integrazione" inCorso={inCorso === 'integrazione'} disabled={occupato} onClick={() => void decidi('integrazione')}>
            Richiedi integrazione
          </Pulsante>
          <Pulsante variante="pericolo" icona="respingi" inCorso={inCorso === 'respingi'} disabled={occupato} onClick={() => void decidi('respingi')}>
            Respingi
          </Pulsante>
        </div>
      </div>
    </Scheda>
  );
}
