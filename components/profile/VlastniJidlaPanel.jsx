/**
 * VLASTNÍ JÍDLA — co si uživatel dopsal nad rámec plánu.
 *
 * Jídlo bez ověřené nutrice je tady vidět, ale do denního součtu nevstupuje.
 * Rozhoduje o tom `zapocitatDoSouctu` v `lib/profile/vlastniJidlo.js` a UI to
 * musí PŘIZNAT, ne zamlčet — proto štítek „nepočítá se do součtu“ přímo na
 * kartě a věta pod denním součtem.
 *
 * Formulář nikdy nedosazuje náhradní čísla. Prázdné pole zůstane prázdné
 * (NULL), ne nula: „nevyplněno“ a „nula kalorií“ jsou dvě různé věci.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import {
  KARTA,
  PANEL,
  STITEK,
  TLACITKO,
  TLACITKO_HLAVNI,
} from '../../lib/profile/designTokens.js';
import { overVlastniJidlo, zapocitatDoSouctu } from '../../lib/profile/vlastniJidlo.js';

const PRAZDNY_FORMULAR = { title: '', kcal_rucne: '', protein_g: '', carbs_g: '', fat_g: '' };

/** Číslo pro zobrazení; null zůstane pomlčkou, nula zůstane nulou. */
function zobrazCislo(hodnota, jednotka) {
  if (hodnota === null || hodnota === undefined) return null;
  const n = Number(hodnota);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n)}${jednotka}`;
}

export default function VlastniJidlaPanel({ datum, planId = null, jidla = [], onZmena }) {
  const [otevreno, setOtevreno] = useState(false);
  const [formular, setFormular] = useState(PRAZDNY_FORMULAR);
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

  const uloz = useCallback(async (e) => {
    e.preventDefault();
    setChyba(null);

    // Stejná kontrola jako na serveru — uživatel se o chybě dozví hned,
    // ale server si ji ověří znovu, protože klientovi se věřit nedá.
    const kontrola = overVlastniJidlo({ ...formular, local_date: datum });
    if (!kontrola.ok) { setChyba(kontrola.chyba); return; }
    if (!token) { setChyba('Nejsi přihlášený.'); return; }

    setUklada(true);
    try {
      const res = await fetch('/api/custom-meals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...kontrola.hodnota, plan_id: planId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Uložení se nepodařilo.');
      setFormular(PRAZDNY_FORMULAR);
      setOtevreno(false);
      onZmena?.();
    } catch (err) {
      setChyba(err?.message || 'Uložení se nepodařilo.');
    } finally {
      setUklada(false);
    }
  }, [formular, datum, planId, token, onZmena]);

  const smaz = useCallback(async (id) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/custom-meals?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onZmena?.();
    } catch {
      /* Nepovedlo se smazat — seznam zůstane, uživatel to zkusí znovu. */
    }
  }, [token, onZmena]);

  const pole = (klic, popisek, jednotka) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-neutral-400">{popisek}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder="—"
        value={formular[klic]}
        onChange={(e) => setFormular((f) => ({ ...f, [klic]: e.target.value }))}
        className="min-h-[38px] rounded-lg border border-neutral-700 bg-[#11141e] px-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-[#00f2fe]/60 focus:outline-none"
        aria-label={`${popisek}${jednotka ? ` (${jednotka})` : ''}`}
      />
    </label>
  );

  return (
    <div className="mt-3">
      {jidla.length > 0 ? (
        <ul className="m-0 mb-2.5 flex list-none flex-col gap-2 p-0">
          {jidla.map((j) => {
            const pocita = zapocitatDoSouctu(j);
            const detaily = [
              zobrazCislo(j.kcal_rucne, ' kcal'),
              zobrazCislo(j.protein_g, ' g B'),
              zobrazCislo(j.carbs_g, ' g S'),
              zobrazCislo(j.fat_g, ' g T'),
            ].filter(Boolean);
            return (
              <li
                key={j.id}
                className={`${KARTA} flex items-center gap-3 border-l-4 border-l-neutral-600 p-3`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${STITEK} bg-neutral-700/30 text-neutral-300`}>Vlastní</span>
                    <span className="truncate text-sm font-bold text-white">{j.title}</span>
                  </div>
                  <p className="m-0 mt-1 text-xs text-neutral-400">
                    {detaily.length ? detaily.join(' · ') : 'Bez zadaných hodnot'}
                    {!pocita ? (
                      <span className="ml-2 text-amber-300">nepočítá se do součtu</span>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => smaz(j.id)}
                  className={`${TLACITKO} min-h-[34px] w-9 shrink-0 px-0`}
                  aria-label={`Smazat ${j.title}`}
                  title="Smazat"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {otevreno ? (
        <form onSubmit={uloz} className={`${PANEL} p-3.5`}>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h5 className="m-0 text-sm font-bold text-white">Přidat vlastní jídlo</h5>
            <button
              type="button"
              onClick={() => { setOtevreno(false); setChyba(null); }}
              className={`${TLACITKO} min-h-[32px] w-8 px-0`}
              aria-label="Zavřít formulář"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <label className="mb-2.5 flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-neutral-400">Co jsi jedl</span>
            <input
              type="text"
              value={formular.title}
              onChange={(e) => setFormular((f) => ({ ...f, title: e.target.value }))}
              placeholder="Např. oběd v kantýně"
              className="min-h-[40px] rounded-lg border border-neutral-700 bg-[#11141e] px-3 text-sm text-white placeholder:text-neutral-600 focus:border-[#00f2fe]/60 focus:outline-none"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {pole('kcal_rucne', 'Kalorie', 'kcal')}
            {pole('protein_g', 'Bílkoviny', 'g')}
            {pole('carbs_g', 'Sacharidy', 'g')}
            {pole('fat_g', 'Tuky', 'g')}
          </div>

          <p className="m-0 mt-2 text-[11px] leading-relaxed text-neutral-500">
            Hodnoty jsou nepovinné. Bez kalorií se jídlo do denního součtu nezapočítá —
            neumíme u něj nutrici ověřit a odhad by v součtu vypadal jako změřený údaj.
          </p>

          {chyba ? <p className="m-0 mt-2 text-xs text-red-300" role="alert">{chyba}</p> : null}

          <div className="mt-3 flex items-center gap-2">
            <button type="submit" disabled={uklada} className={`${TLACITKO_HLAVNI} min-h-[40px] px-4`}>
              {uklada ? 'Ukládám…' : 'Přidat'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOtevreno(true)}
          className={`${TLACITKO} min-h-[40px] w-full px-3`}
        >
          <Plus className="h-4 w-4" aria-hidden /> Přidat vlastní jídlo
        </button>
      )}
    </div>
  );
}
