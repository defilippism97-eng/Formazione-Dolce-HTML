/**
 * Pannello di decisione sulla singola richiesta:
 *  - coordinatore: ore riconosciute, nota, approva / respingi / richiedi integrazione;
 *  - Formazione HR: ore approvate in via definitiva, nota, valida / respingi / richiedi integrazione.
 *
 * Formazione: tre voci (retribuite, a gettone, da non retribuire) la cui somma deve essere
 * uguale alle ore frequentate. Permessi (diritto allo studio, riqualifica professionale):
 * ore di permesso riconosciute (a carico del monte ore) e ore non riconosciute.
 */
import { useMemo, useRef, useState } from 'react';
import type { DettaglioRichiesta } from '../../../data/api';
import { arrotonda2, isPermesso, validaDecisione, type EsitoDecisione, type ErroreValidazione, type Richiesta } from '../../../domain';
import { Avviso, CampoArea, CampoTesto, Pulsante, Scheda } from '../../components/ui';
import { useApp, useConferma, useMessaggi } from '../../contesto';
import * as f from '../../format';
import { useAzione } from '../../hooks';
import { focusPrimoErrore, testoNumero } from './comuni';
import { oreMancanti, Ripartizione } from './Ripartizione';
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

const NUMERO_NON_VALIDO = 'Inserisci un numero valido (es. 2,5).';

/** Riepilogo di una terna di ore, es. "3,5 retrib. · 0 gettone · 0,5 non retrib.". */
function terna(r: Richiesta, ret?: number, get?: number, non?: number): string {
  if (isPermesso(r)) return `${f.ore(ret)} di permesso · ${f.ore(non)} non riconosciute`;
  return `${f.ore(ret)} retrib. · ${f.ore(get)} gettone · ${f.ore(non)} non retrib.`;
}

export function PannelloDecisione({
  ruolo,
  richiesta: r,
  gettonePrevisto,
  monteOre,
  onFatto,
}: {
  ruolo: RuoloDecisione;
  richiesta: Richiesta;
  /** Falso se il corso a catalogo non prevede il gettone. */
  gettonePrevisto: boolean;
  /** Solo per i permessi: monte ore da cui si scalano le ore. */
  monteOre?: DettaglioRichiesta['monteOre'];
  onFatto: () => void | Promise<void>;
}) {
  const { backend } = useApp();
  const conferma = useConferma();
  const mostra = useMessaggi();
  const azione = useAzione();
  const rifPannello = useRef<HTMLDivElement>(null);
  const hr = ruolo === 'hr';
  const permesso = isPermesso(r);
  const conGettone = !permesso && gettonePrevisto;
  const [oreRet, setOreRet] = useState(() => testoNumero(hr ? r.oreRetribuiteCoord ?? r.oreRetribuiteRichieste : r.oreRetribuiteRichieste));
  const [oreGet, setOreGet] = useState(() => testoNumero(hr ? r.oreGettoneCoord ?? r.oreGettoneRichieste : r.oreGettoneRichieste));
  const [oreNon, setOreNon] = useState(() => testoNumero(hr ? r.oreNonRetribuiteCoord ?? r.oreNonRetribuiteRichieste : r.oreNonRetribuiteRichieste));
  const [nota, setNota] = useState('');
  /** Esito tentato: da quel momento i controlli sono mostrati e aggiornati mentre si scrive. */
  const [tentato, setTentato] = useState<EsitoDecisione | null>(null);
  const [inCorso, setInCorso] = useState<EsitoDecisione | null>(null);

  const ret = numeroCampo(oreRet);
  const get = conGettone ? numeroCampo(oreGet) : 0;
  const non = numeroCampo(oreNon);
  /** Per i permessi: ore ancora disponibili nel monte ore, senza contare questa richiesta. */
  const residuoMonte = permesso ? monteOre?.oreResidueSenzaQuesta ?? 0 : undefined;

  const controlla = (esito: EsitoDecisione): ErroreValidazione[] => {
    const errori: ErroreValidazione[] = [];
    if (esito === 'approva') {
      if (Number.isNaN(ret)) errori.push({ campo: 'oreRetribuite', messaggio: NUMERO_NON_VALIDO });
      if (Number.isNaN(get)) errori.push({ campo: 'oreGettone', messaggio: NUMERO_NON_VALIDO });
      if (Number.isNaN(non)) errori.push({ campo: 'oreNonRetribuite', messaggio: NUMERO_NON_VALIDO });
    }
    return [...errori, ...validaDecisione(esito, { retribuite: ret, gettone: get, nonRetribuite: non }, r.oreFrequentate, nota, { gettonePrevisto: conGettone, oreResidueMonteOre: residuoMonte })];
  };
  const errori = useMemo(() => (tentato ? controlla(tentato) : []), [tentato, oreRet, oreGet, oreNon, nota]); // eslint-disable-line react-hooks/exhaustive-deps
  const erroreDi = (campo: string) => errori.find((e) => e.campo === campo)?.messaggio ?? azione.erroreDi(campo);

  /** Ore pagate o di permesso riconosciute in meno rispetto a quelle chieste dal lavoratore. */
  const ridotte = Number.isFinite(ret + get) && ret + get < r.oreRetribuiteRichieste + r.oreGettoneRichieste - 0.005;

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
    const ore = { oreRetribuite: arrotonda2(ret), oreGettone: arrotonda2(get), oreNonRetribuite: arrotonda2(non) };
    const testoNota = nota.trim() || undefined;
    setInCorso(esito);
    try {
      if (hr) {
        const esitoHR = await azione.prova(() => backend.decisioneHR({ esito, nota: testoNota, voci: [esito === 'approva' ? { id: r.id, ...ore } : { id: r.id }] }));
        if (!esitoHR) return;
        const scartata = esitoHR.scartate[0];
        if (scartata) {
          mostra('errore', `La richiesta ${scartata.numero} non è stata elaborata: ${scartata.motivo}`);
          return;
        }
        mostra('successo', MESSAGGI.hr[esito]);
      } else {
        const fatto = await azione.prova(() => backend.decisioneCoordinatore(r.id, { esito, ...ore, nota: testoNota }), MESSAGGI.coordinatore[esito]);
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
  const verbo = hr ? 'approvate' : 'riconosciute';
  return (
    <Scheda titolo={hr ? 'Validazione HR' : 'Decisione del coordinatore'} icona="valida" className="pannello-decisione">
      <div ref={rifPannello} className="pannello-decisione-corpo">
        <dl className="elenco-dati elenco-dati-compatto">
          <div>
            <dt>{permesso ? 'Ore del permesso' : 'Ore frequentate'}</dt>
            <dd>{f.ore(r.oreFrequentate)}</dd>
          </div>
          <div>
            <dt>Richieste dal lavoratore</dt>
            <dd>{terna(r, r.oreRetribuiteRichieste, r.oreGettoneRichieste, r.oreNonRetribuiteRichieste)}</dd>
          </div>
          {hr && (
            <div>
              <dt>Riconosciute dal coordinatore</dt>
              <dd>{terna(r, r.oreRetribuiteCoord, r.oreGettoneCoord, r.oreNonRetribuiteCoord)}</dd>
            </div>
          )}
          {permesso && (
            <div>
              <dt>Monte ore residuo (senza questa richiesta)</dt>
              <dd>{monteOre ? f.ore(monteOre.oreResidueSenzaQuesta) : 'Monte ore non trovato'}</dd>
            </div>
          )}
        </dl>

        {permesso ? (
          <div className="griglia griglia-2">
            <CampoTesto
              etichetta={`Ore di permesso ${verbo}`}
              inputMode="decimal"
              autoComplete="off"
              value={oreRet}
              onChange={(e) => setOreRet(e.target.value)}
              errore={erroreDi('oreRetribuite')}
              aiuto="Si scalano dal monte ore."
            />
            <CampoTesto
              etichetta="Ore non riconosciute"
              inputMode="decimal"
              autoComplete="off"
              value={oreNon}
              onChange={(e) => setOreNon(e.target.value)}
              errore={erroreDi('oreNonRetribuite')}
              aiuto="Non si scalano dal monte ore."
            />
          </div>
        ) : (
          <div className={`griglia ${conGettone ? 'griglia-3' : 'griglia-2'} griglia-ore-decisione`}>
            <CampoTesto etichetta={`Ore retribuite ${verbo}`} inputMode="decimal" autoComplete="off" value={oreRet} onChange={(e) => setOreRet(e.target.value)} errore={erroreDi('oreRetribuite')} />
            {conGettone && (
              <CampoTesto etichetta={`Ore a gettone ${verbo}`} inputMode="decimal" autoComplete="off" value={oreGet} onChange={(e) => setOreGet(e.target.value)} errore={erroreDi('oreGettone')} />
            )}
            <CampoTesto etichetta="Ore da non retribuire" inputMode="decimal" autoComplete="off" value={oreNon} onChange={(e) => setOreNon(e.target.value)} errore={erroreDi('oreNonRetribuite')} />
          </div>
        )}
        {!conGettone && !permesso && <p className="testo-piccolo testo-secondario">Per questo corso il gettone non è previsto.</p>}

        <Ripartizione
          valori={conGettone ? [oreRet, oreGet, oreNon] : [oreRet, oreNon]}
          frequentate={r.oreFrequentate}
          azioni={(diff) => (
            <button type="button" className="link-testo" onClick={() => setOreNon(testoNumero(arrotonda2(numeroCampo(oreNon) + diff)))}>
              {oreMancanti(diff)} in «{permesso ? 'Ore non riconosciute' : 'Ore da non retribuire'}»
            </button>
          )}
        />
        {ridotte && (
          <p className="testo-piccolo testo-secondario">
            {permesso ? 'Riconosci meno ore di permesso' : 'Riconosci meno ore pagate'} di quante ne ha chieste il lavoratore: indica il motivo nella nota.
          </p>
        )}

        <CampoArea
          etichetta="Nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          errore={erroreDi('nota')}
          aiuto={`Obbligatoria per respingere o chiedere un’integrazione: la riceve il lavoratore${hr ? ' (e il coordinatore)' : ''}.`}
          placeholder={permesso ? 'Es. indica meglio l’attività svolta con il permesso.' : 'Es. correggi l’orario di uscita: risulta diverso dal foglio firme.'}
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
