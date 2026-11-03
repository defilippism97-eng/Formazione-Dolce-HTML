/**
 * Amministrazione (solo amministratori): lavoratori, organigramma, catalogo corsi, utenti e ruoli,
 * registro delle modifiche e, in modalità DEMO, strumenti dimostrativi.
 * La scheda attiva è nell'indirizzo (#/amministrazione/<sezione>): si può aggiungere ai preferiti
 * e il pulsante "Indietro" del browser funziona.
 */
import { useEffect } from 'react';
import { Caricamento, ErroreCaricamento, Pagina, Schede } from '../components/ui';
import { useApp } from '../contesto';
import { useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';
import { AdminCatalogo } from './gestione/AdminCatalogo';
import { AdminDemo } from './gestione/AdminDemo';
import { AdminLavoratori } from './gestione/AdminLavoratori';
import { AdminOrganigramma } from './gestione/AdminOrganigramma';
import { AdminRegistro } from './gestione/AdminRegistro';
import { AdminRuoli } from './gestione/AdminRuoli';
import '../../styles/gestione.css';

type SezioneAdmin = 'lavoratori' | 'organigramma' | 'catalogo' | 'ruoli' | 'registro' | 'demo';

const DESCRIZIONI: Record<SezioneAdmin, string> = {
  lavoratori: 'Anagrafica dei lavoratori, assegnazione alla struttura e al coordinatore, segnalazioni di variazione.',
  organigramma: 'Aree, servizi e centri di costo con i rispettivi coordinatori.',
  catalogo: 'Corsi a catalogo e validazione dei corsi esterni inseriti dai lavoratori.',
  ruoli: 'Ruoli Formazione HR e Amministratore; elenco dei coordinatori dall’organigramma.',
  registro: 'Storico di tutte le variazioni effettuate da coordinatori, HR, amministratori e dal sistema.',
  demo: 'Strumenti della modalità dimostrativa.',
};

export function Amministrazione({ sezione }: { sezione: string }) {
  const { backend } = useApp();
  const voci: { id: SezioneAdmin; etichetta: string }[] = [
    { id: 'lavoratori', etichetta: 'Lavoratori' },
    { id: 'organigramma', etichetta: 'Organigramma' },
    { id: 'catalogo', etichetta: 'Catalogo corsi' },
    { id: 'ruoli', etichetta: 'Utenti e ruoli' },
    { id: 'registro', etichetta: 'Registro modifiche' },
    ...(backend.demo ? [{ id: 'demo' as const, etichetta: 'Strumenti demo' }] : []),
  ];
  const valida = voci.some((v) => v.id === sezione);
  const attiva: SezioneAdmin = valida ? (sezione as SezioneAdmin) : 'lavoratori';

  // sezione sconosciuta nell'indirizzo: si torna alla prima scheda
  useEffect(() => {
    if (!valida) naviga(ROTTE.amministrazione('lavoratori'));
  }, [valida]);

  const anagrafiche = useCarica(() => backend.getAnagrafiche(), [backend]);
  const servonoAnagrafiche = attiva !== 'demo';

  return (
    <Pagina titolo="Amministrazione" sottotitolo={DESCRIZIONI[attiva]}>
      <Schede<SezioneAdmin> voci={voci} attiva={attiva} onCambia={(id) => naviga(ROTTE.amministrazione(id))} />
      <div className="gestione-pannello" role="tabpanel" aria-label={voci.find((v) => v.id === attiva)?.etichetta}>
        {attiva === 'demo' ? (
          backend.demo && <AdminDemo demo={backend.demo} />
        ) : servonoAnagrafiche && anagrafiche.errore ? (
          <ErroreCaricamento messaggio={anagrafiche.errore} onRiprova={anagrafiche.ricarica} />
        ) : !anagrafiche.dati ? (
          <Caricamento />
        ) : attiva === 'lavoratori' ? (
          <AdminLavoratori anagrafiche={anagrafiche.dati} ricarica={anagrafiche.ricarica} />
        ) : attiva === 'organigramma' ? (
          <AdminOrganigramma anagrafiche={anagrafiche.dati} ricarica={anagrafiche.ricarica} />
        ) : attiva === 'catalogo' ? (
          <AdminCatalogo anagrafiche={anagrafiche.dati} ricarica={anagrafiche.ricarica} />
        ) : attiva === 'ruoli' ? (
          <AdminRuoli anagrafiche={anagrafiche.dati} ricarica={anagrafiche.ricarica} />
        ) : (
          <AdminRegistro utenti={anagrafiche.dati.utenti} />
        )}
      </div>
    </Pagina>
  );
}
