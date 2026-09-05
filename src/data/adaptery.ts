// Prevod odpovedi /api/profile na tvary, ktere ceka Bento UI.
// Tvary vstupu jsou overene proti produkcni databazi, ne odhadnute.
// Relativni cesta zamerne misto aliasu @lib - soubor pak jde spustit
// i cistym Nodem (viz tools/overit-adaptery.ts), nejen pres Vite.
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits.js';
// Klice odskrtnutych aktivit maji jediny zdroj pravdy v lib/ — sdileny se
// serverem. Format se nesmi menit, rozparoval by uz ulozene radky.
import { mealActivityKey } from '../../lib/dailyActivationClient.js';
import { klicCviku, KLIC_CELEHO_TRENINKU } from '../../lib/profile/cvikDokonceni.js';
// Stejny vypocet "dneska" jako na serveru (api/habits.js i daily-activation).
// Vlastni new Date().toISOString() by po pulnoci UTC poslalo jine datum, nez
// jake server prijme — a ten cokoliv jineho nez dnesek v Praze odmita.
import { calendarDateIsoInPrague } from '../../lib/czechCalendar.js';
// Stejny filtr pouzitelnych kroku, jaky pouziva server pri doplnovani postupu.
import { pouzitelneKroky } from '../../lib/profile/postupReceptu.js';
// Jednotky normalizuje a sklonuje tentyz modul, ktery radky suroviny sklada.
// Bez toho se „5 plátků", „2 plátky" a „1 plátek" nesectou.
import { normalizujJednotku, tvarJednotky } from '../../lib/profile/surovinaRadek.js';
// Prostredi treninku je zakodovane v body_metrics.notes; cist ho musi tentyz
// parser, ktery ho tam zapisuje.
import {
  parseAvailableEquipment,
  parseTrainingEnvironment,
  parseTrainingEnvironmentDetail
} from '../../lib/trainingEnvironment.js';
import { naradiTreninku, svalCesky, zamereniTreninku } from '../../lib/profile/treninkPopis.js';
import type {
  BadHabitItem, CoachTip, ExerciseItem, HabitItem, MealItem, RecipeDetail, ShoppingItem,
  TelesneSlozeni, UserPreferences, UserProfile, WeightRecord, WorkoutDay,
  ZamcenyPlan
} from '../types';

export interface ProfilOdpoved {
  program?: string;
  membershipStatus?: string;
  /** Kolik dní zbývá do konce trialu. null/chybí = uživatel v trialu není. */
  trial?: { konci: string; dny_do_konce: number | null } | null;
  /** Ukázka příštího týdne pro trial. Zámek počítá server podle členství. */
  zamceny_plan?: {
    valid_from: string | null;
    valid_until: string | null;
    daily_calories: number | null;
    structured_plan_json: unknown;
    zamceno: boolean;
    /** Které tiery `isTierCheckoutEnabled` pustí. Chybí/prázdné → naZamcenyPlan spadne na ['START']. */
    dostupne_tiery?: ('START' | 'ON_CLUB' | 'VIP')[];
  } | null;
  user?: {
    id: string; email: string; name: string | null; avatar_url: string | null;
    height_cm: number | null; goal_weight_kg: number | null; birth_date: string | null;
    /** Datum registrace. `api/profile.js` ho vracelo, jen tenhle typ o něm nevěděl. */
    created_at?: string | null;
  };
  body_metrics?: any[];
  user_habits?: { habit_id: string; is_positive: boolean; sort_order: number }[];
  plans?: any[];
  workouts?: any[];
  daily_activity_completions?: DokonceniAktivity[];
  habit_logs_progress?: ZaznamNavyku[];
  body_composition?: TelesneSlozeni | null;
  coach_messages?: ZpravaTrenera[];
  /**
   * Kdy server naposled stahoval z Withings (`withings_connections.last_sync_at`).
   * null = zatím nikdy. Karta zařízení z toho počítá odstup — dřív tam stála
   * věta „Stahuje se automaticky každou hodinu", což je nastavení cronu, ne
   * záznam o tom, že se to opravdu stalo.
   */
  withings_last_sync_at?: string | null;
  /**
   * Existuje řádek ve `withings_connections`? Karta Withings dřív měla
   * odznak „Online" natvrdo v JSX a svítil i účtu bez jediného zařízení.
   */
  has_withings_connection?: boolean;
}

/** Radek `ai_messages` (agent_slug = 'coach'), jak ho vraci /api/profile. */
export interface ZpravaTrenera {
  id: string | number;
  title?: string | null;
  content?: string | null;
  created_at?: string | null;
  task_type?: string | null;
}

/** Řádek `habit_logs`, jak ho vrací /api/profile v `habit_logs_progress`. */
export interface ZaznamNavyku {
  log_date: string;
  habit_id: string;
  completed?: boolean;
}

/** Řádek `daily_activity_completions`, jak ho vrací /api/profile. */
export interface DokonceniAktivity {
  activity_type: string;
  activity_key: string;
  completed_at?: string;
  plan_id?: string | null;
  plan_day?: number | null;
}

const NAZVY_PROGRAMU: Record<string, string> = {
  START: 'START',
  ON_CLUB: 'ON Club',
  VIP: 'VIP'
};

/**
 * PLÁN, KTERÝ PLATÍ DNES — NE TEN, KTERÝ TEPRVE ZAČNE.
 *
 * Chyba, kterou to opravuje: podmínka se ptala jen na `valid_until >= dnes`
 * a na `valid_from` se neptala vůbec. Plán vygenerovaný dopředu na příští
 * týden tím prošel jako „aktivní", protože jeho konec je v budoucnu.
 *
 * Změřeno na produkci 23. 8. 2026 (neděle): jako aktivní byl označený plán
 * s platností 27. 8. – 2. 9., zatímco plán na probíhající týden
 * (20. – 26. 8.) měl `is_active = false`. Uživateli se proto v neděli
 * ukazoval „nejbližší trénink (pátek)" z týdne, který ještě nezačal.
 *
 * `is_active` z databáze se bere jen jako slabá nápověda při shodě —
 * rozhoduje datum, protože právě to se rozešlo se skutečností.
 *
 * Pořadí voleb:
 *   1. plán, jehož rozsah pokrývá dnešek,
 *   2. nejčerstvější už skončený (uživatel aspoň vidí, co dělal),
 *   3. nejbližší budoucí (nový uživatel čekající na první plán).
 */
export function vyberPlan(plans: any[] = []): any | null {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  const dnes = new Date().toISOString().slice(0, 10);

  const zacatek = (p: any) => String(p?.valid_from || '');
  const konec = (p: any) => String(p?.valid_until || '');

  const pokryvaDnesek = plans.filter((p) => {
    const od = zacatek(p);
    const do_ = konec(p);
    return (!od || od <= dnes) && (!do_ || do_ >= dnes);
  });
  if (pokryvaDnesek.length) {
    // Při víc překryvech vyhrává ten, který server označil za aktivní,
    // jinak ten s pozdějším začátkem.
    return pokryvaDnesek.find((p) => p?.is_active)
      || [...pokryvaDnesek].sort((a, b) => zacatek(b).localeCompare(zacatek(a)))[0];
  }

  const skoncene = plans
    .filter((p) => konec(p) && konec(p) < dnes)
    .sort((a, b) => konec(b).localeCompare(konec(a)));
  if (skoncene.length) return skoncene[0];

  const budouci = plans
    .filter((p) => zacatek(p) && zacatek(p) > dnes)
    .sort((a, b) => zacatek(a).localeCompare(zacatek(b)));
  return budouci[0] || plans[0] || null;
}

/**
 * Platí vybraný plán dnes, nebo je z jiného období?
 *
 * UI to potřebuje, aby nevydávalo trénink z příštího týdne za dnešní.
 */
export function platnostPlanu(plan: any): 'aktualni' | 'budouci' | 'skoncil' | 'neznama' {
  const od = String(plan?.valid_from || '');
  const do_ = String(plan?.valid_until || '');
  if (!od && !do_) return 'neznama';
  const dnes = new Date().toISOString().slice(0, 10);
  if (od && od > dnes) return 'budouci';
  if (do_ && do_ < dnes) return 'skoncil';
  return 'aktualni';
}

function strukturaPlanu(plan: any): any | null {
  if (!plan) return null;
  const s = plan.structured_plan_json;
  if (!s) return null;
  return typeof s === 'string' ? JSON.parse(s) : s;
}

/**
 * Generator vraci ctyri typy jidel (breakfast, lunch, dinner, snack).
 * Bento rozlisuje dopolední a odpolední svacinu - rozhoduje poradi v ramci dne.
 */
const CAS_JIDLA: Record<MealItem['type'], string> = {
  'Snídaně': '7:30',
  'Dopolední svačina': '10:00',
  'Oběd': '12:30',
  'Odpolední svačina': '15:30',
  'Večeře': '18:30'
};

function typJidla(apiTyp: string, poradiSvaciny: number): MealItem['type'] {
  switch (String(apiTyp || '').toLowerCase()) {
    case 'breakfast': return 'Snídaně';
    case 'lunch': return 'Oběd';
    case 'dinner': return 'Večeře';
    case 'snack': return poradiSvaciny === 0 ? 'Dopolední svačina' : 'Odpolední svačina';
    default: return 'Odpolední svačina';
  }
}

function cislo(v: unknown, vychozi = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : vychozi;
}

/** Den plánu pro dnešek; když plán dnešek nepokrývá, první den. */
function dnesniDen(struktura: any): any | null {
  const dny = struktura?.days;
  if (!Array.isArray(dny) || dny.length === 0) return null;
  const dnes = new Date().toISOString().slice(0, 10);
  return dny.find((d: any) => String(d?.date) === dnes) || dny[0];
}

/**
 * Index dne v plánu (0–6) — to je `plan_day`, které čeká /api/daily-activation.
 * Pozor: NENÍ to index v poli, které vrací `naTreninky` — to je předfiltrované
 * na dny s tréninkem, takže by čísla nesedela.
 */
function indexDne(struktura: any, den: any): number | undefined {
  const dny = struktura?.days;
  if (!Array.isArray(dny) || !den) return undefined;
  const i = dny.indexOf(den);
  return i >= 0 && i <= 6 ? i : undefined;
}

function idPlanu(plan: any): string | null {
  return plan?.id != null ? String(plan.id) : null;
}

/**
 * Postup přípravy, nebo `undefined`.
 *
 * `instructions_cs` doplňuje /api/profile z `recipes_catalog` — v uloženém
 * plánu postup není. Když ho recept nemá, vrací se `undefined` a modal sekci
 * vůbec nevykreslí. Žádný náhradní text: „Připravte si všechny čerstvé
 * suroviny podle gramáže" není recept.
 */
function naRecept(recept: any): RecipeDetail | undefined {
  const kroky = pouzitelneKroky(recept?.instructions_cs);
  if (kroky.length === 0) return undefined;

  const minuty = Number(recept?.prep_minutes);
  return {
    instructions: kroky,
    prepTimeMin: Number.isFinite(minuty) && minuty > 0 ? Math.round(minuty) : null
  };
}

/** Jídla jednoho dne plánu — sdílené jádro `naJidla()` i `naJidlaTydne()`. */
function mealyDne(struktura: any, den: any, planId: string | null): MealItem[] {
  if (!den || !Array.isArray(den.meals)) return [];

  const planDay = indexDne(struktura, den);

  let svaciny = 0;
  return den.meals.map((m: any, i: number) => {
    const jeSvacina = String(m?.type).toLowerCase() === 'snack';
    const typ = typJidla(m?.type, jeSvacina ? svaciny++ : 0);
    const recept = m?.recipe || {};
    return {
      // POZOR: `catalog_id` NENÍ napříč týdnem unikátní (recept smí patřit
      // do jídelníčku 2× týdně, docs/DALSI_KROK.md 8.14) — jako klíč napříč
      // dny (React key, cíl odškrtávání) proto slouží dvojice
      // `planDay` + `activityKey` z `MealItem`, ne tohle `id`. Tohle `id`
      // zůstává jedinečné jen v rámci jednoho dne.
      id: String(m?.catalog_id ?? m?.recipe_id ?? `${den.date}-${i}`),
      type: typ,
      time: CAS_JIDLA[typ],
      title: m?.display_name_cs || m?.name_cs || recept.title_cs || recept.title || 'Jídlo',
      calories: cislo(m?.kcal),
      protein: cislo(m?.protein_g),
      carbs: cislo(m?.carbs_g),
      fat: cislo(m?.fat_g),
      completed: false,
      planId,
      planDay,
      activityKey: mealActivityKey(m, i),
      ingredients: Array.isArray(m?.shopping_ingredient_lines)
        ? m.shopping_ingredient_lines.map(String)
        : (Array.isArray(recept.ingredients)
            ? recept.ingredients.map((s: any) => String(s?.original || s?.name || ''))
            : []),
      recipe: naRecept(recept)
    } as MealItem;
  });
}

/** Jeden den týdenního jídelníčku — docs/DALSI_KROK.md 8.14. */
export interface TydenniDenJidel {
  datum: string;
  denNazev: string;
  jeDnes: boolean;
  meals: MealItem[];
}

/**
 * Jídelníček za VŠECHNY dny plánu, ne jen dnešek.
 *
 * `jeDnes` kopíruje výběr `dnesniDen()` včetně jejího záskoku na první den,
 * když plán dnešek nepokrývá — proto `naJidla()` níž smí být prostě
 * `naJidlaTydne(plan).find(d => d.jeDnes)`, beze ztráty toho chování.
 */
export function naJidlaTydne(plan: any): TydenniDenJidel[] {
  const struktura = strukturaPlanu(plan);
  const dny = struktura?.days;
  if (!Array.isArray(dny) || dny.length === 0) return [];

  const planId = idPlanu(plan);
  const vybranyDnes = dnesniDen(struktura);

  return dny.map((den: any) => ({
    datum: String(den?.date ?? ''),
    denNazev: String(den?.day_name ?? ''),
    jeDnes: den === vybranyDnes,
    meals: mealyDne(struktura, den, planId)
  }));
}

export function naJidla(plan: any): MealItem[] {
  return naJidlaTydne(plan).find((d) => d.jeDnes)?.meals ?? [];
}

const ZKRATKY: Record<string, string> = {
  'Pondělí': 'Po', 'Úterý': 'Út', 'Středa': 'St', 'Čtvrtek': 'Čt',
  'Pátek': 'Pá', 'Sobota': 'So', 'Neděle': 'Ne'
};

/** Kanonické pořadí dnů v týdnu — dny plánu chodí v pořadí API, ne Po–Ne. */
const PORADI_DNU_V_TYDNU = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

/**
 * caloriesBurned, restSec a targetMuscle generator NEVRACI. Zamerne se
 * nedopocitavaji odhadem - UI je pri nulove hodnote skryje. Radsi nic nez
 * vymyslene cislo u zdravotnich dat.
 *
 * VŠECH SEDM DNŮ, NE JEN TY S TRÉNINKEM — docs/DALSI_KROK.md 8.14. Dřív se
 * filtrovaly pryč dny bez `workout`, takže tříденní plán vrátil pole o
 * délce 3 a „Týdenní rozpis" ukázal tři dlaždice s dírou mezi nimi — den
 * volna vypadal, jako by v týdnu vůbec nebyl. Den volna je teď dlaždice
 * jako každá jiná (`maTrenink: false`, `title: 'Volno'`, bez cviků), a
 * `jeNaplanovany()` (lib/trenink.ts) ji podle `maTrenink` pozná od
 * skutečného tréninku.
 *
 * Výstup se navíc řadí Po–Ne, protože `struktura.days` chodí v pořadí, ve
 * kterém plán začíná (`valid_from`), ne nutně od pondělí.
 */
export function naTreninky(plan: any): WorkoutDay[] {
  const struktura = strukturaPlanu(plan);
  const dny = struktura?.days;
  if (!Array.isArray(dny)) return [];

  const dnes = new Date().toISOString().slice(0, 10);
  const planId = idPlanu(plan);

  const vsechny = dny.map((d: any) => {
    // Index se bere z puvodniho pole dnu, at uz je vysledne poradi jakekoli.
    const planDay = indexDne(struktura, d);
    const w = d?.workout;
    const maTrenink = !!(w && Array.isArray(w.exercises) && w.exercises.length > 0);

    const cviky: ExerciseItem[] = maTrenink
      ? w.exercises.map((e: any, i: number) => ({
        id: String(e?.canonical_key || `${d.date}-cvik-${i}`),
        name: e?.display_name_cs || e?.name_cs || e?.name || 'Cvik',
        sets: cislo(e?.sets),
        reps: String(e?.reps ?? ''),
        restSec: 0,
        // Svalovou skupinu doplňuje /api/profile z `exercise_asset_registry`
        // (viz lib/profile/svalyDoPlanu.js). Dřív tu byl prázdný řetězec,
        // takže UI nemělo u cviku co zobrazit.
        targetMuscle: svalCesky(e?.primary_muscle) ?? '',
        // UKÁZKA PROVEDENÍ. Plán ji nese u každého cviku jako `gif_url`
        // z ExerciseDB, ale UI ji nikde nezobrazovalo — člověk viděl jen
        // název a musel si domýšlet, jak se cvik dělá.
        ukazkaUrl: String(e?.gif_url || e?.image_url || '') || undefined,
        completed: false,
        planId,
        planDay,
        activityKey: klicCviku(i)
      }))
      : [];

    return {
      planId,
      planDay,
      // Cely trenink ma vlastni klic vedle jednotlivych cviku (cvik#0, cvik#1…).
      activityKey: KLIC_CELEHO_TRENINKU,
      dayName: String(d?.day_name || ''),
      dayShort: ZKRATKY[String(d?.day_name)] || String(d?.day_name || '').slice(0, 2),
      title: maTrenink ? (w?.workout_name || 'Trénink') : 'Volno',
      durationMin: maTrenink ? cislo(w?.duration_minutes) : 0,
      caloriesBurned: 0,
      isToday: String(d?.date) === dnes,
      isCompleted: false,
      // ZAMĚŘENÍ SE SKLÁDÁ ZE CVIKŮ, NEOPISUJE NÁZEV.
      // Dřív tu bylo `Varianta ${start_program_variant}`, takže pod
      // nadpisem „Trénink B" stálo „Fokus: Varianta B" — tatáž informace
      // podruhé. Teď se vypíšou svalové skupiny, které ten den přijdou
      // na řadu, a když pokrývají horní i dolní půlku, řekne se rovnou,
      // že je to celotělový trénink.
      focus: maTrenink ? (zamereniTreninku(w.exercises) ?? '') : '',
      naradi: maTrenink ? naradiTreninku(w.exercises) : undefined,
      maTrenink,
      exercises: cviky
    } as WorkoutDay;
  });

  return vsechny.sort((a: WorkoutDay, b: WorkoutDay) => {
    const ia = PORADI_DNU_V_TYDNU.indexOf(a.dayName);
    const ib = PORADI_DNU_V_TYDNU.indexOf(b.dayName);
    return (ia === -1 ? PORADI_DNU_V_TYDNU.length : ia) - (ib === -1 ? PORADI_DNU_V_TYDNU.length : ib);
  });
}

/**
 * Klíč pro porovnání odškrtnutí. Musí obsahovat i den a plán — jinak by se
 * včerejší odškrtnutí namapovalo na dnešek, protože `activity_key` je
 * u každého dne stejný (`snack#2`, `cvik#0`…).
 */
function klicDokonceni(
  planId: string | null | undefined,
  planDay: number | null | undefined,
  typ: string,
  klic: string
): string {
  return `${planId ?? ''}|${planDay ?? ''}|${typ}|${klic}`;
}

/** Množina odškrtnutých aktivit z odpovědi serveru. */
export function mnozinaDokonceni(radky: DokonceniAktivity[] = []): Set<string> {
  const s = new Set<string>();
  for (const r of radky || []) {
    if (!r?.activity_type || !r?.activity_key) continue;
    s.add(klicDokonceni(r.plan_id, r.plan_day, r.activity_type, r.activity_key));
  }
  return s;
}

/** Je tahle položka odškrtnutá podle serveru? */
export function jeHotovo(
  polozka: { planId?: string | null; planDay?: number; activityKey?: string },
  typ: 'meal' | 'workout',
  hotove: Set<string>
): boolean {
  if (!polozka?.activityKey || polozka.planDay === undefined) return false;
  return hotove.has(klicDokonceni(polozka.planId, polozka.planDay, typ, polozka.activityKey));
}

/**
 * Výchozí stav odškrtnutí ze serveru. Bez tohohle začínalo UI vždy na
 * nule a po refreshi zmizelo, co uživatel odklikal.
 */
export function pouzijDokonceni<T extends { planId?: string | null; planDay?: number; activityKey?: string; completed?: boolean }>(
  polozky: T[],
  typ: 'meal' | 'workout',
  hotove: Set<string>
): T[] {
  return polozky.map((p) => ({ ...p, completed: jeHotovo(p, typ, hotove) }));
}

/** Trénink: cviky i příznak celého dne. */
export function pouzijDokonceniTreninku(dny: WorkoutDay[], hotove: Set<string>): WorkoutDay[] {
  return dny.map((den) => ({
    ...den,
    isCompleted: jeHotovo(den, 'workout', hotove),
    exercises: pouzijDokonceni(den.exercises, 'workout', hotove)
  }));
}

/**
 * Tělesné složení z odpovědi serveru. Vrací null, když měření nemáme —
 * karta se pak nezobrazuje vůbec, místo aby ukazovala nuly.
 */
export function naTelesneSlozeni(odpoved: ProfilOdpoved): TelesneSlozeni | null {
  return odpoved?.body_composition ?? null;
}

/**
 * Číslo pro UI. Chybějící hodnota je „—", nikdy 0.
 *
 * ZAOKROUHLUJE SE AŽ PŘI ZOBRAZENÍ. Apple Health i Withings posílají plnou
 * přesnost (změřeno: 103.02100372314453 kg) a v databázi má zůstat — jen se
 * nemá vypisovat. Váha, tuk, svaly a BMI na jedno desetinné místo, bazální
 * metabolismus na celé.
 *
 * Koncová nula se NEUŘEZÁVÁ: „103,0 kg" vedle „14,7 %" drží stejnou šířku
 * a odpovídá tomu, na kolik míst hodnotu opravdu známe.
 */
export function hodnotaNeboPomlcka(
  hodnota: number | null | undefined,
  jednotka = '',
  desetinnych = 1
): string {
  if (hodnota === null || hodnota === undefined || !Number.isFinite(hodnota)) return '—';
  const cislo = Number(hodnota).toFixed(desetinnych).replace('.', ',');
  return jednotka ? `${cislo} ${jednotka}` : cislo;
}

/**
 * Popisek pod dlaždicí: jednotka a k ní cíl, pokud nějaký opravdu máme.
 *
 * Cíle chodí z /api/health. Když tam nejsou, dlaždice ukáže jen jednotku —
 * cíl se nevymýšlí a nula se nevydává za cíl. Před Etapou 3.7 tu byly
 * natvrdo psané „cíl 1 500" a „cíl 60,0" vedle polí, která ve stejném
 * souboru o pár řádků výš správně krmila graf.
 */
export function popisekCile(jednotka: string, cil: number | null | undefined): string {
  const maCil = cil !== null && cil !== undefined && Number.isFinite(cil) && cil > 0;
  if (!maCil) return jednotka;

  const cislo = Number(cil).toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
  return jednotka ? `${jednotka} (cíl ${cislo})` : `cíl ${cislo}`;
}

/** Změna proti minulému měření se znaménkem. Bez druhého měření prázdno. */
export function zmenaText(zmena: number | null | undefined, jednotka = '', desetinnych = 1): string | null {
  if (zmena === null || zmena === undefined || !Number.isFinite(zmena)) return null;
  const z = Number(zmena);
  const znamenko = z > 0 ? '+' : '';
  return `${znamenko}${z.toFixed(desetinnych).replace('.', ',')}${jednotka ? ' ' + jednotka : ''}`;
}

/** "21. 8. v 18:00" — u karty musí být vidět, kdy se měřilo. */
export function kdyMereno(iso: string | null | undefined): string {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Hodnoty, ktere umi prijmout /api/profile-preferences a /api/profile-settings. */
export interface NastaveniProfilu {
  goal: string;
  activity: string;
  stress_level: string;
  occupation: string;
  frequency: string;
  workout_days: number[];
  diet_type: string;
  dietary_restrictions: string;
  foods_to_avoid: string;
  training_environment: string;
  available_equipment: string[];
  training_environment_detail: string;
  selected_habits: string[];
  goal_weight_kg: string;
  height_cm: string;
}

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** Tréninkové dny umí přijít jako pole i jako "1,3,5". */
function naDny(v: unknown): number[] {
  const zdroj = Array.isArray(v)
    ? v
    : typeof v === 'string' && v
      ? v.split(',')
      : [];
  return zdroj
    .map((d) => Number(String(d).trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

/**
 * Současné nastavení pro předvyplnění formuláře. Bere se z posledního
 * body_metrics (to je zdroj, který /api/profile-preferences mění) a z profilu.
 */
export function naNastaveniProfilu(odpoved: ProfilOdpoved): NastaveniProfilu {
  const bm: any = odpoved?.body_metrics?.[0] || {};

  return {
    goal: text(bm.goal),
    activity: text(bm.activity),
    stress_level: text(bm.stress_level),
    occupation: text(bm.occupation),
    frequency: text(bm.freq_choice),
    workout_days: naDny(bm.workout_days),
    diet_type: text(bm.diet_type),
    dietary_restrictions: text(bm.dietary_restrictions),
    foods_to_avoid: text(bm.foods_to_avoid),
    training_environment: text(parseTrainingEnvironment(bm)),
    available_equipment: parseAvailableEquipment(bm) || [],
    training_environment_detail: text(parseTrainingEnvironmentDetail(bm)),
    selected_habits: (odpoved?.user_habits || []).map((h) => h.habit_id),
    goal_weight_kg: text(odpoved?.user?.goal_weight_kg),
    height_cm: text(odpoved?.user?.height_cm ?? bm.height_cm)
  };
}

/**
 * Řekne, jestli řetězec nese časovou zónu (`Z`, nebo posun jako `+02:00`
 * za částí s časem).
 *
 * Bez zóny je `Date.parse` nespolehlivý — ISO řetězec bez zóny bere jako
 * lokální čas PROSTŘEDÍ, KTERÉ HO PARSUJE (prohlížeč uživatele, nebo Node
 * v testu), ne jako čas v UTC, ve kterém je `ai_messages.created_at`
 * doopravdy uložený (sloupec je `timestamp without time zone`, zapisuje ho
 * server přes `now()`/JS ISO). Přesně tohle způsobilo dvouhodinový posun
 * z docs/DALSI_KROK.md 6.6: `"2026-08-31T00:04:30.12"` vzniklo v 00:04 UTC
 * (= 02:04 v Praze), ale prohlížeč ho zobrazil jako 00:04.
 *
 * Neopravujeme si datum sami (třeba přilepením `Z`) — to by tichým dohadem
 * mohlo vzniknout jiné datum, než jaké server myslel. Radši zprávu bez
 * zóny vůbec neukázat, stejně jako zprávu s nepoužitelným datem níž.
 */
function maCasovouZonu(hodnota: unknown): boolean {
  if (typeof hodnota !== 'string') return false;
  const casovaCast = hodnota.split('T')[1];
  if (!casovaCast) return false;
  return /Z$|[+-]\d{2}:?\d{2}$/.test(casovaCast);
}

/**
 * Zprávy trenéra ze serveru. Prázdné pole = žádná zpráva a banner se
 * nezobrazí — to je platný stav, ne chyba napojení.
 *
 * Změřeno v produkci: `ai_trigger_rules` má enabled=true jen
 * `user_registered -> initial_plan`, takže nové coach zprávy zatím
 * nevznikají a u většiny lidí bude prázdno.
 */
/** Po kolika dnech přestává být zpráva od trenéra aktuální. */
export const PLATNOST_ZPRAVY_DNI = 7;

export function naZpravyTrenera(odpoved: ProfilOdpoved): CoachTip[] {
  const hranice = Date.now() - PLATNOST_ZPRAVY_DNI * 24 * 60 * 60 * 1000;

  return (odpoved?.coach_messages || [])
    .filter((z) => String(z?.content || '').trim())
    // ZASTARALÉ ZPRÁVY SE NEUKAZUJÍ. Uvítací zpráva z registrace říká „Dnes
    // začni tím, že si připravíš první jídlo z plánu" — po třech týdnech to
    // pořád svítilo nahoře v profilu jako dnešní pokyn. Datum u ní bylo, ale
    // karta ho svým umístěním přebíjela. Nové zprávy zatím nevznikají
    // (`ai_trigger_rules` má enabled jen `user_registered -> initial_plan`),
    // takže po týdnu je banner prázdný — a to je poctivější než tři týdny
    // starý pokyn tvářící se jako aktuální.
    .filter((z) => {
      // Datum bez zóny je nepoužitelné, ne jen zobrazené o dvě hodiny vedle
      // — viz docs/DALSI_KROK.md 6.6 a maCasovouZonu výš.
      if (!maCasovouZonu(z?.created_at)) return false;
      const t = Date.parse(String(z?.created_at || ''));
      // Zpráva bez použitelného data je podezřelá — radši ji neukazujeme.
      return Number.isFinite(t) && t >= hranice;
    })
    .map((z) => ({
      id: String(z.id),
      headline: String(z.title || '').trim() || 'Zpráva od trenéra',
      content: String(z.content).trim(),
      timestamp: kdyMereno(z.created_at)
    }));
}

const IKONY: Record<string, HabitItem['iconType']> = {
  healthy_diet: 'food', quality_sleep: 'sleep', hydration: 'water',
  daily_movement: 'steps', training: 'steps', meditation: 'mind',
  breathing: 'mind', mobility_stretch: 'mind', cold_shower: 'water',
  digital_detox_evening: 'mind'
};

/** Dnešek v Europe/Prague — stejná hranice dne, jakou hlídá api/habits.js. */
export function dnesekPraha(): string {
  return calendarDateIsoInPrague();
}

/**
 * ISO datum na český tvar „20. 8. 2026". Prázdný vstup dá „—".
 *
 * Skládá se ze složek ISO řetězce, ne přes `new Date(iso)` — ten by řetězec
 * vzal jako půlnoc UTC a v Praze z něj udělal předchozí den.
 */
export function datumCesky(iso: string | null | undefined): string {
  if (!iso) return '—';

  const [rok, mesic, den] = iso.slice(0, 10).split('-');
  if (!rok || !mesic || !den) return '—';

  return `${Number(den)}. ${Number(mesic)}. ${rok}`;
}

/**
 * Návyky splněné dnes. Server posílá `habit_logs_progress` od registrace,
 * tady z toho zbyde jen dnešek — jen ten jde v UI měnit.
 */
export function dnesniNavyky(logy: ZaznamNavyku[] = [], dnes = dnesekPraha()): Set<string> {
  const s = new Set<string>();
  for (const l of logy || []) {
    if (l?.completed !== true) continue;
    if (String(l.log_date).slice(0, 10) !== dnes) continue;
    s.add(String(l.habit_id));
  }
  return s;
}

/**
 * SÉRIE (STREAKY) TU NEJSOU SCHVÁLNĚ. `habit_logs` nese jen `log_date`,
 * `habit_id`, `completed` a `notes` — žádnou sérii. Dřív se `streakDays`
 * dopočítávalo v prohlížeči z ničeho: každé odškrtnutí přičetlo den, každé
 * zrušení odečetlo, takže číslo neodpovídalo žádnému měření.
 */
export function naNavyky(
  userHabits: ProfilOdpoved['user_habits'] = [],
  hotoveDnes: Set<string> = new Set()
): HabitItem[] {
  return (userHabits || [])
    .filter((h) => h.is_positive)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((h) => {
      const def: any = POSITIVE_HABITS.find((p: any) => p.id === h.habit_id);
      return {
        id: h.habit_id,
        title: def?.label || h.habit_id,
        subtitle: def?.description,
        completed: hotoveDnes.has(h.habit_id),
        iconType: IKONY[h.habit_id] || 'mind'
      } as HabitItem;
    });
}

export function naZlozvyky(userHabits: ProfilOdpoved['user_habits'] = []): BadHabitItem[] {
  return (userHabits || [])
    .filter((h) => !h.is_positive)
    .map((h) => {
      const def: any = NEGATIVE_HABITS.find((p: any) => p.id === h.habit_id);
      return {
        id: h.habit_id,
        title: def?.label || h.habit_id,
        description: def?.description || '',
        status: 'clean'
      } as BadHabitItem;
    });
}

export function naProfil(odpoved: ProfilOdpoved): UserProfile {
  const bm = odpoved.body_metrics?.[0] || {};
  const program = String(odpoved.program || 'START');
  const stav = String(odpoved.membershipStatus || '');
  return {
    name: odpoved.user?.name || bm.name || odpoved.user?.email?.split('@')[0] || 'Můj profil',
    /*
     * TRIAL NENÍ „AKTIVNÍ". Do 29. 8. 2026 se `trial` mapoval na „AKTIVNÍ"
     * až do posledního dne, takže se člověk o konci dozvěděl tím, že mu
     * přestal chodit plán. Zbývající dny nese `odpoved.trial`, aby si je
     * UI nedopočítávalo z datumů samo.
     */
    status: stav === 'active' ? 'AKTIVNÍ' : stav === 'trial' ? 'TRIAL' : 'PAUZOVÁNO',
    trialDniDoKonce: odpoved.trial?.dny_do_konce ?? null,
    avatarUrl: odpoved.user?.avatar_url || '',
    membershipPlan: NAZVY_PROGRAMU[program] || program,
    nextConsultationDate: '',
    subtitle: bm.goal ? String(bm.goal) : undefined
  };
}

/**
 * Ukázka zamčeného týdne pro paywall.
 *
 * Bere jídla PRVNÍHO dne, ne dnešního: ukázka je na příští týden, takže
 * „dnešek" v ní neexistuje. Účel je ukázat konkrétní jídla a konkrétní čísla —
 * paywall bez obsahu prodává slib, ne produkt.
 */
export function naZamcenyPlan(odpoved: ProfilOdpoved): ZamcenyPlan | null {
  const z = odpoved.zamceny_plan;
  if (!z) return null;

  const struktura = strukturaPlanu({ structured_plan_json: z.structured_plan_json });
  const prvniDen = struktura?.days?.[0];
  const jidla = Array.isArray(prvniDen?.meals) ? prvniDen.meals : [];

  let svaciny = 0;
  return {
    validFrom: z.valid_from,
    validUntil: z.valid_until,
    dailyCalories: z.daily_calories,
    ukazkaJidel: jidla.map((m: any) => {
      const jeSvacina = String(m?.type).toLowerCase() === 'snack';
      const recept = m?.recipe || {};
      return {
        typ: typJidla(m?.type, jeSvacina ? svaciny++ : 0),
        nazev: m?.display_name_cs || m?.name_cs || recept.title_cs || recept.title || 'Jídlo',
        kcal: cislo(m?.kcal),
      };
    }),
    zamceno: z.zamceno !== false,
    // Prázdný paywall je horší než špatný — nesmí vzniknout stav bez jediné
    // cesty k platbě. Chybějící/prázdné pole (starší odpověď serveru) spadne
    // na START, ne na nic.
    dostupneTiery: Array.isArray(z.dostupne_tiery) && z.dostupne_tiery.length > 0
      ? z.dostupne_tiery
      : ['START'],
  };
}

export function naPreference(odpoved: ProfilOdpoved, puvodni: UserPreferences): UserPreferences {
  const bm = odpoved.body_metrics?.[0] || {};
  const plan = strukturaPlanu(vyberPlan(odpoved.plans));
  const t = plan?.targets || {};

  // POŘADÍ ZDROJŮ: uložený cíl z `body_metrics` je zdroj pravdy, plán je záloha.
  //
  // Dřív se bralo `t.*` (cíl zamrzlý v jídelníčku) a `body_metrics` až potom.
  // Plán je ale otisk cíle v okamžiku generování — jakmile se cíl změní,
  // profil dál ukazoval staré číslo z plánu. Měřeno 23. 8. 2026:
  // uložený cíl B 185 g, plán z 20. 8. B 158 g, profil ukazoval 158 g.
  // Makra se určují jednou při registraci a odsud je bere celá aplikace.
  const kcal = cislo(bm.calories_target ?? t.calories_per_day, puvodni.dailyCalorieTarget);
  const bilkoviny = cislo(bm.protein_target_g ?? t.protein_g);
  const sacharidy = cislo(bm.carbs_target_g ?? t.carbs_g);
  const tuky = cislo(bm.fat_target_g ?? t.fat_g);
  const zKcal = (g: number, koef: number) => (kcal > 0 ? Math.round((g * koef * 100) / kcal) : 0);

  return {
    ...puvodni,
    dailyCalorieTarget: kcal,
    proteinRatioPercent: bilkoviny ? zKcal(bilkoviny, 4) : puvodni.proteinRatioPercent,
    carbsRatioPercent: sacharidy ? zKcal(sacharidy, 4) : puvodni.carbsRatioPercent,
    fatRatioPercent: tuky ? zKcal(tuky, 9) : puvodni.fatRatioPercent,
    // GRAMY ULOŽENÉ, NE DOPOČÍTANÉ Z PROCENT.
    //
    // `proteinRatioPercent` výš je zaokrouhlený podíl (`zKcal`) — dopočítat
    // z něj gramy zpátky (`denniMakra` v lib/makra.ts) zaokrouhluje podruhé.
    // Změřeno 31. 8. 2026: uloženo B 189 g, profil ukazoval 191 g. Tahle
    // trojice nese přesné uložené číslo, aby ho `denniMakra` mohlo použít
    // místo dopočtu (docs/DALSI_KROK.md 7.2b). `null`, když nemáme co uložit —
    // `denniMakra` pak spadne na starý dopočet z procent.
    proteinTargetG: bilkoviny > 0 ? bilkoviny : puvodni.proteinTargetG,
    carbsTargetG: sacharidy > 0 ? sacharidy : puvodni.carbsTargetG,
    fatTargetG: tuky > 0 ? tuky : puvodni.fatTargetG,
    currentHeightCm: cislo(odpoved.user?.height_cm ?? bm.height_cm, puvodni.currentHeightCm),
    targetWeightKg: cislo(odpoved.user?.goal_weight_kg, puvodni.targetWeightKg),
    weeklyWorkoutsTarget: cislo(bm.weekly_sessions, puvodni.weeklyWorkoutsTarget)
  };
}

export interface NesouladCile {
  /** Aktuální kalorický cíl z preferencí (`body_metrics.calories_target`). */
  cilKcal: number;
  /** Cíl, na který je postavený aktivní jídelníček (`ai_generated_plans.daily_calories`). */
  planKcal: number;
}

/**
 * CÍL V PREFERENCÍCH A CÍL, NA KTERÝ JE POSTAVENÝ JÍDELNÍČEK, SE MOHOU ROZEJÍT.
 *
 * Plán je otisk cíle v okamžiku generování — kdyz se cíl v `body_metrics`
 * později změní (např. po opravě výšky, 6.5), plán se sám nepřegeneruje.
 * Watchdog to hlásí (`calorie_target_mismatch`, view `system_health_alerts`),
 * detekce tedy existuje; tohle je tatáž kontrola na klientovi, aby ji uživatel
 * VIDĚL na profilu i v jídelníčku, ne jen v interním alertu, který nikdo nečte.
 *
 * Změřeno 31. 8. 2026: cíl 2634 kcal, aktivní plán (27. 8. – 2. 9.) 2164 kcal.
 * `null`, když čísla sedí nebo když nemáme co porovnat (docs/DALSI_KROK.md 7.2a).
 *
 * NÁVRH (docs/DALSI_KROK.md 8.1, bod 3) — NEIMPLEMENTOVÁNO: tahle funkce
 * pořád počítá nesoulad při KAŽDÉM zobrazení profilu, z aktuálních čísel na
 * klientovi, ne ze skutečné události. Od `target_changed`
 * (`lib/calorieTargetIntegrity.js`) by šlo přejít na dotaz „existuje pro
 * uživatele otevřený `ai_tasks` řádek s `task_type = 'adjust_plan'` a
 * `source_event_id` ukazujícím na `target_changed`?" — `GET /api/profile`
 * by ho přidal do `ProfilOdpoved` a `nesouladCile()` by ho jen četla, misto
 * aby si sama počítala rozdíl. Výhoda: banner by zmizel přesně ve chvíli,
 * kdy se úloha vyřídí (dnes zmizí, jen když se čísla shodou okolností srovnají),
 * a nesl by frontovaný kontext (starý/nový cíl, zdroj změny), ne jen dvě
 * kcal čísla.
 *
 * PROČ SE TO NEDĚLÁ TEĎ: `target_changed → adjust_plan` je v
 * `ai_trigger_rules` `enabled = false` (migrace `20260901090000`) a
 * `lib/aiDecisionEngine.js` navíc `target_changed` jako trigger_type vůbec
 * nezná (viz komentář v migraci) — dokud se to nezapne a nedoplní, žádný
 * `ai_tasks` řádek by nevznikl a banner by tiše zmizel i tam, kde je cíl
 * fakt jinde než plán. Radši nechat klientské porovnání, dokud funguje a
 * lidem se zobrazuje, než ho nahradit zdrojem, který zatím nic nevyrábí.
 */
export function nesouladCile(odpoved: ProfilOdpoved, cilKcal: number): NesouladCile | null {
  const plan = vyberPlan(odpoved.plans);
  const planKcal = cislo(plan?.daily_calories, 0);
  if (!(cilKcal > 0) || !(planKcal > 0) || planKcal === cilKcal) return null;
  return { cilKcal, planKcal };
}

/** Věk v celých letech z data narození. `null`, když datum chybí nebo je nesmyslné. */
export function vekZDataNarozeni(birthDate: string | null | undefined): number | null {
  const t = Date.parse(String(birthDate || ''));
  if (!Number.isFinite(t)) return null;
  const nar = new Date(t);
  const dnes = new Date();
  let vek = dnes.getFullYear() - nar.getFullYear();
  const m = dnes.getMonth() - nar.getMonth();
  if (m < 0 || (m === 0 && dnes.getDate() < nar.getDate())) vek--;
  return vek >= 0 && vek < 130 ? vek : null;
}

/**
 * Vážení pro graf vývoje váhy.
 *
 * ČTE SE `weight_history` ZE SERVERU, ne `body_metrics`.
 *
 * `body_metrics` je snapshot z registrace a z ručních zápisů — u uživatele
 * s chytrou váhou je tam jediný řádek. Změřeno 23. 8. 2026: 1 vážení
 * v `body_metrics` proti 46 v `body_measurements`, kam zapisuje Withings
 * cron i Apple Health. Graf proto ukazoval jeden bod a tvářil se, že víc
 * měření není.
 *
 * Server obě tabulky slučuje v `sestavHistoriiVah` (jeden bod na den, při
 * více měřeních vyhrává pozdější čas, den se počítá v Europe/Prague) a vrací
 * je jako `weight_history`. Do 23. 8. to pole nečetl nikdo — stejný případ
 * jako `withings_body_snapshots` a `apple_health_metrics_daily`.
 *
 * Bez dat prázdné pole — graf se skryje.
 */
export function naVazeni(odpoved: ProfilOdpoved): WeightRecord[] {
  const historie = (odpoved as { weight_history?: { date?: string; weight?: number }[] })
    ?.weight_history;

  if (Array.isArray(historie) && historie.length > 0) {
    return historie
      .filter((z) => z?.date && z?.weight != null)
      .map((z) => ({
        date: String(z.date).slice(0, 10),
        weight: cislo(z.weight),
        // Tuk a svaly do grafu váhy nepatří a `weight_history` je nenese —
        // složení těla má vlastní kartu z withings_body_snapshots.
        fatPercent: 0,
        muscleKg: 0,
        bmi: 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Záloha pro starší odpověď serveru, která `weight_history` ještě neposílá.
  //
  // DEN SE POČÍTÁ V EUROPE/PRAGUE, NE `slice(0, 10)` Z UTC ŘETĚZCE.
  // `body_metrics.created_at` je uložený v UTC (docs/DALSI_KROK.md 6.10) —
  // vážení mezi 22:00 a 24:00 UTC (= 00:00–02:00 v Praze) by syrový UTC
  // řetězec zařadilo pod předchozí den. `calendarDateIsoInPrague` navíc
  // potřebuje řetězec se zónou, aby ho `new Date(...)` neparsoval jako
  // lokální čas prohlížeče/testu — stejný důvod jako u `maCasovouZonu`
  // výš (docs/DALSI_KROK.md 6.6). Řádek bez zóny se proto přeskočí, ne
  // odhaduje. Neplatné datum se zónou (poškozený řádek) by jinak
  // `calendarDateIsoInPrague` tiše nahradilo dneškem — proto se ověřuje
  // i parsovatelnost, ne jen přítomnost zóny.
  return (odpoved.body_metrics || [])
    .filter(
      (m) =>
        m?.weight_kg != null &&
        maCasovouZonu(m?.created_at) &&
        Number.isFinite(Date.parse(String(m.created_at)))
    )
    .map((m) => ({
      date: calendarDateIsoInPrague(String(m.created_at)),
      weight: cislo(m.weight_kg),
      fatPercent: 0,
      muscleKg: 0,
      bmi: cislo(m.bmi)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Kategorie odhadujeme z nazvu suroviny - jen pro serazeni v seznamu. */
function kategorieSuroviny(nazev: string): ShoppingItem['category'] {
  const n = nazev.toLowerCase();
  if (/kuř|krůt|hověz|vepř|losos|ryb|krevet|tuňák|šunk|klobás/.test(n)) return 'Maso & Ryby';
  if (/mlék|jogurt|tvaroh|sýr|cottage|smetan|vejc|ricott|feta|skyr/.test(n)) return 'Mléčné výrobky & Vejce';
  if (/chléb|pečiv|rýže|těstovin|brambor|batát|ovesn|vločk|quinoa|couscous|tortil/.test(n)) return 'Přílohy & Pečivo';
  if (/zeleni|salát|rajč|okurk|paprik|cuket|brokol|špenát|ovoc|jablk|banán|bobul|boruvk|malin|kiwi|pomeranč|avokád|cibul|česnek|mrkev/.test(n)) return 'Zelenina & Ovoce';
  return 'Ořechy, Tuky & Ostatní';
}

/**
 * Nakupni seznam za cely tyden. Stejna surovina z vice jidel se slucuje
 * podle nazvu; mnozstvi se scita jen kdyz sedi jednotka.
 */
export function naNakupniSeznam(plan: any): ShoppingItem[] {
  const dny = strukturaPlanu(plan)?.days;
  if (!Array.isArray(dny)) return [];

  // Klíč je název + KANONICKÁ jednotka, ne její zapsaný tvar. „5 plátků",
  // „2 plátky" a „1 plátek" je totéž a musí se sečíst; „g" a „lžíce" ne.
  const soucet = new Map<
    string,
    { nazev: string; mnozstvi: Map<string, number>; bezMnozstvi: boolean }
  >();

  for (const den of dny) {
    for (const jidlo of den?.meals || []) {
      for (const radek of jidlo?.shopping_ingredient_lines || []) {
        const rozbor = rozeberRadekSuroviny(String(radek));
        if (!rozbor) continue;

        const klic = rozbor.nazev.toLowerCase();
        const zaznam = soucet.get(klic)
          || { nazev: rozbor.nazev, mnozstvi: new Map<string, number>(), bezMnozstvi: false };

        if (rozbor.mnozstvi === null) {
          // Řádek bez množství se nikam nesčítá a hlavně se nevypisuje jako
          // množství — dřív tu svítilo „mandle, mandle, mandle".
          zaznam.bezMnozstvi = true;
        } else {
          const { typ, klic: jednotka } = normalizujJednotku(rozbor.jednotka);
          const kanon = typ === 'zadna' ? 'ks' : jednotka;
          zaznam.mnozstvi.set(kanon, (zaznam.mnozstvi.get(kanon) ?? 0) + rozbor.mnozstvi);
        }

        soucet.set(klic, zaznam);
      }
    }
  }

  return Array.from(soucet.values()).map((z, i) => ({
    id: `nakup-${i}`,
    name: z.nazev,
    amount: mnozstviDoTextu(z.mnozstvi),
    category: kategorieSuroviny(z.nazev),
    checked: false
  }));
}

/** Číslo do seznamu: celá čísla bez desetin, zbytek na jedno místo s čárkou. */
function formatujMnozstvi(n: number): string {
  const zaokrouhlene = Math.round(n * 10) / 10;
  return Number.isInteger(zaokrouhlene)
    ? String(zaokrouhlene)
    : zaokrouhlene.toFixed(1).replace('.', ',');
}

/**
 * Součty do textu. Jedna jednotka = jedno číslo, víc jednotek se spojí
 * plusem — sečíst gramy s lžícemi nejde a odhadovat převod by znamenalo
 * vymyslet si číslo.
 */
function mnozstviDoTextu(mnozstvi: Map<string, number>): string {
  const casti: string[] = [];
  for (const [jednotka, hodnota] of mnozstvi) {
    if (!(hodnota > 0)) continue;
    const cislo = formatujMnozstvi(hodnota);
    const zaokrouhlene = Math.round(hodnota * 10) / 10;
    const slovo = tvarJednotky(jednotka, zaokrouhlene);
    casti.push(slovo ? `${cislo} ${slovo}` : `${cislo} ${jednotka}`);
  }
  // Prázdný řetězec, ne název suroviny. Množství, které neznáme, se nevypisuje.
  return casti.join(' + ');
}

/**
 * Rozbor jednoho řádku suroviny na název, množství a jednotku.
 *
 * Musí zvládnout několik tvarů najednou, protože uložené plány jsou zmražené
 * v té podobě, jakou uměl kód v době generování:
 *
 *   „150 g ananas"          — dnešní tvar
 *   „olivový olej 0.9 lžíce" — starší, obrácené pořadí
 *   „3× vejce"              — bez jednotky
 *   „½ lžičky cukru"        — zlomek znakem
 *   „sůl dle chuti"         — bez množství, a to je v pořádku
 *
 * Vrací `null` jen pro prázdný řádek nebo pro zbytek po rozseknutém zlomku
 * („1 /"), který nedává smysl ukazovat.
 */
export function rozeberRadekSuroviny(
  radek: string
): { nazev: string; mnozstvi: number | null; jednotka: string } | null {
  const text = radek.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  // Pozůstatek po staré čistící regulárce nad anglickým `original`: „1 /",
  // „1 /2 lžičky cukru". Rozseknutý zlomek nepoužijeme ani jako množství.
  // Náš formátovač zlomek píše znakem („½"), takže řádek, který začíná
  // číslem a lomítkem, je vždycky pozůstatek po té staré regulárce —
  // „1 /", „1 /2 lžičky cukru", „1/ chili powder".
  if (/^\d+\s*\/\s*\d*/.test(text)) {
    const zbytek = text.replace(/^\d+\s*\/\s*\d*\s*/, '').trim();
    return zbytek ? { nazev: zbytek, mnozstvi: null, jednotka: '' } : null;
  }

  const zlomky: Record<string, number> = {
    '¼': 0.25, '⅓': 1 / 3, '½': 0.5, '⅔': 2 / 3, '¾': 0.75
  };
  const cislo = (s: string): number | null => {
    if (zlomky[s] !== undefined) return zlomky[s];
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // „3× vejce"
  const bezJednotky = text.match(/^([\d.,]+|[¼⅓½⅔¾])\s*×\s*(.+)$/);
  if (bezJednotky) {
    const n = cislo(bezJednotky[1]);
    return { nazev: bezJednotky[2].trim(), mnozstvi: n, jednotka: n === null ? '' : 'ks' };
  }

  // „150 g ananas", „½ lžičky cukru"
  const napred = text.match(/^([\d.,]+|[¼⅓½⅔¾])\s+(\S+)\s+(.+)$/);
  if (napred) {
    const n = cislo(napred[1]);
    if (n !== null) return { nazev: napred[3].trim(), mnozstvi: n, jednotka: napred[2] };
  }

  // „olivový olej 0.9 lžíce" — starší plány psaly množství až za název.
  const vzadu = text.match(/^(.+?)\s+([\d.,]+|[¼⅓½⅔¾])\s+(\S+)$/);
  if (vzadu) {
    const n = cislo(vzadu[2]);
    if (n !== null) return { nazev: vzadu[1].trim(), mnozstvi: n, jednotka: vzadu[3] };
  }

  return { nazev: text, mnozstvi: null, jednotka: '' };
}
