/**
 * Schermata 1 – Home page: contenuto diverso per ruolo.
 */
import { APERTI, DEFINITIVI, ETICHETTA_RUOLO, IN_ATTESA_COORDINATORE, IN_ATTESA_HR, calcolaKPI, ruoloPrincipale, type Richiesta } from '../../domain';
import { Icona, type NomeIcona } from '../components/Icona';
import { Avviso, BadgeStato, Caricamento, ErroreCaricamento, Indicatore, Pagina, Scheda, Tabella } from '../components/ui';
import { useApp } from '../contesto';
import * as f from '../format';
import { useCarica } from '../hooks';
import { naviga, ROTTE } from '../router';

function Riquadro({ icona, titolo, testo, percorso, principale, valore }: { icona: NomeIcona; titolo: string; testo: string; percorso: string; principale?: boolean; valore?: number }) {
  return (
    <a className={`riquadro${principale ? ' riquadro-principale' : ''}`} href={`#${percorso}`}>
      <span className="riquadro-icona">
        <Icona nome={icona} />
      </span>
      {valore !== undefined && <span className="numero-grande">{valore}</span>}
      <strong>{titolo}</strong>
      <span>{testo}</span>
    </a>
  );
}

export function Home() {
  const { sessione, ha, backend } = useApp();
  const anno = new Date().getFullYear();
  const dati = useCarica(async () => {
    const [mie, team, tutte] = await Promise.all([
      ha('lavoratore') ? backend.getMieRichieste() : Promise.resolve([] as Richiesta[]),
      ha('coordinatore') ? backend.getRichieste('team') : Promise.resolve([] as Richiesta[]),
      ha('hr') || ha('admin') ? backend.getRichieste('tutte') : Promise.resolve([] as Richiesta[]),
    ]);
    return { mie, team, tutte };
  }, [backend, sessione.login]);

  const principale = ruoloPrincipale(sessione);
  return (
    <Pagina
      titolo={`Ciao ${sessione.nome}`}
      sottotitolo={
        <>
          Ruolo nell’applicativo: <strong>{principale ? ETICHETTA_RUOLO[principale] : '—'}</strong>
          {sessione.ruoli.length > 1 && ` (anche ${sessione.ruoli.filter((r) => r !== principale).map((r) => ETICHETTA_RUOLO[r]).join(', ')})`}
        </>
      }
    >
      {dati.errore && <ErroreCaricamento messaggio={dati.errore} onRiprova={dati.ricarica} />}
      {dati.caricamento && !dati.dati ? (
        <Caricamento />
      ) : (
        dati.dati && (
          <>
            {(ha('coordinatore') || ha('hr') || ha('admin')) && <SezioneGestione team={dati.dati.team} tutte={dati.dati.tutte} />}
            {ha('lavoratore') && <SezioneLavoratore mie={dati.dati.mie} anno={anno} />}
            <Scheda titolo="Collegamenti rapidi" icona="home">
              <div className="riquadri">
                {ha('lavoratore') && <Riquadro icona="aggiungi" titolo="Inserisci formazione" testo="Nuova richiesta di riconoscimento" percorso={ROTTE.nuovaRichiesta} principale />}
                {(ha('coordinatore') || ha('hr') || ha('admin')) && <Riquadro icona="grafico" titolo="Reportistica" testo="Riepilogo mensile e indicatori" percorso={ROTTE.riepilogo} />}
                {(ha('hr') || ha('admin')) && <Riquadro icona="calendario" titolo="Generazione file payroll" testo="Chiusura del mese e file per l’Ufficio Paghe" percorso={ROTTE.chiusura} />}
                {ha('admin') && <Riquadro icona="impostazioni" titolo="Amministrazione" testo="Organigramma, catalogo, utenti e ruoli" percorso={ROTTE.amministrazione()} />}
                <Riquadro icona="posta" titolo={backend.modalita === 'demo' ? 'Posta (simulata)' : 'Notifiche'} testo="Le e-mail inviate dall’app a te" percorso={ROTTE.posta} />
              </div>
            </Scheda>
          </>
        )
      )}
    </Pagina>
  );
}

function SezioneLavoratore({ mie, anno }: { mie: Richiesta[]; anno: number }) {
  const daCorreggere = mie.filter((r) => r.stato === 'Integrazione richiesta dal coordinatore' || r.stato === 'Integrazione richiesta da HR');
  const inAttesa = mie.filter((r) => APERTI.has(r.stato) && r.stato !== 'Bozza');
  const approvate = mie.filter((r) => DEFINITIVI.has(r.stato));
  const bozze = mie.filter((r) => r.stato === 'Bozza');
  const kpiAnno = calcolaKPI(mie.filter((r) => r.annoCompetenza === anno));
  return (
    <>
      {daCorreggere.length > 0 && (
        <Avviso tono="avviso" titolo={`Hai ${daCorreggere.length} ${daCorreggere.length === 1 ? 'richiesta da integrare' : 'richieste da integrare'}`}>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {daCorreggere.map((r) => (
              <li key={r.id}>
                <a href={`#${ROTTE.dettaglio(r.id)}`}>{r.numero}</a> – {r.titoloCorsoLibero || r.titoloCorso}: <em>{r.noteHR && r.stato === 'Integrazione richiesta da HR' ? r.noteHR : r.noteCoordinatore}</em>
              </li>
            ))}
          </ul>
        </Avviso>
      )}
      <Scheda titolo="La mia formazione" icona="lista">
        <div className="riquadri">
          <Riquadro icona="aggiungi" titolo="Inserisci formazione" testo="Compila una nuova richiesta" percorso={ROTTE.nuovaRichiesta} principale />
          <Riquadro icona="approva" titolo="Formazione approvata" testo="Ore validate da HR" percorso={`${ROTTE.mieRichieste}?gruppo=approvate`} valore={approvate.length} />
          <Riquadro icona="orologio" titolo="In attesa e integrazioni" testo="Richieste ancora in lavorazione" percorso={`${ROTTE.mieRichieste}?gruppo=aperte`} valore={inAttesa.length} />
          <Riquadro icona="salva" titolo="Bozze" testo="Richieste salvate e non inviate" percorso={`${ROTTE.mieRichieste}?gruppo=bozze`} valore={bozze.length} />
        </div>
      </Scheda>
      <Scheda titolo={`Riepilogo formazione ${anno}`} icona="grafico">
        <div className="indicatori">
          <Indicatore etichetta="Ore frequentate" valore={f.numero(kpiAnno.oreFrequentate)} />
          <Indicatore etichetta="Ore retribuite validate" valore={f.numero(kpiAnno.oreRetribuiteHR)} tono="successo" />
          <Indicatore etichetta="Ore gettone validate" valore={f.numero(kpiAnno.oreGettoneHR)} tono="successo" />
          <Indicatore etichetta="Richieste inviate" valore={kpiAnno.richieste} tono="info" />
        </div>
      </Scheda>
    </>
  );
}

function SezioneGestione({ team, tutte }: { team: Richiesta[]; tutte: Richiesta[] }) {
  const { ha } = useApp();
  const daApprovare = team.filter((r) => IN_ATTESA_COORDINATORE.has(r.stato));
  const daValidare = tutte.filter((r) => IN_ATTESA_HR.has(r.stato));
  const base = ha('hr') || ha('admin') ? tutte : team;
  const aperte = base.filter((r) => APERTI.has(r.stato));
  const integrazioni = base.filter((r) => r.stato === 'Integrazione richiesta dal coordinatore' || r.stato === 'Integrazione richiesta da HR');
  const solleciti = base.filter((r) => r.segnalataHR && r.stato === 'In attesa del coordinatore');
  const duplicati = base.filter((r) => r.possibileDuplicato && APERTI.has(r.stato));
  return (
    <>
      <div className="indicatori">
        {ha('coordinatore') && (
          <Indicatore etichetta="Da approvare" valore={daApprovare.length} nota="Richieste del tuo team" tono={daApprovare.length ? 'avviso' : 'successo'} onClick={() => naviga(`${ROTTE.team}?stato=attesa`)} />
        )}
        {(ha('hr') || ha('admin')) && <Indicatore etichetta="Da validare (HR)" valore={daValidare.length} nota="Approvate dai coordinatori" tono={daValidare.length ? 'avviso' : 'successo'} onClick={() => naviga(ROTTE.validazione)} />}
        <Indicatore etichetta="Richieste aperte" valore={aperte.length} nota={ha('hr') || ha('admin') ? 'In tutta l’organizzazione' : 'Nel tuo team'} tono="info" />
        <Indicatore etichetta="Integrazioni richieste" valore={integrazioni.length} nota="In attesa di correzione del lavoratore" tono={integrazioni.length ? 'avviso' : 'neutro'} />
        {solleciti.length > 0 && <Indicatore etichetta="Ferme da 7+ giorni" valore={solleciti.length} nota="Segnalate a HR" tono="pericolo" />}
        {duplicati.length > 0 && <Indicatore etichetta="Possibili duplicati" valore={duplicati.length} tono="pericolo" />}
      </div>
      {(integrazioni.length > 0 || solleciti.length > 0) && (
        <Scheda titolo="Messaggi" icona="avviso">
          <Tabella
            righe={[...solleciti, ...integrazioni].slice(0, 8)}
            chiave={(r) => r.id}
            onApri={(r) => naviga(ROTTE.dettaglio(r.id))}
            colonne={[
              { titolo: 'Richiesta', valore: (r) => <span className="cella-principale">{r.numero}</span> },
              { titolo: 'Lavoratore', valore: (r) => `${r.cognome} ${r.nome}` },
              { titolo: 'Messaggio', valore: (r) => (r.segnalataHR && r.stato === 'In attesa del coordinatore' ? `In attesa del coordinatore da ${r.giorniAttesa} giorni lavorativi` : r.stato === 'Integrazione richiesta da HR' ? r.noteHR : r.noteCoordinatore) },
              { titolo: 'Stato', valore: (r) => <BadgeStato stato={r.stato} />, secondaria: true },
            ]}
          />
        </Scheda>
      )}
    </>
  );
}
