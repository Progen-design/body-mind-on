/**
 * VLASTNÍ POLOŽKY NÁKUPNÍHO SEZNAMU.
 *
 * Prostý text, který si uživatel dopíše k vygenerovanému seznamu — drogerie,
 * koření, co doma zrovna došlo. Text se nijak neparsuje ani nemapuje na
 * suroviny katalogu: kdybychom se o to pokusili, tiše bychom měnili, co si
 * napsal.
 *
 * Položky se vážou k plánu, ne k jednomu dni — nakupuje se na celý týden.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PANEL, TLACITKO, TLACITKO_HLAVNI } from '../../lib/profile/designTokens.js';
import { overPolozkuNakupu } from '../../lib/profile/vlastniJidlo.js';

export default function VlastniPolozkyNakupu({ planId = null }) {
  const [polozky, setPolozky] = useState([]);
  const [text, setText] = useState('');
  const [chyba, setChyba] = useState(null);
  const [uklada, setUklada] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let zive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (zive) setToken(data?.session?.access_token || null);
    });
    return () => { zive = false; };
  }, []);

  const nacti = useCallback(async () => {
    if (!token) return;
    try {
      const url = planId ? `/api/shopping-extras?plan_id=${encodeURIComponent(planId)}` : '/api/shopping-extras';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      setPolozky(Array.isArray(json?.items) ? json.items : []);
    } catch {
      /* Seznam zůstane bez ručních položek — vygenerovaná část funguje dál. */
    }
  }, [token, planId]);

  useEffect(() => { nacti(); }, [nacti]);

  const pridej = useCallback(async (e) => {
    e.preventDefault();
    setChyba(null);
    const kontrola = overPolozkuNakupu(text);
    if (!kontrola.ok) { setChyba(kontrola.chyba); return; }
    if (!token) { setChyba('Nejsi přihlášený.'); return; }

    setUklada(true);
    try {
      const res = await fetch('/api/shopping-extras', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ polozka: kontrola.hodnota, plan_id: planId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Uložení se nepodařilo.');
      setText('');
      await nacti();
    } catch (err) {
      setChyba(err?.message || 'Uložení se nepodařilo.');
    } finally {
      setUklada(false);
    }
  }, [text, token, planId, nacti]);

  const smaz = useCallback(async (id) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/shopping-extras?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await nacti();
    } catch {
      /* Nepovedlo se smazat — uživatel to zkusí znovu. */
    }
  }, [token, nacti]);

  return (
    <div className={`${PANEL} mt-3 p-3.5`}>
      <h4 className="m-0 text-sm font-bold text-white">Vlastní položky</h4>
      <p className="m-0 mt-1 text-xs text-neutral-400">
        Co v plánu není — drogerie, koření, co doma došlo. Zůstane u tohohle plánu.
      </p>

      {polozky.length > 0 ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
          {polozky.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-[#11141e] px-3 py-2"
            >
              <span className="min-w-0 flex-1 break-words text-sm text-neutral-200">{p.polozka}</span>
              <button
                type="button"
                onClick={() => smaz(p.id)}
                className={`${TLACITKO} min-h-[30px] w-8 shrink-0 px-0 text-xs`}
                aria-label={`Odebrat ${p.polozka}`}
                title="Odebrat"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={pridej} className="mt-3 flex flex-wrap items-start gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Např. toaletní papír"
          className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-neutral-700 bg-[#11141e] px-3 text-sm text-white placeholder:text-neutral-600 focus:border-[#00f2fe]/60 focus:outline-none"
          aria-label="Nová položka nákupního seznamu"
        />
        <button type="submit" disabled={uklada} className={`${TLACITKO_HLAVNI} min-h-[40px] px-4`}>
          {uklada ? 'Přidávám…' : 'Přidat'}
        </button>
      </form>
      {chyba ? <p className="m-0 mt-2 text-xs text-red-300" role="alert">{chyba}</p> : null}
    </div>
  );
}
