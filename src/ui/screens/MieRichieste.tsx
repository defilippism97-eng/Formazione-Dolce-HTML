/**
 * Schermata 2 – Le mie richieste (lavoratore).
 */
import { useMemo, useState } from 'react';
import {
  ANNULLABILI_DAL_LAVORATORE,
  APERTI,
  DEFINITIVI,
  MODIFICABILI_DAL_LAVORATORE,
  NOMI_MESI,
  STATI_RICHIESTA,
  TIPOLOGIE,
  isPermesso,
  titoloRichiesta,
  type ChiusuraMensile,
  type Richiesta,
} from '../../domain';
import { BadgeStato, BarraFiltri, Caricamento, CampoSelezione, ErroreCaricamento, Etichetta, Pagina, Pulsante, PulsanteIcona, Tabella } from '../components/ui';
import { useApp, useConferma } from '../contesto';
import * as f from '../format';
import { useAzione, useCarica } from '../hooks';
import { naviga, parametriQuery, ROTTE } from '../router';

type Gruppo = '' | 'approvate' | 'aperte' | 'bozze';

export function meseChiuso(chiusure: ChiusuraMensile[] | undefined, r: Pick<Richiesta, 'annoCompetenza' | 'meseCompetenza'>): boolean {
  return !!chiusure?.some((c) => c.anno === r.annoCompetenza && c.mese === r.meseCompetenza && c.stato === 'Chiuso');
}

export function MieRichieste() {
  const { backend } = useApp();
  const conferma = useConferma();
  const azione = useAzione();
  const dati = useCarica(async () => {
    const [richieste, chiusure] = await Promise.all([backend.getMieRichieste(), backend.getChiusure()]);
    return { richieste, chiusure };
  }, [backend]);

  const [anno, setAnno] = useState('');
  const [mese, setMese] = useState('');
  const [stato, setStato] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [gruppo, setGruppo] = useState<Gruppo>(() => (parametriQuery().get('gruppo') as Gruppo) ?? '');

  // il filtro per tipologia serve solo a chi ha anche permessi di studio o riqualifica
  const conPermessi = useMemo(() => (dati.dati?.richieste ?? []).some(isPermesso), [dati.dati]);
  const anni = useMemo(() => [...new Set((dati.dati?.richieste ?? []).map((r) => r.annoCompetenza))].sort((a, b) => b - a), [dati.dati]);
  const righe = useMemo(
    () =>
      (dati.dati?.richieste ?? []).filter(
        (r) =>
          (!anno || r.annoCompetenza === Number(anno)) &&
          (!mese || r.meseCompetenza === Number(mese)) &&
          (!stato || r.stato === stato) &&
          (!tipologia || r.tipologia === tipologia) &&
          (gruppo !== 'approvate' || DEFINITIVI.has(r.stato)) &&
          (gruppo !== 'aperte' || (APERTI.has(r.stato) && r.stato !== 'Bozza')) &&
          (gruppo !== 'bozze' || r.stato === 'Bozza'),
      ),
    [dati.dati, anno, mese, stato, tipologia, gruppo],
  );

  const annulla = async (r: Richiesta) => {
    const ok = await conferma({
      titolo: 'Annullare la richiesta?',
      testo: `La richiesta ${r.numero} (${titoloRichiesta(r)}) verrà annullata e non potrà più essere inviata.${r.stato !== 'Bozza' ? '\nIl coordinatore riceverà un avviso.' : ''}`,
      etichettaConferma: 'Annulla la richiesta',
      pericolo: true,
    });
    if (!ok) return;
    if (await azione.prova(() => backend.annullaRichiesta(r.id), 'Richiesta annullata.')) await dati.ricarica();
  };

  const azzera = () => {
    setAnno('');
    setMese('');
    setStato('');
    setTipologia('');
    setGruppo('');
  };

  return (
    <Pagina
      titolo="Le mie richieste"
      sottotitolo="Le richieste di riconoscimento delle ore che hai inserito: formazione e, se HR ti ha abilitato, permessi per studio e riqualifica."
      azioni={
        <Pulsante icona="aggiungi" onClick={() => naviga(ROTTE.nuovaRichiesta)}>
          Nuova richiesta
        </Pulsante>
      }
    >
      <BarraFiltri onAzzera={azzera} conteggio={`${righe.length} richieste`}>
        <CampoSelezione etichetta="Anno" value={anno} onChange={(e) => setAnno(e.target.value)} vuota="Tutti" opzioni={anni.map((a) => ({ valore: String(a), etichetta: String(a) }))} />
        <CampoSelezione etichetta="Mese" value={mese} onChange={(e) => setMese(e.target.value)} vuota="Tutti" opzioni={NOMI_MESI.map((m, i) => ({ valore: String(i + 1), etichetta: m }))} />
        <CampoSelezione etichetta="Stato" value={stato} onChange={(e) => setStato(e.target.value)} vuota="Tutti" opzioni={STATI_RICHIESTA.map((s) => ({ valore: s, etichetta: s }))} />
        {conPermessi && (
          <CampoSelezione etichetta="Tipologia" value={tipologia} onChange={(e) => setTipologia(e.target.value)} vuota="Tutte" opzioni={TIPOLOGIE.map((t) => ({ valore: t, etichetta: t }))} />
        )}
        <CampoSelezione
          etichetta="Mostra"
          value={gruppo}
          onChange={(e) => setGruppo(e.target.value as Gruppo)}
          vuota="Tutte"
          opzioni={[
            { valore: 'aperte', etichetta: 'In attesa e integrazioni' },
            { valore: 'approvate', etichetta: 'Approvate' },
            { valore: 'bozze', etichetta: 'Bozze' },
          ]}
        />
      </BarraFiltri>

      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {dati.caricamento && !dati.dati ? (
        <Caricamento />
      ) : (
        <Tabella
          didascalia="Le mie richieste"
          righe={righe}
          chiave={(r) => r.id}
          onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
          vuoto="Nessuna richiesta corrisponde ai filtri."
          colonne={[
            {
              titolo: 'Numero',
              valore: (r) => (
                <>
                  <span className="cella-principale">{r.numero}</span>
                  {(r.stato === 'Integrazione richiesta dal coordinatore' || r.stato === 'Integrazione richiesta da HR') && (
                    <span className="cella-secondaria">
                      <Etichetta tono="avviso">Da correggere</Etichetta>
                    </span>
                  )}
                </>
              ),
            },
            { titolo: 'Data', valore: (r) => f.data(r.dataSessione) },
            {
              titolo: 'Corso o attività',
              valore: (r) => (
                <>
                  <span className="cella-titolo">{titoloRichiesta(r)}</span>
                  <span className="cella-secondaria">{isPermesso(r) ? <Etichetta tono="info">{r.tipologia}</Etichetta> : r.codiceCorso}</span>
                </>
              ),
            },
            { titolo: 'Ore frequentate', valore: (r) => f.ore(r.oreFrequentate), numerica: true },
            { titolo: 'Stato', valore: (r) => <BadgeStato stato={r.stato} /> },
            { titolo: 'Ultima modifica', valore: (r) => f.dataOra(r.modificatoIl), secondaria: true },
          ]}
          azioni={(r) => {
            const chiuso = meseChiuso(dati.dati?.chiusure, r);
            return (
              <>
                <PulsanteIcona icona="visualizza" etichetta={`Visualizza ${r.numero}`} onClick={() => naviga(ROTTE.dettaglio(r.id))} />
                {MODIFICABILI_DAL_LAVORATORE.has(r.stato) && !chiuso && (
                  <PulsanteIcona icona="modifica" etichetta={`Modifica ${r.numero}`} onClick={() => naviga(ROTTE.modificaRichiesta(r.id))} />
                )}
                {ANNULLABILI_DAL_LAVORATORE.has(r.stato) && !chiuso && (
                  <PulsanteIcona icona="annulla" variante="pericolo" etichetta={`Annulla ${r.numero}`} disabled={azione.inCorso} onClick={() => void annulla(r)} />
                )}
              </>
            );
          }}
        />
      )}
    </Pagina>
  );
}
