import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCanonicalExercise } from '../../lib/exerciseCanonicalMap';
import { supabase } from '../../lib/supabaseClient';

/**
 * ZÁPIS ODCVIČENÉHO TRÉNINKU — jediné místo, kde uživatel řekne, co zvedl.
 *
 * PROČ EXISTUJE. Pravidla progrese, tabulka `start_workout_progression`
 * i endpoint `/api/workout/progression` byly hotové a otestované, ale nikde
 * v aplikaci nešlo výsledek zadat. Předpisy se každý týden vygenerovaly,
 * zůstaly ve stavu `prescribed` a progrese neměla z čeho počítat — takže
 * další týden předepsal to samé. Bez tohohle UI je celá progrese mrtvá.
 *
 * ZÁMĚRNĚ JEDEN KROK. Na cvik jedno pole (nebo dvě u zatížených), předvyplněné
 * předpisem. Kdo odcvičil, co měl, jen ťukne ✓. Zápis po sériích tu není
 * schválně: člověk po tréninku nevyplní tabulku o dvanácti políčkách a radši
 * nevyplní nic — a pak je progrese na tom stejně jako předtím.
 *
 * CO SE TÍM ZTRÁCÍ: rozpad opakování po sériích. Zadaná hodnota se pošle pro
 * všechny série (`Array(target_sets).fill(reps)`), protože `prescriptionMet()`
 * vyžaduje pole aspoň o délce `target_sets`. U výdrže model jednu hodnotu
 * roztahuje sám. Kdo cvičil nerovnoměrně, zadá to nejnižší — pravidlo stejně
 * hlídá spodní hranici.
 */

const DEN_MS = 24 * 60 * 60 * 1000;

function isoDen(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function nazevCviku(canonicalKey) {
  return getCanonicalExercise(canonicalKey)?.display_name_cs || canonicalKey;
}

/** „3× 8–12 · 40 kg“ / „3× 45 s“ — co má uživatel odcvičit. */
function popisPredpisu(item) {
  const sets = Number(item.target_sets) || 0;
  if (item.progression_kind === 'timed') {
    const s = Number(item.target_duration_sec) || 0;
    return `${sets}× ${s} s`;
  }
  const min = Number(item.target_reps_min) || 0;
  const max = Number(item.target_reps_max) || 0;
  const reps = max && max !== min ? `${min}–${max}` : `${min}`;
  const kg = item.prescribed_weight_kg != null ? ` · ${Number(item.prescribed_weight_kg)} kg` : '';
  return `${sets}× ${reps}${kg}`;
}

function jeZatizeny(kind) {
  return kind === 'barbell' || kind === 'dumbbell' || kind === 'machine';
}

export default function WorkoutLogSection({ accessToken: accessTokenProp = null, poradiCviku = null }) {
  // TOKEN SI UMÍ SEHNAT SÁM.
  //
  // Sekce se přesunula z vrcholu profilu k dnešnímu tréninku (do
  // ProfileTodayPanels), kam se `accessToken` neprotahuje — visel by přes tři
  // komponenty jen kvůli tomuhle. Prop má přednost, když ho volající má.
  const [accessTokenState, setAccessTokenState] = useState(null);
  const accessToken = accessTokenProp ?? accessTokenState;

  useEffect(() => {
    if (accessTokenProp) return undefined;
    let zruseno = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!zruseno) setAccessTokenState(data?.session?.access_token ?? null);
    });
    return () => { zruseno = true; };
  }, [accessTokenProp]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vstupy, setVstupy] = useState({});
  const [uklada, setUklada] = useState(null);
  const [hlaska, setHlaska] = useState(null);

  const nacti = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      // Okno dozadu, ne jen dnešek: kdo cvičil večer a zapisuje ráno, musí mít
      // kam. Dopředu se nekouká — co se ještě neodcvičilo, nemá smysl zapisovat.
      const to = isoDen(Date.now());
      const from = isoDen(Date.now() - 13 * DEN_MS);
      const res = await fetch(`/api/workout/progression?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { nacti(); }, [nacti]);

  // Nabízí se JEDEN den — nejnovější, ve kterém něco zbývá dopsat. Seznam
  // všech nevyplněných dnů najednou je zase formulář, kterému se vyhýbáme.
  const den = useMemo(() => {
    const nevyplnene = items.filter((i) => i.status === 'prescribed');
    if (!nevyplnene.length) return null;
    return nevyplnene.map((i) => i.performed_on).sort().slice(-1)[0];
  }, [items]);

  /**
   * Pořadí cviků JAKO V PLÁNU.
   *
   * `start_workout_progression` nemá sloupec pořadí a předpisy se nezakládají
   * v pořadí plánu, takže zápis vracel cviky přeházené — uživatel viděl tytéž
   * cviky nad sebou ve dvou různých posloupnostech. Pořadí proto určuje plán;
   * co v něm není, jde na konec a drží si vzájemné pořadí z API.
   */
  const seraď = useCallback((seznam) => {
    if (!Array.isArray(poradiCviku) || poradiCviku.length === 0) return seznam;
    const poradi = new Map(poradiCviku.map((k, i) => [k, i]));
    return [...seznam].sort((a, b) => {
      const ia = poradi.has(a.canonical_key) ? poradi.get(a.canonical_key) : Number.MAX_SAFE_INTEGER;
      const ib = poradi.has(b.canonical_key) ? poradi.get(b.canonical_key) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }, [poradiCviku]);

  const kDopsani = useMemo(
    () => seraď(items.filter((i) => i.performed_on === den && i.status === 'prescribed')),
    [items, den, seraď]
  );

  const hotovoDnes = useMemo(
    () => seraď(items.filter((i) => i.performed_on === den && i.status !== 'prescribed')),
    [items, den, seraď]
  );

  function hodnota(item, pole, vychozi) {
    const k = `${item.performed_on}|${item.canonical_key}|${pole}`;
    return vstupy[k] !== undefined ? vstupy[k] : vychozi;
  }

  function nastav(item, pole, v) {
    const k = `${item.performed_on}|${item.canonical_key}|${pole}`;
    setVstupy((p) => ({ ...p, [k]: v }));
  }

  async function odesli(item, { skipped = false } = {}) {
    const klic = `${item.performed_on}|${item.canonical_key}`;
    setUklada(klic);
    setHlaska(null);

    const telo = {
      canonical_key: item.canonical_key,
      performed_on: item.performed_on,
    };

    if (skipped) {
      telo.skipped = true;
    } else if (item.progression_kind === 'timed') {
      const s = Number(hodnota(item, 'sec', item.target_duration_sec));
      if (!Number.isFinite(s) || s < 0) { setHlaska('Zadej výdrž v sekundách.'); setUklada(null); return; }
      telo.duration_sec = [Math.round(s)];
    } else {
      const r = Number(hodnota(item, 'reps', item.target_reps_min));
      if (!Number.isInteger(r) || r < 0) { setHlaska('Zadej počet opakování.'); setUklada(null); return; }
      const sets = Math.max(1, Number(item.target_sets) || 1);
      telo.reps_done = Array(sets).fill(r);

      if (jeZatizeny(item.progression_kind)) {
        const w = Number(hodnota(item, 'kg', item.prescribed_weight_kg));
        if (!Number.isFinite(w) || w < 0) { setHlaska('Zadej váhu v kilogramech.'); setUklada(null); return; }
        telo.weight_kg = w;
      }
    }

    try {
      const res = await fetch('/api/workout/progression', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(telo),
      });
      const data = await res.json();
      if (!res.ok) {
        setHlaska(data?.error || 'Zápis se nepovedl, zkus to znovu.');
        return;
      }
      // Přepsat lokálně, ať uživatel vidí výsledek hned a nečeká na re-fetch.
      setItems((p) => p.map((x) =>
        x.canonical_key === item.canonical_key && x.performed_on === item.performed_on
          ? { ...x, ...data.row, met: data.met }
          : x));
    } catch {
      setHlaska('Zápis se nepovedl, zkus to znovu.');
    } finally {
      setUklada(null);
    }
  }

  if (!accessToken) return null;
  if (loading) {
    return (
      <div className="profile-bubble" id="zapis-treninku">
        <h3 className="wl-title">Zápis tréninku</h3>
        <p className="wl-muted">Načítám…</p>
        <style dangerouslySetInnerHTML={{ __html: styly }} />
      </div>
    );
  }

  // Žádné předpisy = uživatel není na programu s progresí. Prázdná karta by
  // jen zabírala místo.
  if (!items.length) return null;

  return (
    <div className="profile-bubble" id="zapis-treninku">
      <h3 className="wl-title">Zápis tréninku</h3>

      {!kDopsani.length ? (
        <p className="wl-muted">
          {hotovoDnes.length
            ? 'Zapsáno. Příští plán z toho bude vycházet.'
            : 'Teď není co zapisovat.'}
        </p>
      ) : (
        <>
          <p className="wl-den">
            Trénink {new Date(den).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
            {' · '}zbývá {kDopsani.length}
          </p>

          <ul className="wl-list">
            {kDopsani.map((item) => {
              const klic = `${item.performed_on}|${item.canonical_key}`;
              const zamceno = uklada === klic;
              return (
                <li key={klic} className="wl-row">
                  <div className="wl-head">
                    <span className="wl-name">{nazevCviku(item.canonical_key)}</span>
                    <span className="wl-target">{popisPredpisu(item)}</span>
                  </div>

                  <div className="wl-inputs">
                    {item.progression_kind === 'timed' ? (
                      <label className="wl-field">
                        <span>s</span>
                        <input
                          type="number" inputMode="numeric" min="0" max="600"
                          value={hodnota(item, 'sec', item.target_duration_sec ?? '')}
                          onChange={(e) => nastav(item, 'sec', e.target.value)}
                          disabled={zamceno}
                        />
                      </label>
                    ) : (
                      <>
                        {jeZatizeny(item.progression_kind) && (
                          <label className="wl-field">
                            <span>kg</span>
                            <input
                              type="number" inputMode="decimal" min="0" max="500" step="0.5"
                              value={hodnota(item, 'kg', item.prescribed_weight_kg ?? '')}
                              onChange={(e) => nastav(item, 'kg', e.target.value)}
                              disabled={zamceno}
                            />
                          </label>
                        )}
                        <label className="wl-field">
                          <span>opak.</span>
                          <input
                            type="number" inputMode="numeric" min="0" max="600"
                            value={hodnota(item, 'reps', item.target_reps_min ?? '')}
                            onChange={(e) => nastav(item, 'reps', e.target.value)}
                            disabled={zamceno}
                          />
                        </label>
                      </>
                    )}

                    <button
                      type="button" className="wl-ok"
                      onClick={() => odesli(item)} disabled={zamceno}
                    >
                      {zamceno ? '…' : 'Zapsat'}
                    </button>
                  </div>

                  <button
                    type="button" className="wl-skip"
                    onClick={() => odesli(item, { skipped: true })} disabled={zamceno}
                  >
                    Tenhle cvik jsem vynechal
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {hlaska && <p className="wl-err" role="alert">{hlaska}</p>}
      <style dangerouslySetInnerHTML={{ __html: styly }} />
    </div>
  );
}

const styly = `
  .wl-title { margin: 0 0 4px; font-size: 1rem; color: #e2e8f0; }
  .wl-den { margin: 0 0 12px; font-size: 0.82rem; color: #64748b; }
  .wl-muted { margin: 0; font-size: 0.88rem; color: #94a3b8; }
  .wl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .wl-row { padding: 12px; border: 1px solid rgba(148,163,184,0.22); border-radius: 12px;
            background: rgba(23,32,51,0.55); }
  .wl-head { display: flex; justify-content: space-between; align-items: baseline;
             gap: 8px; margin-bottom: 10px; }
  .wl-name { font-size: 0.92rem; color: #e2e8f0; font-weight: 600; }
  .wl-target { font-size: 0.78rem; color: #64748b; white-space: nowrap; }
  .wl-inputs { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  .wl-field { display: flex; flex-direction: column; gap: 3px; }
  .wl-field span { font-size: 0.68rem; color: #64748b; text-transform: uppercase;
                   letter-spacing: 0.04em; }
  .wl-field input { width: 72px; padding: 8px 10px; font-size: 0.95rem;
                    border-radius: 8px; border: 1px solid rgba(148,163,184,0.3);
                    background: #0f172a; color: #e2e8f0; }
  .wl-ok { margin-left: auto; padding: 9px 18px; border: 0; border-radius: 8px;
           background: #0ea5e9; color: #fff; font-weight: 600; font-size: 0.88rem;
           cursor: pointer; }
  .wl-ok:disabled { opacity: 0.55; cursor: default; }
  .wl-skip { margin-top: 8px; padding: 0; border: 0; background: none;
             color: #64748b; font-size: 0.76rem; text-decoration: underline;
             cursor: pointer; }
  .wl-err { margin: 10px 0 0; font-size: 0.82rem; color: #f87171; }
`;
