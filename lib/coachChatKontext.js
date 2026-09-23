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
import { denPraha, soucetLogu } from './quickFoodLog.js';

/** Kolik dní zpět. Delší historie kontext jen nafoukne. */
/**
 * Kolik dní zpátky se čtou naměřená data.
 *
 * Ze 14 na 7 (9. 9. 2026): do kontextu stejně jde jen poslední hodnota
 * a sedmidenní průměr, který počítá server. Načítat dva týdny řádků, aby se
 * z nich použil jeden, zatěžovalo databázi bez užitku.
 */
const DNU = 7;

/** Kolik klíčových metrik z hodinek smí jít do kontextu. */
const MAX_METRIK = 12;

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

  const dnes = denPraha();
  const [regenerace, metriky, spanek, snapshoty, vyska, mimoPlan] = await Promise.allSettled([
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
      // Pět měření stačí: `vyberTelesneSlozeni` z nich vybírá jedno
      // nejúplnější, ne řadu. Dvacet byla zbytečná zátěž.
      .limit(5),
    // BMI z lib/telesneSlozeni.js potřebuje AKTUÁLNÍ výšku, ne tu, kterou měl
    // Withings nastavenou u sebe v den měření — viz docs/DALSI_KROK.md 7.2d.
    supabaseServer
      .from('body_metrics')
      .select('height_cm')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Jídlo snězené mimo plán (quick_food_logs). Bez něj TED na „kolik jsem
    // dnes snědl" sečte jen plán — stejná díra jako trénink, který v kontextu
    // chyběl (test 17. 9. 2026).
    supabaseServer
      .from('quick_food_logs')
      .select('popis, kcal, protein_g, carbs_g, fat_g, ai_confidence, upraveno_uzivatelem, created_at')
      .eq('user_id', userId)
      .eq('plan_day', dnes)
      .order('created_at', { ascending: true })
      .limit(30),
  ]);

  const data = (v) => (v.status === 'fulfilled' ? v.value?.data ?? [] : []);
  const heightCm = vyska.status === 'fulfilled' ? vyska.value?.data?.height_cm ?? null : null;

  const radkyRegenerace = data(regenerace);
  const posledniRegenerace = radkyRegenerace[0] ?? null;

  const out = {
    poznamka:
      'Naměřená data tohoto uživatele. Co tu není, o tom nevíme — nedopočítávej to.',
    obdobi_dni: DNU,
  };

  if (posledniRegenerace) {
    const d = posledniRegenerace;
    const posledni = {};
    if (d.hrv_ms !== null && d.hrv_ms !== undefined) posledni.hrv_ms = Number(d.hrv_ms);
    if (d.hrv_baseline7 !== null && d.hrv_baseline7 !== undefined) {
      posledni.hrv_prumer_7dni_ms = Number(d.hrv_baseline7);
    }
    if (d.resting_hr !== null && d.resting_hr !== undefined) posledni.klidovy_tep = Number(d.resting_hr);
    if (d.rhr_baseline7 !== null && d.rhr_baseline7 !== undefined) {
      posledni.klidovy_tep_prumer_7dni = Number(d.rhr_baseline7);
    }
    if (d.steps !== null && d.steps !== undefined) posledni.kroky = Number(d.steps);
    if (d.active_kcal !== null && d.active_kcal !== undefined) posledni.aktivni_kcal = Number(d.active_kcal);
    if (d.exercise_min !== null && d.exercise_min !== undefined) posledni.cas_cviceni_min = Number(d.exercise_min);
    // Skóre jen když ho server opravdu spočítal. `nedostatek_dat` znamená,
    // že ho nemáme — ne že je nulové.
    if (d.recovery_status === 'ok' && d.recovery_score !== null) {
      posledni.skore_regenerace = Number(d.recovery_score);
    }
    if (Object.keys(posledni).length > 0) {
      out.posledni_den = { datum: d.local_date, ...posledni };
    }
  }

  // Klíčové metriky: poslední hodnota každé z nich, s českým názvem z importu.
  const nejnovejsi = new Map();
  for (const r of data(metriky)) {
    if (r.value === null || r.value === undefined) continue;
    if (!nejnovejsi.has(r.metric_name)) nejnovejsi.set(r.metric_name, r);
  }
  if (nejnovejsi.size > 0) {
    // STROP POČTU METRIK. Tohle je jediná část kontextu, která roste s tím,
    // kolik toho hodinky posílají — zbytek je vždy jedna hodnota. Bez stropu
    // by uživatel s bohatým exportem platil za desítky řádků, ze kterých
    // TED použije dvě.
    out.metriky_z_hodinek = [...nejnovejsi.values()].slice(0, MAX_METRIK).map((r) => ({
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

  const slozeni = vyberTelesneSlozeni(data(snapshoty), heightCm);
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

  // Jídlo mimo plán dnes. Klíč jen když něco je — prázdné pole by TEDa
  // svádělo tvrdit „dnes jsi mimo plán nic nesnědl", i když to nevíme jistě
  // (uživatel mohl jíst a nezapsat).
  const logy = data(mimoPlan);
  if (logy.length > 0) {
    const soucet = soucetLogu(logy);
    out.jidlo_mimo_plan_dnes = {
      datum: dnes,
      poznamka: 'Jídlo, které uživatel dnes zapsal MIMO plán. Hodnoty jsou odhad z fotky nebo popisu, ne vážení.',
      soucet: {
        kcal: soucet.kcal,
        bilkoviny_g: soucet.protein_g,
        sacharidy_g: soucet.carbs_g,
        tuky_g: soucet.fat_g,
      },
      polozky: logy.map((l) => ({
        popis: l.popis || 'bez popisu',
        kcal: Number(l.kcal),
        bilkoviny_g: Number(l.protein_g),
        sacharidy_g: Number(l.carbs_g),
        tuky_g: Number(l.fat_g),
        ...(l.upraveno_uzivatelem ? { opraveno_uzivatelem: true } : {}),
      })),
    };
  }

  return out;
}
