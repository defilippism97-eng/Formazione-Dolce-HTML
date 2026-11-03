/**
 * Amministrazione › Utenti e ruoli: assegnazione dei ruoli Formazione HR e Amministratore.
 * Il ruolo di coordinatore non si assegna qui: deriva dall'organigramma.
 */
import { useCallback, useMemo, useState } from 'react';
import { ETICHETTA_RUOLO, type AssegnazioneRuolo } from '../../../domain';
import { Avviso, CampoSelezione, Casella, Dialogo, Etichetta, Griglia, Pulsante, Scheda, Tabella } from '../../components/ui';
import { useApp, useConferma } from '../../contesto';
import { useAzione } from '../../hooks';
import { naviga, ROTTE } from '../../router';
import { nomeUtente } from './comuni';
import { SceltaUtente, type PropsSezione } from './admin-comuni';

export function AdminRuoli({ anagrafiche, ricarica }: PropsSezione) {
  const { backend, sessione } = useApp();
  const conferma = useConferma();
  const azione = useAzione();
  const { ruoli, utenti, lavoratori, strutture } = anagrafiche;
  const [assegna, setAssegna] = useState(false);
  const chiudi = useCallback(() => setAssegna(false), []);

  const righe = useMemo(
    () => [...ruoli].sort((a, b) => a.ruolo.localeCompare(b.ruolo) || nomeUtente(utenti, a.login).localeCompare(nomeUtente(utenti, b.login), 'it')),
    [ruoli, utenti],
  );

  const coordinatori = useMemo(() => {
    const logins = new Set<string>();
    lavoratori.forEach((l) => l.stato === 'Attivo' && l.coordinatoreLogin && logins.add(l.coordinatoreLogin));
    strutture.forEach((s) => s.attiva && s.coordinatoreServizioLogin && logins.add(s.coordinatoreServizioLogin));
    return [...logins]
      .map((login) => ({
        login,
        nome: nomeUtente(utenti, login),
        lavoratori: lavoratori.filter((l) => l.stato === 'Attivo' && l.coordinatoreLogin === login).length,
        servizi: strutture.filter((s) => s.attiva && s.coordinatoreServizioLogin === login).map((s) => s.servizio),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }, [lavoratori, strutture, utenti]);

  const cambiaAttivo = async (r: AssegnazioneRuolo) => {
    if (r.attivo) {
      const proprio = r.login === sessione.login;
      const ok = await conferma({
        titolo: `Disattivare il ruolo ${ETICHETTA_RUOLO[r.ruolo]}?`,
        pericolo: true,
        etichettaConferma: 'Disattiva',
        testo: `${nomeUtente(utenti, r.login)} perderà l’accesso alle funzioni di ${ETICHETTA_RUOLO[r.ruolo]}.${
          proprio ? '\nAttenzione: è il tuo ruolo, perderai subito l’accesso a queste funzioni.' : ''
        }`,
      });
      if (!ok) return;
    }
    const salvato = await azione.prova(() => backend.salvaRuolo({ ...r, attivo: !r.attivo }), r.attivo ? 'Ruolo disattivato.' : 'Ruolo riattivato.');
    if (!salvato) return;
    // chi ha appena rinunciato al proprio ruolo di amministratore non può più restare qui
    if (r.attivo && r.login === sessione.login && r.ruolo === 'admin') {
      naviga(ROTTE.home);
      window.location.reload();
      return;
    }
    await ricarica();
  };

  return (
    <div className="pagina">
      <Avviso tono="info" titolo="Come si assegnano i ruoli">
        <ul className="elenco-compatto">
          <li>
            <strong>Lavoratore</strong>: chi è censito come lavoratore attivo (scheda «Lavoratori»).
          </li>
          <li>
            <strong>Coordinatore</strong>: deriva dall’organigramma, cioè dall’associazione dei lavoratori a un coordinatore (scheda «Lavoratori») e dal coordinatore
            del servizio (scheda «Organigramma»). Non si assegna qui.
          </li>
          <li>
            <strong>Formazione HR</strong> e <strong>Amministratore</strong>: si assegnano in questa pagina. Deve restare sempre almeno un amministratore attivo.
          </li>
        </ul>
      </Avviso>

      <Scheda
        titolo="Ruoli Formazione HR e Amministratore"
        icona="utente"
        azioni={
          <Pulsante icona="aggiungi" piccolo onClick={() => setAssegna(true)}>
            Assegna ruolo
          </Pulsante>
        }
      >
        <Tabella
          didascalia="Ruoli assegnati"
          righe={righe}
          chiave={(r) => r.id}
          vuoto="Nessun ruolo assegnato."
          colonne={[
            { titolo: 'Utente', valore: (r) => <span className="cella-principale">{nomeUtente(utenti, r.login)}</span> },
            { titolo: 'Login', valore: (r) => <span className="testo-a-capo">{r.login}</span>, secondaria: true },
            { titolo: 'Ruolo', valore: (r) => <Etichetta tono={r.ruolo === 'admin' ? 'pericolo' : 'info'}>{ETICHETTA_RUOLO[r.ruolo]}</Etichetta> },
            { titolo: 'Stato', valore: (r) => <Etichetta tono={r.attivo ? 'successo' : 'neutro'}>{r.attivo ? 'Attivo' : 'Non attivo'}</Etichetta> },
          ]}
          azioni={(r) => (
            <Pulsante variante={r.attivo ? 'secondario' : 'successo'} piccolo disabled={azione.inCorso} onClick={() => void cambiaAttivo(r)} aria-label={`${r.attivo ? 'Disattiva' : 'Riattiva'} ${ETICHETTA_RUOLO[r.ruolo]} per ${nomeUtente(utenti, r.login)}`}>
              {r.attivo ? 'Disattiva' : 'Riattiva'}
            </Pulsante>
          )}
        />
      </Scheda>

      <Scheda titolo={`Coordinatori (dall’organigramma): ${coordinatori.length}`} icona="team">
        <Tabella
          didascalia="Coordinatori derivati dall’organigramma"
          righe={coordinatori}
          chiave={(c) => c.login}
          vuoto="Nessun coordinatore nell’organigramma."
          colonne={[
            { titolo: 'Coordinatore', valore: (c) => <span className="cella-principale">{c.nome}</span> },
            { titolo: 'Login', valore: (c) => <span className="testo-a-capo">{c.login}</span>, secondaria: true },
            { titolo: 'Lavoratori assegnati', valore: (c) => c.lavoratori, numerica: true },
            { titolo: 'Coordinatore del servizio', valore: (c) => <span className="testo-a-capo">{c.servizi.length ? c.servizi.join(', ') : '—'}</span> },
          ]}
        />
      </Scheda>

      {assegna && <DialogoRuolo anagrafiche={anagrafiche} ricarica={ricarica} onChiudi={chiudi} />}
    </div>
  );
}

function DialogoRuolo({ anagrafiche, ricarica, onChiudi }: PropsSezione & { onChiudi: () => void }) {
  const { backend } = useApp();
  const azione = useAzione();
  const [login, setLogin] = useState('');
  const [ruolo, setRuolo] = useState<AssegnazioneRuolo['ruolo']>('hr');
  const [attivo, setAttivo] = useState(true);
  const esistente = anagrafiche.ruoli.find((r) => r.login === login && r.ruolo === ruolo);
  const etichettaRuoli = useCallback(
    (u: { login: string }) => {
      const r = anagrafiche.ruoli.filter((x) => x.login === u.login && x.attivo).map((x) => ETICHETTA_RUOLO[x.ruolo]);
      return r.length ? r.join(', ') : undefined;
    },
    [anagrafiche.ruoli],
  );

  const salva = async () => {
    // se l'assegnazione esiste già, si aggiorna (es. riattivazione) invece di duplicarla
    const r = await azione.prova(() => backend.salvaRuolo({ id: esistente?.id, login, ruolo, attivo }), 'Ruolo assegnato.');
    if (r) {
      onChiudi();
      await ricarica();
    }
  };

  return (
    <Dialogo
      titolo="Assegna un ruolo"
      largo
      onChiudi={onChiudi}
      piede={
        <>
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante icona="salva" inCorso={azione.inCorso} disabled={!login} onClick={() => void salva()}>
            Assegna
          </Pulsante>
        </>
      }
    >
      <Griglia colonne={2}>
        <SceltaUtente etichetta="Utente" utenti={anagrafiche.utenti} valore={login} onCambia={setLogin} errore={azione.erroreDi('login')} obbligatorio etichettaUtente={etichettaRuoli} />
        <CampoSelezione
          etichetta="Ruolo"
          value={ruolo}
          onChange={(e) => setRuolo(e.target.value as AssegnazioneRuolo['ruolo'])}
          opzioni={[
            { valore: 'hr', etichetta: ETICHETTA_RUOLO.hr },
            { valore: 'admin', etichetta: ETICHETTA_RUOLO.admin },
          ]}
          obbligatorio
        />
        <div className="campo" style={{ justifyContent: 'flex-end' }}>
          <Casella etichetta="Ruolo attivo" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />
        </div>
      </Griglia>
      {esistente && (
        <Avviso tono="info">
          L’utente ha già il ruolo {ETICHETTA_RUOLO[ruolo]} ({esistente.attivo ? 'attivo' : 'non attivo'}): l’assegnazione esistente sarà aggiornata.
        </Avviso>
      )}
    </Dialogo>
  );
}
