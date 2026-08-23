/**
 * NAMĚŘENÁ DATA UŽIVATELE PRO TEDA.
 *
 * `buildAgentContext('trainer_coach', …)` dodá metriky z registrace, plán,
 * návyky a historii. Nedodá ale to, na co se člověk v profilu ptá nejčastěji:
 * čísla z hodinek a z váhy. Bez nich by TED na „co znamená moje HRV 51?"
 * musel odpovědět obecně — a to je přesně to, co dělat nemá.
 *
 * PROČ TENHLE MODUL A NE `lib/health/queries.ts`. Ten je v TypeScriptu a do
 * balíčku funkce se dostane jen díky `includeFiles: lib/health/**`, které
 * `vercel.json` nastavuje pouze pro `api/health/**`. Import odjinud by prošel
 * buildem a spadl až v produkci na ERR_MODULE_NOT_FOUND — to už se jednou
 * stalo. Tady se čte přímo, obyčejným JavaScriptem.
 *
 * CO SE NEPOSÍLÁ: nic, co uživatel v profilu nevidí. Kontext pro AI není
 * místo, kde se rozšiřuje přístup k datům.
 */

import { supabaseServer } from './supabaseServer.js';
import { vyberTelesneSlozeni, SLOUPCE_SNAPSHOTU } from './telesneSlozeni.js';
import { posledniNoc, SLOUPCE_SPANKU } from './health/spanek.js';

/** Kolik dní zpět. Delší historie kontext jen nafoukne. */
const DNU = 14;

function pradnaDenPredem(dnu) {
  const d = new Date(Date.now() - dnu * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Naměřená data uživatele ve tvaru, kterému rozumí člověk i model.
 *
 * Chybějící hodnoty se do výstupu nedávají vůbec — `null` v kontextu svádí
 * model k tomu, aby ho vyplnil odhadem. Co tam není, o tom TED neví.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function namerenaData(userId) {
  const od = pradnaDenPredem(DNU);

  const [regenerace, metriky, spanek, snapshoty] = await Promise.allSettled([
    supabaseServer
      .from('apple_health_recovery')
      .select('local_date, hrv_ms, resting_hr, steps, active_kcal, exercise_min, sleep_asleep_min, hrv_baseline7, rhr_baseline7, recovery_score, recovery_status')
      .eq('user_id', userId)
      .gte('local_date', od)
      .order('local_date', { ascending: false })
      .limit(DNU),
    supabaseServer
      .from('apple_health_metrics_daily')
      .select('local_date, metric_name, label_cs, category, unit, value, is_key')
      .eq('user_id', userId)
      .eq('is_key', true)
      .gte('local_date', od)
      .order('local_date', { ascending: false }),
    supabaseServer
      .from('apple_health_sleep')
      .select(SLOUPCE_SPANKU)
      .eq('user_id', userId)
      .gte('local_date', od)
      .order('local_date', { ascending: false })
      .limit(DNU),
    supabaseServer
      .from('withings_body_snapshots')
      .select(SLOUPCE_SNAPSHOTU)
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(20),
  ]);

  const data = (v) => (v.status === 'fulfilled' ? v.value?.data ?? [] : []);

  const radkyRegenerace = data(regenerace);
  const dnes = radkyRegenerace[0] ?? null;

  const out = {
    poznamka:
      'Naměřená data tohoto uživatele. Co tu není, o tom nevíme — nedopočítávej to.',
    obdobi_dni: DNU,
  };

  if (dnes) {
    const posledni = {};
    if (dnes.hrv_ms !== null && dnes.hrv_ms !== undefined) posledni.hrv_ms = Number(dnes.hrv_ms);
    if (dnes.hrv_baseline7 !== null && dnes.hrv_baseline7 !== undefined) {
      posledni.hrv_prumer_7dni_ms = Number(dnes.hrv_baseline7);
    }
    if (dnes.resting_hr !== null && dnes.resting_hr !== undefined) posledni.klidovy_tep = Number(dnes.resting_hr);
    if (dnes.rhr_baseline7 !== null && dnes.rhr_baseline7 !== undefined) {
      posledni.klidovy_tep_prumer_7dni = Number(dnes.rhr_baseline7);
    }
    if (dnes.steps !== null && dnes.steps !== undefined) posledni.kroky = Number(dnes.steps);
    if (dnes.active_kcal !== null && dnes.active_kcal !== undefined) posledni.aktivni_kcal = Number(dnes.active_kcal);
    if (dnes.exercise_min !== null && dnes.exercise_min !== undefined) posledni.cas_cviceni_min = Number(dnes.exercise_min);
    // Skóre jen když ho server opravdu spočítal. `nedostatek_dat` znamená,
    // že ho nemáme — ne že je nulové.
    if (dnes.recovery_status === 'ok' && dnes.recovery_score !== null) {
      posledni.skore_regenerace = Number(dnes.recovery_score);
    }
    if (Object.keys(posledni).length > 0) {
      out.posledni_den = { datum: dnes.local_date, ...posledni };
    }
  }

  // Klíčové metriky: poslední hodnota každé z nich, s českým názvem z importu.
  const nejnovejsi = new Map();
  for (const r of data(metriky)) {
    if (r.value === null || r.value === undefined) continue;
    if (!nejnovejsi.has(r.metric_name)) nejnovejsi.set(r.metric_name, r);
  }
  if (nejnovejsi.size > 0) {
    out.metriky_z_hodinek = [...nejnovejsi.values()].map((r) => ({
      nazev: r.label_cs || r.metric_name,
      oblast: r.category || null,
      hodnota: Number(r.value),
      jednotka: r.unit || null,
      datum: r.local_date,
    }));
  }

  const noc = posledniNoc(data(spanek));
  if (noc) {
    out.spanek_posledni_noc = {
      datum: noc.datum,
      delka: noc.spanek,
      vzhuru_behem_noci: noc.probuzeni,
      poznamka:
        'Fáze spánku (REM, jádrový, hluboký) zdroj neposílá — o nich nevíme nic.',
    };
  }

  const slozeni = vyberTelesneSlozeni(data(snapshoty));
  if (slozeni) {
    const telo = { zmereno: slozeni.measured_at };
    const pole = {
      tuk_procent: slozeni.fat_percent,
      tuk_kg: slozeni.fat_mass_kg,
      svalova_hmota_kg: slozeni.muscle_mass_kg,
      kostni_hmota_kg: slozeni.bone_mass_kg,
      hydratace_kg: slozeni.hydration_kg,
      visceralni_tuk: slozeni.visceral_fat,
      bmi: slozeni.bmi,
      bazalni_metabolismus_kcal: slozeni.basal_metabolic_rate,
    };
    for (const [k, v] of Object.entries(pole)) {
      if (v !== null && v !== undefined) telo[k] = Number(v);
    }
    if (Object.keys(telo).length > 1) out.telesne_slozeni = telo;
  }

  return out;
}
