/**
 * Amministrazione › Organigramma: aree, servizi e centri di costo (strutture) con i coordinatori.
 */
import { useCallback, useMemo, useState } from 'react';
import { AREE, type Area, type Struttura } from '../../../domain';
import { Avviso, CampoSelezione, CampoTesto, Casella, Dialogo, Etichetta, Griglia, Pulsante, PulsanteIcona, Tabella } from '../../components/ui';
import { useApp } from '../../contesto';
import * as f from '../../format';
import { useAzione } from '../../hooks';
import { nomeUtente } from './comuni';
import { opzioniUtenti, vuotoInNullo, type PropsSezione } from './admin-comuni';

interface ModuloStruttura {
  id?: string;
  area: Area;
  servizio: string;
  centroDiCosto: string;
  coordinatoreResponsabileLogin: string;
  coordinatoreServizioLogin: string;
  dataInizioValidita: string;
  dataFineValidita: string;
  attiva: boolean;
}

function daStruttura(s?: Struttura): ModuloStruttura {
  return {
    id: s?.id,
    area: s?.area ?? AREE[0],
    servizio: s?.servizio ?? '',
    centroDiCosto: s?.centroDiCosto ?? '',
    coordinatoreResponsabileLogin: s?.coordinatoreResponsabileLogin ?? '',
    coordinatoreServizioLogin: s?.coordinatoreServizioLogin ?? '',
    dataInizioValidita: s?.dataInizioValidita ?? '',
    dataFineValidita: s?.dataFineValidita ?? '',
    attiva: s?.attiva ?? true,
  };
}

export function AdminOrganigramma({ anagrafiche, ricarica }: PropsSezione) {
  const { strutture, lavoratori, utenti } = anagrafiche;
  const [inModifica, setInModifica] = useState<Struttura | 'nuova' | null>(null);
  const chiudi = useCallback(() => setInModifica(null), []);

  const lavoratoriAttivi = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lavoratori) if (l.stato === 'Attivo') m.set(l.strutturaId, (m.get(l.strutturaId) ?? 0) + 1);
    return m;
  }, [lavoratori]);

  const perArea = useMemo(() => {
    const aree = [...new Set<string>([...AREE, ...strutture.map((s) => s.area)])];
    return aree
      .map((area) => ({
        area,
        strutture: strutture.filter((s) => s.area === area).sort((a, b) => Number(b.attiva) - Number(a.attiva) || a.servizio.localeCompare(b.servizio, 'it')),
      }))
      .filter((g) => g.strutture.length > 0);
  }, [strutture]);

  return (
    <div className="pagina">
      <div className="riga-flessibile">
        <p className="testo-secondario" style={{ margin: 0, flex: '1 1 320px' }}>
          Qui si gestiscono <strong>aree, servizi e centri di costo</strong>: ogni struttura collega un servizio al suo centro di costo, all’area e ai
          coordinatori. Le aree disponibili sono: {AREE.join(', ')}.
        </p>
        <Pulsante icona="aggiungi" onClick={() => setInModifica('nuova')}>
          Nuova struttura
        </Pulsante>
      </div>

      {perArea.map((g) => (
        <section key={g.area} className="sezione-area" aria-label={g.area}>
          <h3>
            {g.area} <Etichetta tono="neutro">{g.strutture.length}</Etichetta>
          </h3>
          <div className="gestione-tabella tabella-compatta">
            <Tabella
              didascalia={`Strutture dell’${g.area}`}
              righe={g.strutture}
              chiave={(s) => s.id}
              onApri={(s) => setInModifica(s)}
              colonne={[
                { titolo: 'Servizio', valore: (s) => <span className="cella-principale testo-a-capo">{s.servizio}</span> },
                { titolo: 'Centro di costo', valore: (s) => s.centroDiCosto },
                { titolo: 'Coordinatore responsabile', valore: (s) => nomeUtente(utenti, s.coordinatoreResponsabileLogin), secondaria: true },
                { titolo: 'Coordinatore del servizio', valore: (s) => (s.coordinatoreServizioLogin ? nomeUtente(utenti, s.coordinatoreServizioLogin) : <Etichetta tono="avviso">Non assegnato</Etichetta>) },
                { titolo: 'Lavoratori attivi', valore: (s) => lavoratoriAttivi.get(s.id) ?? 0, numerica: true },
                {
                  titolo: 'Validità',
                  valore: (s) => (s.dataInizioValidita || s.dataFineValidita ? `${f.data(s.dataInizioValidita)} – ${s.dataFineValidita ? f.data(s.dataFineValidita) : 'in corso'}` : '—'),
                  secondaria: true,
                },
                { titolo: 'Attiva', valore: (s) => <Etichetta tono={s.attiva ? 'successo' : 'neutro'}>{s.attiva ? 'Sì' : 'No'}</Etichetta> },
              ]}
              azioni={(s) => <PulsanteIcona icona="modifica" etichetta={`Modifica ${s.servizio}`} onClick={() => setInModifica(s)} />}
            />
          </div>
        </section>
      ))}

      {inModifica && (
        <DialogoStruttura
          struttura={inModifica === 'nuova' ? undefined : inModifica}
          anagrafiche={anagrafiche}
          ricarica={ricarica}
          onChiudi={chiudi}
          lavoratoriAttivi={inModifica === 'nuova' ? 0 : lavoratoriAttivi.get(inModifica.id) ?? 0}
        />
      )}
    </div>
  );
}

function DialogoStruttura({
  struttura,
  anagrafiche,
  ricarica,
  onChiudi,
  lavoratoriAttivi,
}: PropsSezione & { struttura?: Struttura; onChiudi: () => void; lavoratoriAttivi: number }) {
  const { backend } = useApp();
  const azione = useAzione();
  const [m, setM] = useState<ModuloStruttura>(() => daStruttura(struttura));
  const imposta = <K extends keyof ModuloStruttura>(k: K, v: ModuloStruttura[K]) => setM((x) => ({ ...x, [k]: v }));
  const utenti = opzioniUtenti(anagrafiche.utenti);
  const cambiaCoordinatore = !!struttura && (struttura.coordinatoreServizioLogin ?? '') !== m.coordinatoreServizioLogin && lavoratoriAttivi > 0;

  const salva = async () => {
    const r = await azione.prova(
      () =>
        backend.salvaStruttura({
          id: m.id,
          area: m.area,
          servizio: m.servizio.trim(),
          centroDiCosto: m.centroDiCosto.trim(),
          coordinatoreResponsabileLogin: vuotoInNullo(m.coordinatoreResponsabileLogin),
          coordinatoreServizioLogin: vuotoInNullo(m.coordinatoreServizioLogin),
          dataInizioValidita: vuotoInNullo(m.dataInizioValidita),
          dataFineValidita: vuotoInNullo(m.dataFineValidita),
          attiva: m.attiva,
        }),
      struttura ? 'Struttura aggiornata.' : 'Struttura creata.',
    );
    if (r) {
      onChiudi();
      await ricarica();
    }
  };

  return (
    <Dialogo
      titolo={struttura ? `Modifica ${struttura.servizio}` : 'Nuova struttura'}
      largo
      onChiudi={onChiudi}
      piede={
        <>
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante icona="salva" inCorso={azione.inCorso} onClick={() => void salva()}>
            Salva
          </Pulsante>
        </>
      }
    >
      <Griglia colonne={2}>
        <CampoSelezione etichetta="Area" value={m.area} onChange={(e) => imposta('area', e.target.value as Area)} opzioni={AREE.map((a) => ({ valore: a, etichetta: a }))} obbligatorio />
        <CampoTesto etichetta="Servizio" value={m.servizio} onChange={(e) => imposta('servizio', e.target.value)} obbligatorio errore={azione.erroreDi('servizio')} autoComplete="off" />
        <CampoTesto
          etichetta="Centro di costo"
          value={m.centroDiCosto}
          onChange={(e) => imposta('centroDiCosto', e.target.value.toUpperCase())}
          obbligatorio
          errore={azione.erroreDi('centroDiCosto')}
          aiuto="Codice univoco, es. ED-NID-01."
          autoComplete="off"
        />
        <CampoSelezione
          etichetta="Coordinatore responsabile"
          value={m.coordinatoreResponsabileLogin}
          onChange={(e) => imposta('coordinatoreResponsabileLogin', e.target.value)}
          vuota="Nessuno"
          opzioni={utenti}
        />
        <CampoSelezione
          etichetta="Coordinatore del servizio"
          value={m.coordinatoreServizioLogin}
          onChange={(e) => imposta('coordinatoreServizioLogin', e.target.value)}
          vuota="Nessuno"
          opzioni={utenti}
          aiuto="Proposto come coordinatore ai nuovi lavoratori della struttura."
        />
        <div className="campo" style={{ justifyContent: 'flex-end' }}>
          <Casella etichetta="Struttura attiva" checked={m.attiva} onChange={(e) => imposta('attiva', e.target.checked)} />
        </div>
        <CampoTesto etichetta="Data inizio validità" type="date" value={m.dataInizioValidita} onChange={(e) => imposta('dataInizioValidita', e.target.value)} />
        <CampoTesto
          etichetta="Data fine validità"
          type="date"
          value={m.dataFineValidita}
          onChange={(e) => imposta('dataFineValidita', e.target.value)}
          errore={azione.erroreDi('dataFineValidita')}
        />
      </Griglia>
      {cambiaCoordinatore && (
        <Avviso tono="info" titolo="Lavoratori già assegnati">
          Il cambio del coordinatore del servizio non riassegna automaticamente i {lavoratoriAttivi} lavoratori attivi della struttura: aggiorna il coordinatore di
          ciascuno nella scheda «Lavoratori» (le loro richieste aperte passeranno al nuovo coordinatore).
        </Avviso>
      )}
      {!m.attiva && struttura?.attiva && lavoratoriAttivi > 0 && (
        <Avviso tono="avviso">La struttura ha ancora {lavoratoriAttivi} lavoratori attivi: assegnali a un’altra struttura prima di disattivarla.</Avviso>
      )}
    </Dialogo>
  );
}
