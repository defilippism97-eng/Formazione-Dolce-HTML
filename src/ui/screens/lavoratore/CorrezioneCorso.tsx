/**
 * Correzione di titolo e dati di un corso esterno (non a catalogo) inserito dal lavoratore.
 * La possono fare il coordinatore della richiesta e l'Ufficio HR/Formazione, prima di decidere.
 * I controlli vincolanti sono sul server (`correggiCorso`): qui servono ai messaggi immediati.
 */
import { useRef, useState } from 'react';
import { MODALITA, titoloRichiesta, validaCorrezioneCorso, type ErroreValidazione, type Modalita, type Richiesta } from '../../../domain';
import { Avviso, CampoSelezione, CampoTesto, Dialogo, Pulsante } from '../../components/ui';
import { useApp } from '../../contesto';
import { parseNumero } from '../../format';
import { useAzione } from '../../hooks';
import { focusPrimoErrore, testoNumero } from './comuni';

export function DialogoCorrezioneCorso({
  richiesta: r,
  nomeEnte,
  onChiudi,
  onFatto,
}: {
  richiesta: Richiesta;
  /** Nome dell'ente organizzatore oggi registrato sul corso; `undefined` se non è noto a chi corregge. */
  nomeEnte: string | undefined;
  onChiudi: () => void;
  onFatto: () => void | Promise<void>;
}) {
  const { backend } = useApp();
  const azione = useAzione();
  const rif = useRef<HTMLFormElement>(null);
  const [titolo, setTitolo] = useState(() => titoloRichiesta(r));
  const [ente, setEnte] = useState(nomeEnte ?? '');
  const [modalita, setModalita] = useState<Modalita | ''>(r.modalita ?? '');
  const [durata, setDurata] = useState(() => testoNumero(r.durataCorso));
  const [piuGiornate, setPiuGiornate] = useState<'si' | 'no'>(r.piuGiornate ? 'si' : 'no');
  const [tentato, setTentato] = useState(false);

  const dati = { titolo: titolo.trim(), nomeEnte: ente.trim() || undefined, modalita: modalita as Modalita, durataOre: parseNumero(durata), piuGiornate: piuGiornate === 'si' };
  // la durata non può scendere sotto le ore di sessione già dichiarate: qui si conosce almeno questa sessione
  const errori: ErroreValidazione[] = tentato ? validaCorrezioneCorso(dati, r.durataSessione) : [];
  const erroreDi = (campo: string) => errori.find((e) => e.campo === campo)?.messaggio ?? azione.erroreDi(campo);

  const salva = async () => {
    setTentato(true);
    if (validaCorrezioneCorso(dati, r.durataSessione).length) {
      focusPrimoErrore(rif.current);
      return;
    }
    const fatto = await azione.prova(() => backend.correggiCorso(r.id, dati), 'Dati del corso corretti.');
    if (!fatto) {
      focusPrimoErrore(rif.current);
      return;
    }
    await onFatto();
    onChiudi();
  };

  return (
    <Dialogo
      titolo="Correggi dati del corso"
      onChiudi={onChiudi}
      largo
      piede={
        <>
          <Pulsante variante="secondario" disabled={azione.inCorso} onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante icona="salva" inCorso={azione.inCorso} onClick={() => void salva()}>
            Salva la correzione
          </Pulsante>
        </>
      }
    >
      <form
        ref={rif}
        noValidate
        className="modulo-correzione"
        onSubmit={(e) => {
          e.preventDefault();
          void salva();
        }}
      >
        <p className="testo-secondario">
          Corso esterno <strong>{r.codiceCorso}</strong> inserito da {r.nome} {r.cognome}. Correggi il titolo o i dati se non sono precisi (ad esempio un titolo
          incompleto o una durata sbagliata).
        </p>
        <div className="griglia griglia-2">
          <CampoTesto etichetta="Titolo del corso" className="span-2" obbligatorio maxLength={200} value={titolo} onChange={(e) => setTitolo(e.target.value)} errore={erroreDi('titolo')} />
          <CampoTesto
            etichetta="Ente che ha organizzato il corso"
            maxLength={200}
            placeholder="Es. AUSL di Bologna"
            value={ente}
            onChange={(e) => setEnte(e.target.value)}
            aiuto={nomeEnte === undefined ? 'Scrivi qui il nome dell’ente: viene salvato insieme alle altre correzioni.' : undefined}
          />
          <CampoSelezione
            etichetta="Modalità di svolgimento"
            obbligatorio
            value={modalita}
            onChange={(e) => setModalita(e.target.value as Modalita | '')}
            vuota="Seleziona…"
            opzioni={MODALITA.map((x) => ({ valore: x, etichetta: x }))}
            errore={erroreDi('modalita')}
          />
          <CampoTesto
            etichetta="Durata complessiva del corso (ore)"
            obbligatorio
            inputMode="decimal"
            autoComplete="off"
            value={durata}
            onChange={(e) => setDurata(e.target.value)}
            errore={erroreDi('durataOre')}
            aiuto="Tutte le giornate del corso: non può essere inferiore alle ore di sessione già dichiarate."
          />
          <CampoSelezione
            etichetta="Previste più giornate formative?"
            value={piuGiornate}
            onChange={(e) => setPiuGiornate(e.target.value === 'si' ? 'si' : 'no')}
            opzioni={[
              { valore: 'si', etichetta: 'Sì' },
              { valore: 'no', etichetta: 'No' },
            ]}
          />
        </div>
        <Avviso tono="info">
          La correzione vale anche per le altre richieste aperte di {r.nome} {r.cognome} per lo stesso corso (quelle non ancora validate dall’Ufficio HR/Formazione) e viene
          registrata nello storico delle modifiche. Orari e ore della richiesta non cambiano.
        </Avviso>
      </form>
    </Dialogo>
  );
}
