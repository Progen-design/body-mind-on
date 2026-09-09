/**
 * DNESNI PLAN PRO TEDA — trenink a jidla dnesniho dne, stlacene na minimum.
 *
 * PROC TO EXISTUJE. TED do 9. 9. 2026 dostaval plan jako `plan_html` z
 * `buildAgentContext` — az tri plany po 12 000 znacich orizle HTML. Overeno
 * naostro: na otazku „Proc mam dnes v planu zrovna tenhle trenink?" odpovedel,
 * ze konkretni trenink pro dnesek v kontextu nevidi, prestoze profil kousek
 * nad chatem ukazoval „Trenink B · 60 min".
 *
 * Duvody byly tri a vsechny plynou z toho, ze HTML neni datova struktura:
 *   1. plan_html ma 46 000 znaku, do kontextu se vejde 12 000 — dnesek casto
 *      spadne do te odriznute casti,
 *   2. je to cely tyden bez oznaceni, ktery den je dnes,
 *   3. model musi dnesek z HTML vyparsovat, coz je prace navic pri kazde
 *      otazce, a plati se za ni ve vstupnich tokenech.
 *
 * Tenhle modul bere `structured_plan_json` (tataz data, ze kterych se HTML
 * vyrabi), vybere z nej DNESNI den a vrati z nej jen to podstatne. Vysledek
 * ma radove stovky tokenu misto tisicu.
 *
 * CO SE ZAMERNE NEPOSILA: `instructions_cs` (sest vet ke kazdemu cviku),
 * `gif_url`, `image_url`, `canonical_key`, cele recepty se surovinami. Na
 * otazku „proc mam dnes tenhle trenink" nic z toho neni potreba a je to
 * nejvetsi cast dat. Kdyz se uzivatel zepta na provedeni cviku, otevre si ho
 * v aplikaci — tam popis je.
 */
import { supabaseServer } from './supabaseServer.js';

/** Kolik cviku a jidel nejvyse jde do kontextu. Bezny den ma 5-8 a 5. */
export const MAX_CVIKU = 12;
export const MAX_JIDEL = 8;

/** Dnesek v Evrope/Praze ve tvaru YYYY-MM-DD, stejne jako `days[].date`. */
export function dnesniDatum(ted = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ted);
}

/**
 * Jeden cvik pro kontext. Nazev, serie, opakovani, obtiznost — nic vic.
 *
 * `display_name_cs` vyhrava nad `name_cs` i `name`: je to tentyz retezec,
 * ktery uzivatel vidi v aplikaci, takze kdyz se na cvik zepta jmenem,
 * TED ho najde pod stejnym nazvem.
 */
function cvikProKontext(c) {
  const nazev = c?.display_name_cs || c?.name_cs || c?.name;
  if (!nazev) return null;
  const out = { nazev: String(nazev) };
  if (Number.isFinite(Number(c?.sets))) out.serie = Number(c.sets);
  if (c?.reps) out.opakovani = String(c.reps);
  if (c?.obtiznost) out.obtiznost = String(c.obtiznost);
  // Existence lehci/tezsi varianty je pro TEDa pouzitelna informace:
  // muze rovnou rict, ze se cvik da vymenit. Klice samotne neposilame.
  if (c?.easier_key) out.ma_lehci_variantu = true;
  if (c?.harder_key) out.ma_tezsi_variantu = true;
  return out;
}

/** Jedno jidlo pro kontext. Nazev a makra, bez surovin a postupu. */
function jidloProKontext(j) {
  const nazev = j?.recipe?.title_cs || j?.recipe?.title;
  if (!nazev) return null;
  const out = { nazev: String(nazev) };
  if (j?.type) out.typ = String(j.type);
  const kcal = Number(j?.kcal ?? j?.recipe?.calories);
  if (Number.isFinite(kcal)) out.kcal = Math.round(kcal);
  const bilkoviny = Number(j?.protein_g ?? j?.recipe?.protein_g);
  if (Number.isFinite(bilkoviny)) out.bilkoviny_g = Math.round(bilkoviny);
  return out;
}

/**
 * Vybere dnesni den z `structured_plan_json` a stlaci ho pro kontext.
 *
 * Cista funkce — dan plan a datum, vrati vysledek. Databaze je az ve
 * `dnesniPlan()` niz, aby sla tahle cast testovat bez ni.
 *
 * @param {object|null} plan obsah `structured_plan_json`
 * @param {string} datum YYYY-MM-DD
 * @returns {object|null} null, kdyz plan pro dnesek nemame
 */
export function denZPlanu(plan, datum) {
  const dny = Array.isArray(plan?.days) ? plan.days : [];
  const den = dny.find((d) => String(d?.date) === datum);
  if (!den) return null;

  const out = { datum, den_v_tydnu: den?.day_name ? String(den.day_name) : null };

  const cilKcal = Number(den?.daily_target_kcal);
  if (Number.isFinite(cilKcal)) out.denni_cil_kcal = Math.round(cilKcal);

  const cviky = Array.isArray(den?.workout?.exercises)
    ? den.workout.exercises.map(cvikProKontext).filter(Boolean).slice(0, MAX_CVIKU)
    : [];

  // ROZLISUJEME „VOLNO" A „NEVIME".
  //
  // `workout: null` v planu znamena, ze dnesek je zamerne volny den — ne ze
  // trenink neznáme. Kdyby se to poslalo stejne jako chybejici data, TED by
  // rekl „trenink nevidim" a uzivatel by hledal chybu tam, kde zadna neni.
  if (den?.workout && cviky.length) {
    out.trenink = { cviky };
    if (den.workout.name || den.workout.title) {
      out.trenink.nazev = String(den.workout.name || den.workout.title);
    }
    const delka = Number(den.workout.duration_min ?? den.workout.duration_minutes);
    if (Number.isFinite(delka)) out.trenink.delka_min = Math.round(delka);
  } else {
    out.trenink = null;
    out.dnes_je_volny_den = true;
  }

  const jidla = Array.isArray(den?.meals)
    ? den.meals.map(jidloProKontext).filter(Boolean).slice(0, MAX_JIDEL)
    : [];
  if (jidla.length) out.jidla = jidla;

  return out;
}

/**
 * Dnesni plan uzivatele pro kontext TEDa.
 *
 * Vraci `null`, kdyz uzivatel plan nema nebo v nem dnesek neni — volajici to
 * pak do kontextu vubec nedava a TED podle pravidla A rekne, ze plan nevidi.
 * To je spravne: prazdna struktura by svadela k tomu, aby si neco domyslel.
 *
 * @param {string} userId
 * @param {{ client?: object, datum?: string }} [opts]
 * @returns {Promise<object|null>}
 */
export async function dnesniPlan(userId, opts = {}) {
  if (!userId) return null;
  const client = opts.client || supabaseServer;
  const datum = opts.datum || dnesniDatum();

  const { data, error } = await client
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return denZPlanu(data.structured_plan_json, datum);
}
