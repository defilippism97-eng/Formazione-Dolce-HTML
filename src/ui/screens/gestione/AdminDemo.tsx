/**
 * Amministrazione › Strumenti demo (solo in modalità DEMO): esecuzione manuale dei flussi
 * pianificati, ripristino dei dati e account dimostrativi.
 */
import { useState } from 'react';
import type { StrumentiDemo } from '../../../data/api';
import { Avviso, Pulsante, Scheda, Tabella } from '../../components/ui';
import { useConferma } from '../../contesto';
import { useAzione } from '../../hooks';
import { ROTTE } from '../../router';

export function AdminDemo({ demo }: { demo: StrumentiDemo }) {
  const conferma = useConferma();
  const azione = useAzione();
  const [esito, setEsito] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<'promemoria' | 'riepilogo' | 'ripristino' | null>(null);

  const esegui = async (chi: 'promemoria' | 'riepilogo') => {
    setInCorso(chi);
    const n = await azione.prova(() => (chi === 'promemoria' ? demo.eseguiPromemoria() : demo.eseguiRiepilogoMensile()));
    setInCorso(null);
    if (n === undefined) return;
    setEsito(
      chi === 'promemoria'
        ? n
          ? `Flusso 4 eseguito: ${n} ${n === 1 ? 'notifica inviata' : 'notifiche inviate'} (promemoria ai coordinatori e segnalazioni a HR).`
          : 'Flusso 4 eseguito: nessun nuovo promemoria da inviare (quelli di oggi sono già stati inviati).'
        : `Flusso 5 eseguito: ${n} ${n === 1 ? 'e-mail di riepilogo generata' : 'e-mail di riepilogo generate'} (una per coordinatore e il quadro completo per HR).`,
    );
  };

  const ripristina = async () => {
    const ok = await conferma({
      titolo: 'Ripristinare i dati dimostrativi?',
      pericolo: true,
      etichettaConferma: 'Ripristina',
      testo: 'Tutte le modifiche fatte nella demo (richieste, decisioni, chiusure, anagrafiche, allegati caricati) andranno perse e l’app verrà ricaricata.',
    });
    if (!ok) return;
    setInCorso('ripristino');
    const fatto = await azione.prova(async () => {
      await demo.ripristina();
      return true;
    });
    if (fatto) window.location.reload();
    else setInCorso(null);
  };

  return (
    <div className="pagina">
      <Avviso tono="avviso" titolo="Solo modalità DEMO">
        Questi strumenti simulano ciò che in produzione fanno i flussi pianificati sul server. Le e-mail non vengono inviate: compaiono nella{' '}
        <a href={`#${ROTTE.posta}`}>Posta simulata</a>.
      </Avviso>
      {esito && (
        <Avviso tono="successo">
          {esito} <a href={`#${ROTTE.posta}`}>Apri la posta simulata</a>
        </Avviso>
      )}
      <div className="strumenti-demo">
        <div className="strumento">
          <strong>Promemoria (Flusso 4)</strong>
          <p>Promemoria ai coordinatori dopo 3 e 5 giorni lavorativi senza approvazione; dopo 7 la richiesta è segnalata anche a HR. Di norma gira ogni giorno lavorativo.</p>
          <Pulsante icona="orologio" inCorso={inCorso === 'promemoria'} disabled={!!inCorso} onClick={() => void esegui('promemoria')}>
            Esegui ora i promemoria (Flusso 4)
          </Pulsante>
        </div>
        <div className="strumento">
          <strong>Riepilogo mensile (Flusso 5)</strong>
          <p>Invia a ogni coordinatore il riepilogo del mese precedente del proprio gruppo e a HR il quadro completo, con richieste aperte, respinte o incomplete.</p>
          <Pulsante icona="posta" inCorso={inCorso === 'riepilogo'} disabled={!!inCorso} onClick={() => void esegui('riepilogo')}>
            Invia il riepilogo mensile (Flusso 5)
          </Pulsante>
        </div>
        <div className="strumento">
          <strong>Dati dimostrativi</strong>
          <p>Riporta la demo allo stato iniziale: organigramma, catalogo e circa quattro mesi di richieste in tutti gli stati.</p>
          <Pulsante variante="pericolo" icona="aggiorna" inCorso={inCorso === 'ripristino'} disabled={!!inCorso} onClick={() => void ripristina()}>
            Ripristina i dati dimostrativi
          </Pulsante>
        </div>
      </div>

      <Scheda titolo="Account dimostrativi" icona="utente">
        <div className="account-elenco">
          <Tabella
            didascalia="Account dimostrativi"
            righe={demo.account}
            chiave={(a) => a.login}
            colonne={[
              { titolo: 'Ruolo', valore: (a) => <span className="cella-principale">{a.ruolo}</span> },
              { titolo: 'Login', valore: (a) => <code className="testo-a-capo">{a.login}</code> },
              { titolo: 'Password', valore: (a) => <code>{a.password}</code> },
              { titolo: 'Descrizione', valore: (a) => <span className="testo-a-capo">{a.descrizione}</span>, secondaria: true },
            ]}
          />
        </div>
        <p className="testo-secondario testo-piccolo" style={{ marginBottom: 0 }}>
          Per cambiare utente esci e scegli un altro account nella pagina di accesso.
        </p>
      </Scheda>
    </div>
  );
}
