// /components/PlanViewer.js – Zobrazení AI plánu; trénink v UI jen v režimu nutrition_training (lib/planOutputMode.js).
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { getPlanTypeLabel } from '../lib/planLabels';
import { stripInlineTrainingDayBlockFromHtml, stripPlanMediaAttrsFromHtml } from '../lib/emailTemplates';
import {
  buildShoppingSectionForDay,
  buildShoppingSectionsForWeek,
  buildShoppingItemsForMeal,
  flattenShoppingSections,
} from '../lib/shoppingListBuilder';
import { mealDisplayTitleForStructuredMeal } from '../lib/mealDisplayNameHelpers';
import { parsePlanHtml } from '../lib/parsePlanHtml';
import { getPlanOutputMode, shouldRenderTraining } from '../lib/planOutputMode.js';

export { parsePlanHtml };

const PERSONAL_ICONS = {
  'Věk': '🎂',
  'Výška': '📏',
  'Váha': '⚖️',
  'Aktivita': '🏃',
  'Stres': '😌',
  'Typ práce': '💼',
  'Cíl': '🎯',
  'Frekvence cvičení': '📅',
};

/** Normalizuje text pro porovnání (bez diakritiky, lowercase). */
function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** Typ jídla ve structured_plan_json (breakfast | lunch | …) z českého štítku v parseru. */
function structMealTypeFromParserLabel(mealTypeLabel) {
  const t = norm(String(mealTypeLabel || ''));
  if (t.includes('snidan') || t.includes('breakfast')) return 'breakfast';
  if (t.includes('obed') || t.includes('lunch')) return 'lunch';
  if (t.includes('vecere') || t.includes('dinner')) return 'dinner';
  if (t.includes('svacin') || t.includes('snack')) return 'snack';
  return null;
}

/**
 * Položka meals[] ze structured_plan pro daný den — podle typu jídla, ne jen podle indexu
 * (pořadí v HTML může chvíli nesedět s JSON).
 */
function structuredMealForDaySlot(structuredPlan, structDayIdx, mealTypeLabel, fallbackMi) {
  const day = structuredPlan?.days?.[structDayIdx];
  const arr = day?.meals;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const want = structMealTypeFromParserLabel(mealTypeLabel);
  if (want) {
    const hit = arr.find((m) => String(m?.type || '').toLowerCase() === want);
    if (hit) return hit;
  }
  return arr[fallbackMi] ?? null;
}

/** Stejná logika jako structuredMealForDaySlot, ale pro jeden den už vybraný podle data (valid_from). */
function structuredMealForStructuredDay(sd, mealTypeLabel, fallbackMi) {
  if (!sd) return null;
  return structuredMealForDaySlot({ days: [sd] }, 0, mealTypeLabel, fallbackMi);
}

/**
 * Jednoradý přehled jídel pro sbalený den (český název z struktury nebo ořezání HTML).
 * @returns {string}
 */
function collapsedDayMealsPeekLine(day, di, mealOverrides, structuredPlan, planHtml) {
  const structDayIdx = day.originalIndex ?? di;
  const parts = [];
  (day.meals || []).forEach((m, mj) => {
    const ovKey = `${structDayIdx}_${mj}`;
    const ovr = mealOverrides[ovKey];
    let title = '';
    if (ovr?.title) title = String(ovr.title).trim();
    else if (day.structDay || (structuredPlan?.days && structDayIdx >= 0)) {
      const sm = day.structDay
        ? structuredMealForStructuredDay(day.structDay, m.type, mj)
        : structuredMealForDaySlot(structuredPlan, structDayIdx, m.type, mj);
      title = sm ? String(mealDisplayTitleForStructuredMeal(sm, planHtml || '', day.dayName || '') || '').trim() : '';
    }
    if (!title && m.text) title = String(m.text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title && m.fullHtml) title = String(m.fullHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (m.type && title) parts.push(`${m.type}: ${title}`);
    else if (title) parts.push(title);
    else if (m.type) parts.push(m.type);
  });
  const joined = parts.join(' · ');
  if (!joined) return '';
  if (joined.length <= 260) return joined;
  return `${joined.slice(0, 257)}…`;
}

/** Pořadí dnů odpovídající getDay(): 0=Neděle, 1=Pondělí, …, 6=Sobota */
const CZECH_DAYS_BY_DOW = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/** Připočte dny k datu (YYYY-MM-DD), vrátí ISO. */
function addDaysToDateStr(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Pro dané datum vrátí očekávaný název dne v češtině. */
function getExpectedDayName(dateIso) {
  if (!dateIso) return '';
  const dow = new Date(dateIso + 'T12:00:00').getDay();
  return CZECH_DAYS_BY_DOW[dow] || '';
}

/** Vybere den z pole days, který odpovídá dateIso. Fallback pro plány s nesprávným pořadím dnů. */
function findDayForDate(days, dateIso, origIdx) {
  const expected = getExpectedDayName(dateIso);
  if (!expected || !days.length) return days[origIdx] || days[0];
  const byIndex = days[origIdx];
  const nameMatch = (d) => (d?.dayName || '').toLowerCase().includes(expected.toLowerCase());
  if (byIndex && nameMatch(byIndex)) return byIndex;
  const found = days.find(nameMatch);
  return found || byIndex || days[0];
}

const STRUCTURED_MEAL_TYPE_CS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

function mealTypeCsFromStructured(type) {
  const k = String(type || '').toLowerCase();
  return STRUCTURED_MEAL_TYPE_CS[k] || (typeof type === 'string' && type.trim() ? type.trim() : 'Jídlo');
}

/** Jídla pro den z JSON plánu (stejné pořadí jako valid_from…+6) – spolehlivější než párování jen z HTML. */
function buildMealsFromStructuredDay(sd, planHtml) {
  if (!sd?.meals?.length) return null;
  const dayName = sd.day_name || '';
  return sd.meals.map((m) => {
    const title = mealDisplayTitleForStructuredMeal(m, planHtml || '', dayName) || '';
    const rid = m.recipe_id != null && Number.isFinite(Number(m.recipe_id)) ? Number(m.recipe_id) : undefined;
    return {
      type: mealTypeCsFromStructured(m.type),
      text: title,
      fullHtml: '',
      ...(rid !== undefined ? { recipe_id: rid } : {}),
    };
  });
}

/** Formát data pro zobrazení u dne (např. "27. 2."). */
function formatDayLabel(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

/** Stejná normalizace jako backend (plan-enrichment) pro spolehlivý lookup. */
function normalizeLookupKey(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Spárování jídla z plánu s blokem „Recepty“ v HTML – jen při silné shodě názvu,
 * aby se neotevřel jiný recept (např. smoothie vs. ovesná kaše).
 */
function strictMealRecipeNameMatch(mealFullText, recipeName) {
  const dish = String(mealFullText || '')
    .replace(/^[^:]+:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
  const a = normalizeLookupKey(dish).slice(0, 120);
  const b = normalizeLookupKey(String(recipeName || ''));
  if (!a || !b || b.length < 5) return false;
  if (a.includes(b)) return b.length >= 8 || a.length <= b.length + 20;
  if (b.includes(a) && a.length >= 8) return true;
  const aw = a.split(' ').filter((w) => w.length > 2);
  const bw = b.split(' ').filter((w) => w.length > 2);
  if (!aw.length || !bw.length) return false;
  const bs = new Set(bw);
  let hits = 0;
  for (const w of aw) if (bs.has(w)) hits += 1;
  const need = Math.min(3, bw.length);
  return hits >= need;
}

/**
 * Resolve trust metadata for a meal (Spoonacular URL + trust level z backendu).
 * Returns { image_url, image_trust_level, exact_source, illustrative_source } or null.
 */
function getEnrichedMealTrust(mealText, mealTrustMap = {}, preferredKey = null) {
  const map = mealTrustMap || {};
  if (preferredKey && map[preferredKey]) return map[preferredKey];
  const source = String(mealText || '').replace(/^[^:]+:\s*/i, '').trim();
  const key = normalizeLookupKey(source);
  if (!key) return null;
  if (map[key]) return map[key];
  let bestKey = '';
  for (const candidateKey of Object.keys(map)) {
    if (!candidateKey) continue;
    if (key.includes(candidateKey) || candidateKey.includes(key)) {
      if (candidateKey.length > bestKey.length) bestKey = candidateKey;
    }
  }
  return bestKey ? map[bestKey] : null;
}

/**
 * Sloučí trust z pipeline (data-* na <p>) s výsledkem /api/plan-enrichment.
 * Recept ID a přesný obrázek z generování mají přednost, pokud jsou v HTML.
 */
function resolveMealTrustMerged(meal, mealText, mealTrustMap, preferredKey) {
  const enriched = getEnrichedMealTrust(mealText, mealTrustMap, preferredKey);
  const ridRaw = meal?.recipe_id;
  const fromHtmlId =
    ridRaw != null && ridRaw !== '' && Number.isFinite(Number(ridRaw)) ? Number(ridRaw) : null;
  const recipe_id = fromHtmlId ?? enriched?.recipe_id ?? null;
  const htmlUrl = typeof meal?.html_image_url === 'string' && meal.html_image_url.trim()
    ? meal.html_image_url.trim()
    : null;
  const htmlTrustLvl = (meal?.html_image_trust_level || '').toLowerCase();
  const htmlExact = htmlTrustLvl === 'exact' && htmlUrl;
  const enExact = enriched?.image_trust_level === 'exact' && enriched?.image_url;

  if (!enriched && recipe_id == null && !htmlUrl) return null;

  const image_url = htmlExact ? htmlUrl : enExact ? enriched.image_url : htmlUrl || enriched?.image_url || null;
  const image_trust_level = htmlExact || enExact ? 'exact' : enriched?.image_trust_level || (htmlUrl ? htmlTrustLvl || 'none' : 'none');

  return {
    ...(enriched || {}),
    recipe_id,
    image_url,
    image_trust_level,
    exact_source: htmlExact || enExact ? 'spoonacular' : enriched?.exact_source ?? null,
    illustrative_source: enriched?.illustrative_source ?? null,
    confidence_score: htmlExact || enExact ? 1 : enriched?.confidence_score ?? 0,
    calories: enriched?.calories ?? null,
    protein_g: enriched?.protein_g ?? null,
    carbs_g: enriched?.carbs_g ?? null,
    fat_g: enriched?.fat_g ?? null,
  };
}

/** Odstraní z HTML jména jídla vložené odkazy na /api/spoonacular-recipe (duplicita vedle tlačítka Recept). */
function stripInlineSpoonacularRecipeAnchors(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/<a\b[^>]*href\s*=\s*["'][^"']*spoonacular-recipe[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Přepíše trust z HTML daty ze structured_plan_json (recipe_id + makra odpovídají ověřenému receptu). */
function mergeTrustWithStructuredPlanMeal(baseTrust, structMeal) {
  if (!structMeal || typeof structMeal !== 'object') return baseTrust;
  const r = structMeal.recipe && typeof structMeal.recipe === 'object' ? structMeal.recipe : null;
  const ridRaw = r?.id ?? structMeal.recipe_id;
  const rid = ridRaw != null && Number.isFinite(Number(ridRaw)) ? Number(ridRaw) : null;
  const patch = {};
  if (rid != null) patch.recipe_id = rid;
  if (structMeal.recipe_verified === true && r) {
    if (r.calories != null && Number.isFinite(Number(r.calories))) patch.calories = Number(r.calories);
    if (r.protein_g != null && Number.isFinite(Number(r.protein_g))) patch.protein_g = Number(r.protein_g);
    if (r.carbs_g != null && Number.isFinite(Number(r.carbs_g))) patch.carbs_g = Number(r.carbs_g);
    if (r.fat_g != null && Number.isFinite(Number(r.fat_g))) patch.fat_g = Number(r.fat_g);
    if (r.fiber_g != null && Number.isFinite(Number(r.fiber_g))) patch.fiber_g = Number(r.fiber_g);
  }
  if (!Object.keys(patch).length) return baseTrust;
  return baseTrust && typeof baseTrust === 'object' ? { ...baseTrust, ...patch } : patch;
}

/** Emoji podle typu jídla (bez obrázků Spoonacular). */
function mealTypeEmojiFromLabel(mealType) {
  const t = norm(String(mealType || ''));
  if (t.includes('snidan') || t.includes('breakfast')) return '🌅';
  if (t.includes('obed') || t.includes('lunch')) return '☀️';
  if (t.includes('vecere') || t.includes('dinner')) return '🌙';
  if (t.includes('svacin') || t.includes('snack')) return '🍎';
  return '🍽️';
}

/** Řádek maker z enrichment mapy (kcal, B/S/T). */
function mealMacroLineFromTrust(mealTrust) {
  if (!mealTrust) return null;
  const parts = [];
  if (mealTrust.calories != null && Number.isFinite(Number(mealTrust.calories))) {
    parts.push(`cca ${Math.round(Number(mealTrust.calories))} kcal`);
  }
  if (mealTrust.protein_g != null && Number.isFinite(Number(mealTrust.protein_g))) {
    parts.push(`B ${Math.round(Number(mealTrust.protein_g))} g`);
  }
  if (mealTrust.carbs_g != null && Number.isFinite(Number(mealTrust.carbs_g))) {
    parts.push(`S ${Math.round(Number(mealTrust.carbs_g))} g`);
  }
  if (mealTrust.fat_g != null && Number.isFinite(Number(mealTrust.fat_g))) {
    parts.push(`T ${Math.round(Number(mealTrust.fat_g))} g`);
  }
  if (mealTrust.fiber_g != null && Number.isFinite(Number(mealTrust.fiber_g))) {
    parts.push(`Vláknina ${Math.round(Number(mealTrust.fiber_g))} g`);
  }
  if (!parts.length) return null;
  return parts.join(' · ');
}

function recipeContentOnly(html) {
  if (!html || typeof html !== 'string') return html;
  const lower = html.toLowerCase();
  const stopPhrases = ['tréninkový plán', 'treninkovy plan', 'regenerace', 'mindset'];
  for (const phrase of stopPhrases) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      const before = html.slice(0, idx);
      const h3Start = before.lastIndexOf('<h3');
      if (h3Start !== -1) return before.slice(0, h3Start).trim();
      return before.trim();
    }
  }
  return html;
}

/** Z receptu HTML vyextrahuje název jídla (např. z <b>Jídlo:</b> Grilovaný pstruh). */
function extractMealNameFromRecipeHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const m = html.match(/<b>\s*Jídlo\s*:\s*<\/b>\s*([^<]+)/i);
  if (m && m[1]) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    return name.length > 2 ? name : null;
  }
  return null;
}

const MAX_MEAL_TEXT_LEN = 200;
function normalizeMealTextForPin(text) {
  if (!text || typeof text !== 'string') return '';
  let s = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (s.length > MAX_MEAL_TEXT_LEN) s = s.slice(0, MAX_MEAL_TEXT_LEN);
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export default function PlanViewer({ plan, userName: _userName, hideHero, hideShoppingList = false, dietaryPreferences = '', canPinMeals = true, onToast, outputMode: outputModeProp }) {
  const [parsed, setParsed] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null); // { title, content, anchorRect, hasRecipe, openId? }
  const [mealIngredientsModal, setMealIngredientsModal] = useState(null); // { title, items, note, isEstimated }
  const [mealOrderModal, setMealOrderModal] = useState(null); // { title, items, note, isEstimated, copied }
  const [mealOverrides, setMealOverrides] = useState({}); // { "di_mi": { title, content } }
  const [swapModal, setSwapModal] = useState(null); // { dayIndex, mealIndex, dishQuery, loading, html }
  const [mealPins, setMealPins] = useState([]); // { meal_type, meal_text }[]
  const [pinToastMsg, setPinToastMsg] = useState(null); // lokální toast pro pin
  const [shoppingCopyDone, setShoppingCopyDone] = useState(false);
  const [shoppingCopyError, setShoppingCopyError] = useState(null);
  const [shoppingSendEmail, setShoppingSendEmail] = useState({ loading: false, done: false, error: null });
  const [dayShoppingState, setDayShoppingState] = useState({}); // { dayIndex: { copyDone, email: { loading, done, error } } }
  const [shoppingFilter, setShoppingFilter] = useState('week'); // 'week' | day originalIndex (number)
  const [shoppingListOpen, setShoppingListOpen] = useState(false); // rozbalovací sekce
  const [expandedDays, setExpandedDays] = useState(null); // null = dnes rozbalený; Set(di) = které dny jsou rozbalené
  const [mealTrustMap, setMealTrustMap] = useState({});
  const [showRawPlanFallback, setShowRawPlanFallback] = useState(false);
  const [exerciseHintModal, setExerciseHintModal] = useState(null); // { name, part, wgerId }
  const recipeOpenIdRef = useRef(0);

  const outputMode = getPlanOutputMode(plan, null, { outputMode: outputModeProp });
  const showTrainingInProfile = shouldRenderTraining(outputMode);

  /** Odstraní nebezpečné tagy z HTML pro zobrazení v fallbacku (bez obrázků; trénink dle output mode). */
  const sanitizeHtmlForFallback = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
    if (!showTrainingInProfile) {
      s = s.replace(/<h3[^>]*>[^<]*(?:Tréninkový plán|Trénink)[^<]*<\/h3>[\s\S]*?(?=<h3[^>]*>|$)/gi, '');
      s = stripInlineTrainingDayBlockFromHtml(s);
    }
    s = stripPlanMediaAttrsFromHtml(s);
    return s.trim();
  };

  const recipeErrorHtml = (msg) => `<p class="plan-no-recipe-msg">${String(msg || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</p>`;

  const mealTextFromMeal = (meal, overrideTitle = '') => {
    if (overrideTitle && String(overrideTitle).trim()) return String(overrideTitle).trim();
    const text = meal?.text && String(meal.text).trim()
      ? String(meal.text)
      : String(meal?.fullHtml || '');
    return text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[^:]+:\s*/i, '')
      .trim();
  };

  const recipeHtmlByMealName = (mealFullText, recipes = []) => {
    if (!Array.isArray(recipes) || recipes.length === 0) return '';
    const matched = recipes.find((r) => {
      if (!r?.content || /lorem\s+ipsum|dolor\s+sit\s+amet/i.test(r.content)) return false;
      return strictMealRecipeNameMatch(mealFullText, r.name);
    });
    return matched?.content || '';
  };

  const getSpoonacularRecipe = (recipeId) => {
    if (!recipeId || !Number.isInteger(Number(recipeId))) return Promise.resolve(null);
    return fetch('/api/spoonacular-recipe?id=' + encodeURIComponent(String(recipeId)), {
      headers: { Accept: 'application/json' },
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        const html = ok && data?.ok && data?.html ? data.html : null;
        const errMsg = !html && data?.error ? data.error : null;
        return html || (errMsg ? recipeErrorHtml(errMsg) : null);
      })
      .catch(() => null);
  };

  const getRecipeForDish = (dishName, avoid = '') => {
    if (!(dishName || '').trim()) return Promise.resolve(null);
    let url = '/api/recipe?dish=' + encodeURIComponent((dishName || '').trim().slice(0, 150));
    if (avoid && typeof avoid === 'string' && avoid.trim()) url += '&avoid=' + encodeURIComponent(avoid.trim().slice(0, 300));
    return fetch(url)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        const html = ok && data?.ok && data?.html ? data.html : null;
        const errMsg = !html && data?.error ? data.error : null;
        return html || (errMsg ? recipeErrorHtml(errMsg) : null);
      })
      .catch(() => null);
  };

  useEffect(() => {
    if (plan?.plan_html && typeof document !== 'undefined') {
      const result = parsePlanHtml(plan.plan_html);
      setParsed(result);
      const noGraphical = !result || ((result.days?.length ?? 0) === 0 && Object.keys(result.rawSections || {}).length === 0);
      if (noGraphical) setShowRawPlanFallback(true);
    } else {
      setParsed(null);
    }
  }, [plan?.plan_html]);

  useEffect(() => {
    if (!plan?.plan_html || typeof document === 'undefined') return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      try {
        const res = await fetch('/api/meal-pins', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.pins) setMealPins(data.pins);
      } catch {
        if (!cancelled) setMealPins([]);
      }
    })();
    return () => { cancelled = true; };
  }, [plan?.plan_html]);

  // Po načtení plánu posunout na „dnešek“, aby byl aktuální den hned vidět
  useEffect(() => {
    if (typeof document === 'undefined' || !parsed?.days?.length || !plan?.valid_from) return;
    const planFromStr = (plan.valid_from || '').split('T')[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIsoStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (planFromStr && planFromStr > todayIsoStr) return; // náhled příštího týdne – neposouvat
    const t = setTimeout(() => {
      const el = document.getElementById('plan-day-card-today');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
    return () => clearTimeout(t);
  }, [parsed?.days?.length, plan?.valid_from, plan?.plan_html]);

  useEffect(() => {
    if (!plan?.plan_html || typeof document === 'undefined') {
      setMealTrustMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const res = await fetch('/api/plan-enrichment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ html: plan.plan_html }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setMealTrustMap(data?.meal_trust && typeof data.meal_trust === 'object' ? data.meal_trust : {});
      } catch (_) {
        if (!cancelled) {
          setMealTrustMap({});
        }
      }
    })();
    return () => { cancelled = true; };
  }, [plan?.plan_html]);

  const isPinned = (mealType, mealText) => {
    const norm = normalizeMealTextForPin(mealText);
    return mealPins.some((p) => (p.meal_type || '').trim() === (mealType || '').trim() && normalizeMealTextForPin(p.meal_text) === norm);
  };

  const handleTogglePin = async (mealType, mealText, toastKey) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      (onToast || (() => {}))({ message: 'Pro označení jídla se přihlas.', type: 'error' });
      setPinToastMsg({ message: 'Pro označení jídla se přihlas.', type: 'error', key: toastKey });
      setTimeout(() => setPinToastMsg(null), 3000);
      return;
    }
    const pinned = isPinned(mealType, mealText);
    try {
      const res = await fetch('/api/meal-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: pinned ? 'remove' : 'add', meal_type: mealType, meal_text: mealText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba');
      if (data.pins) setMealPins(data.pins);
      const msg = pinned ? 'Odebráno z dalšího týdne.' : 'Přidáno do dalšího týdne.';
      if (onToast) onToast({ message: msg, type: 'success' });
      setPinToastMsg({ message: msg, type: 'success', key: toastKey });
      setTimeout(() => setPinToastMsg(null), 2500);
    } catch (e) {
      const msg = e.message || 'Nepodařilo uložit.';
      if (onToast) onToast({ message: msg, type: 'error' });
      setPinToastMsg({ message: msg, type: 'error', key: toastKey });
      setTimeout(() => setPinToastMsg(null), 3000);
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (recipeModal || swapModal || mealIngredientsModal || mealOrderModal || exerciseHintModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [recipeModal, swapModal, mealIngredientsModal, mealOrderModal, exerciseHintModal]);

  if (!plan || !plan.plan_html) {
    return (
      <section className="card plan-section">
        <h2>Můj plán</h2>
        <p className="empty-plan">
          Zatím nemáš žádný plán. Vyplň dotazník na <Link href="/start">stránce START</Link> a dostaneš osobní plán na míru.
        </p>
        <style jsx>{planSectionStyles}</style>
      </section>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIsoStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const planFromStr = (plan.valid_from || '').split('T')[0];
  const isFuturePlan = !!planFromStr && planFromStr > todayIsoStr;
  const todayStr = today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const isValid = plan.valid_until ? new Date(plan.valid_until + 'T23:59:59') >= today : true;
  const validUntilDate = plan.valid_until ? new Date(plan.valid_until + 'T12:00:00') : null;
  const daysUntilExpiry = validUntilDate ? Math.ceil((validUntilDate - today) / (24 * 60 * 60 * 1000)) : null;
  const planExpiresSoon = isValid && daysUntilExpiry != null && daysUntilExpiry >= 0 && daysUntilExpiry <= 2;
  const showGraphical = parsed && (parsed.personal?.length > 0 || parsed.days?.length > 0 || Object.keys(parsed.rawSections || {}).length > 0);
  const hasParsedDays = (parsed?.days?.length ?? 0) > 0;

  const structuredPlan = plan?.structured_plan_json && typeof plan.structured_plan_json === 'object'
    ? plan.structured_plan_json
    : null;

  /** Vždy 7 dní od začátku platnosti plánu (valid_from). Jídla ber z structured_plan_json, pokud má 7 dnů — shoda s kalendářem. */
  const planWeekDays = (() => {
    const daysArr = parsed?.days || [];
    if (daysArr.length === 0 || !plan?.valid_from) {
      return daysArr.map((d, i) => ({ ...d, dateStr: '', isToday: false, originalIndex: i, afterPlanEnd: false }));
    }
    const structDays = Array.isArray(structuredPlan?.days) ? structuredPlan.days : null;
    const useStruct = structDays && structDays.length === 7;
    const validUntilStr = (plan.valid_until || '').split('T')[0];
    const result = [];
    for (let origIdx = 0; origIdx < 7; origIdx++) {
      const dateIso = addDaysToDateStr(plan.valid_from, origIdx);
      const htmlDay = findDayForDate(daysArr, dateIso, origIdx);
      const structDay = useStruct
        ? structDays.find((d) => (d.date || '').split('T')[0] === dateIso) ?? structDays[origIdx]
        : null;
      const structMeals = structDay ? buildMealsFromStructuredDay(structDay, plan.plan_html || '') : null;
      const meals = structMeals && structMeals.length > 0 ? structMeals : htmlDay?.meals || [];
      const afterPlanEnd = !!(validUntilStr && dateIso > validUntilStr);
      result.push({
        ...htmlDay,
        structDay: structDay || null,
        dayName: structDay?.day_name || htmlDay?.dayName,
        meals,
        dateStr: dateIso ? formatDayLabel(dateIso) : '',
        isToday: dateIso === todayIsoStr && !isFuturePlan,
        originalIndex: origIdx,
        afterPlanEnd,
      });
    }
    return result;
  })();
  const weekShoppingSections = buildShoppingSectionsForWeek({
    planWeekDays,
    recipes: parsed?.recipes || [],
    structuredPlan,
    mealOverrides,
  });

  return (
    <section id="plan-overview" className="card plan-section plan-section-premium">
      {/* Hero nadpis (lze skrýt, když je vykreslen nahoře na stránce) */}
      {!hideHero && (
        <div className="plan-hero">
          <h2 className="plan-hero-title">Tvůj osobní jídelní plán Body & Mind ON</h2>
          {plan.plan_type && <span className="plan-badge">{getPlanTypeLabel(plan.plan_type)}</span>}
        </div>
      )}

      {/* Navigace: Můj plán | Jídelníček */}
      {showGraphical && (
        <nav className="plan-nav" aria-label="Sekce plánu">
          <a href="#plan-overview" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-overview')?.scrollIntoView({ behavior: 'smooth' }); }}>Můj plán</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-jidelnicek" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-jidelnicek')?.scrollIntoView({ behavior: 'smooth' }); }}>Jídelníček</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-day-card-today" className="plan-nav-item" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById('plan-day-card-today') || document.getElementById('plan-days');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>Na dnešek</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-nakupni-seznam" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-nakupni-seznam')?.scrollIntoView({ behavior: 'smooth' }); }}>Suroviny</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-varianty-jidel" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-varianty-jidel')?.scrollIntoView({ behavior: 'smooth' }); }}>Varianty</a>
        </nav>
      )}

      {!isValid && (
        <div className="plan-expired">
          <p>⚠️ Tento plán již vypršel.</p>
          <p><Link href="/start">Vygeneruj si nový plán</Link></p>
        </div>
      )}
      {planExpiresSoon && (
        <p className="plan-expires-soon">
          Plán vyprší {daysUntilExpiry === 0 ? 'dnes' : daysUntilExpiry === 1 ? 'zítra' : `za ${daysUntilExpiry} dny`} ({plan.valid_until ? new Date(plan.valid_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''}). Pro nový plán přejdi na <Link href="/start">stránku START</Link>.
        </p>
      )}

      {showGraphical ? (
        <>
          {/* Osobní údaje & cíle – karty s ikonami */}
          {parsed.personal?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Osobní údaje & cíle</h3>
              <div className="plan-cards-grid">
                {parsed.personal.map((item, i) => (
                  <div key={i} className="plan-card" style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className="plan-card-icon">{PERSONAL_ICONS[item.label] || '📋'}</span>
                    <span className="plan-card-label">{item.label}</span>
                    <span className="plan-card-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Denní cíle – makra */}
          {parsed.macros?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Denní cíle · makra</h3>
              <div className="plan-macros-row">
                {parsed.macros.map((m, i) => (
                  <div key={i} className="plan-macro-card">
                    <span className="plan-macro-value">{m.value}</span>
                    <span className="plan-macro-label">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasParsedDays && (
            <div className="plan-week-parts plan-week-parts-compact" role="note">
              <p className="plan-week-parts-single">
                Dny níže sledují tvůj uložený týden: jídla, automaticky dopočítaná makra z receptů a kde je dostupný i trénink.
                Dnešní den je v seznamu zvýrazněný.
              </p>
            </div>
          )}


          {/* Když parser nevrátil dny, ale máme rawSections – zobrazit plán po sekcích */}
          {showGraphical && !hasParsedDays && Object.keys(parsed?.rawSections || {}).length > 0 && (
            <div className="plan-block plan-raw-sections-fallback">
              <p className="plan-parse-fallback-msg" style={{ marginBottom: 16 }}>Plán zobrazen po sekcích (parser nerozpoznal jídelníček).</p>
              {Object.entries(parsed.rawSections)
                .filter(([sectionTitle]) => !/trénink|treninkovy/i.test(sectionTitle))
                .map(([sectionTitle, sectionHtml]) => (
                <div key={sectionTitle} className="plan-raw-section-block">
                  <h3 className="plan-block-title">{sectionTitle}</h3>
                  <div className="plan-raw-section-content" dangerouslySetInnerHTML={{ __html: sanitizeHtmlForFallback(sectionHtml) }} />
                </div>
              ))}
            </div>
          )}

          {/* Export jídelníčku – PDF s češtinou a obrázky */}
          {planWeekDays?.length > 0 && (
            <div className="plan-block plan-export-row">
              <button
                type="button"
                className="plan-export-btn"
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  const origText = btn.textContent;
                  btn.textContent = 'Generuji PDF…';
                  btn.disabled = true;
                  try {
                    // PDF should always contain full weekly plan, not only days from "today".
                    let rows = '';
                    (planWeekDays || []).forEach((day, di) => {
                      const dayLabel = (day.dayName || 'Den') + (day.dateStr ? ` (${day.dateStr})` : '') + (day.isToday ? ' – dnes' : '');
                      rows += `<div style="margin-bottom:18px;page-break-inside:avoid;"><div style="font-size:15px;font-weight:700;background:#eff6ff;color:#1e40af;padding:8px 14px;border-radius:7px;margin-bottom:10px;">${dayLabel.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`;
                      (day.meals || []).forEach((meal, mi) => {
                        const key = `${day.originalIndex ?? di}_${mi}`;
                        const ov = mealOverrides[key];
                        const text = ov ? ov.title : (meal.text || meal.fullHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        const dishTitle = (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        rows += `<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;background:#f8fafc;border-radius:8px;padding:10px;"><div style="flex-shrink:0;width:80px;height:56px;background:#e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;">${meal.type === 'Snídaně' ? '🍳' : meal.type === 'Oběd' ? '🥗' : meal.type === 'Večeře' ? '🍽️' : '🥪'}</div><div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.04em;margin-bottom:3px;">${(meal.type || 'Jídlo').replace(/</g, '&lt;')}</div><div style="font-size:12px;color:#1e293b;line-height:1.45;">${dishTitle}</div></div></div>`;
                      });
                      rows += '</div>';
                    });

                    const htmlStr = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:10px;"><h1 style="font-size:22px;font-weight:700;margin:0 0 20px;padding-bottom:12px;border-bottom:3px solid #e2e8f0;color:#0f172a;">Jídelníček na týden – Body &amp; Mind ON</h1>${rows}</div>`;

                    const html2pdf = (await import('html2pdf.js')).default;
                    await html2pdf().from(htmlStr).set({
                      margin: [12, 12, 12, 12],
                      filename: 'jidelnicek-tyden.pdf',
                      image: { type: 'jpeg', quality: 0.85 },
                      html2canvas: { scale: 2, useCORS: false, logging: false },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    }).save();
                  } catch (err) {
                    console.error('PDF error:', err);
                  } finally {
                    btn.textContent = origText;
                    btn.disabled = false;
                  }
                }}
              >
                Stáhnout jídelníček (PDF)
              </button>
            </div>
          )}

          {/* Jídelníček – od dneška dál (dynamicky podle aktuálního dne) */}
          {planWeekDays?.length > 0 && (
            <div id="plan-jidelnicek" className="plan-block">
              <h3 className="plan-block-title">Týden po dnech</h3>
              <p className="plan-block-subtitle">
                Každý řádek je jeden kalendářní den platnosti tvého plánu. Rozbalením dostaneš detaily receptu, automaticky dopočítané suroviny a trénink.
              </p>
              <p id="plan-varianty-jidel" className="plan-variant-hint">
                <strong>Tip:</strong> u každého jídla najdeš tlačítko „Nahradit jiným“ pro alternativu se zachovanými makry.
              </p>
              {plan.valid_from && plan.valid_until && (
                <p className="plan-validity-range">
                  Platnost plánu: {new Date(plan.valid_from).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })} – {new Date(plan.valid_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                </p>
              )}
              <div id="plan-days" className="plan-days">
                {planWeekDays.map((day, di) => {
                  const isDayExpanded = expandedDays === null ? (day.isToday || (isFuturePlan && di === 0)) : expandedDays.has(di);
                  const toggleDay = () => {
                    setExpandedDays((prev) => {
                      const todayIdx = planWeekDays.findIndex((d) => d.isToday);
                      const next = new Set(prev === null ? [todayIdx >= 0 ? todayIdx : 0] : Array.from(prev));
                      if (next.has(di)) next.delete(di);
                      else next.add(di);
                      return next;
                    });
                  };
                  const mealPeek = collapsedDayMealsPeekLine(day, di, mealOverrides, structuredPlan, plan.plan_html || '');
                  const dIdxPeek = day.originalIndex ?? di;
                  const wkPeek = day.structDay?.workout ?? structuredPlan?.days?.[dIdxPeek]?.workout;
                  const workoutExercises = wkPeek?.exercises;
                  const wc = Array.isArray(workoutExercises) ? workoutExercises.length : 0;
                  const htmlTrainingPeek = showTrainingInProfile && String(day.trainingHtml || '').trim().length > 0;
                  const trainingPeek =
                    showTrainingInProfile && (wc > 0 || htmlTrainingPeek)
                      ? wc > 0
                        ? `Trénink: ${wc} ${wc === 1 ? 'cvik' : wc >= 2 && wc <= 4 ? 'cviky' : 'cviků'}`
                        : 'Trénink: v plánu'
                      : '';
                  const peekPieces = [];
                  if (mealPeek) peekPieces.push(mealPeek);
                  if (trainingPeek) peekPieces.push(trainingPeek);
                  const peekLine = peekPieces.join(' · ');
                  return (
                  <div id={day.isToday ? 'plan-day-card-today' : undefined} key={di} className={`plan-day-card ${day._placeholder ? 'plan-day-placeholder' : ''} ${day.isToday ? 'plan-day-today' : ''} ${isDayExpanded ? 'plan-day-expanded' : ''}`}>
                    <button type="button" className="plan-day-header-btn" onClick={toggleDay} aria-expanded={isDayExpanded}>
                      <h4 className="plan-day-name">
                        {day.dayName}{day.dateStr ? ` (${day.dateStr})` : ''}{day.isToday ? ' – dnes' : ''}
                      </h4>
                      <span className="plan-day-chevron" aria-hidden>{isDayExpanded ? '▼' : '▶'}</span>
                    </button>
                    {!isDayExpanded && peekLine ? (
                      <button
                        type="button"
                        className="plan-day-peek-btn"
                        onClick={toggleDay}
                        aria-label={`Rozbalit ${day.dayName || 'den'}: ${peekLine}`}
                      >
                        {peekLine}
                      </button>
                    ) : null}
                    {isDayExpanded && (
                    <>
                    <nav className="plan-day-nav" aria-label="Jídla dne">
                      <span className="plan-day-nav-static">Co dnes jíst</span>
                    </nav>
                    <div id={`plan-day-${di}-meals`} className="plan-meals">
                      {day._placeholder && day.meals.length === 0 ? (
                        <p className="plan-day-placeholder-msg">Pro tento den se nepodařilo načíst jídla. Zkus znovu načíst plán nebo kontaktuj podporu.</p>
                      ) : null}
                      {day.meals.map((meal, mi) => {
                        const overrideKey = `${day.originalIndex ?? di}_${mi}`;
                        const override = mealOverrides[overrideKey];
                        const mealFullText = override ? `${meal.type || ''} ${override.title || ''}`.trim() : `${meal.type || ''} ${meal.text || ''}`.trim();
                        const matchingRecipeHtml = recipeHtmlByMealName(mealFullText, parsed?.recipes || []);
                        const dishTitle = (meal.text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
                        const mealLookupKey = meal.meal_key || null;
                        const structDayIdx = day.originalIndex ?? di;
                        const structMeal = day.structDay
                          ? structuredMealForStructuredDay(day.structDay, meal.type, mi)
                          : structuredPlan?.days &&
                              Array.isArray(structuredPlan.days) &&
                              structDayIdx >= 0 &&
                              structDayIdx < structuredPlan.days.length
                            ? structuredMealForDaySlot(structuredPlan, structDayIdx, meal.type, mi)
                            : null;
                        const displayMealTitle = structMeal
                          ? mealDisplayTitleForStructuredMeal(
                              structMeal,
                              plan.plan_html || '',
                              day.dayName || ''
                            )
                          : dishTitle;
                        const modalTitle =
                          meal.type && displayMealTitle
                            ? `${meal.type}: ${displayMealTitle}`
                            : displayMealTitle || meal.type || mealFullText || 'Jídlo';
                        const mealTrust = mergeTrustWithStructuredPlanMeal(
                          resolveMealTrustMerged(meal, mealFullText || meal.text || meal.type, mealTrustMap, mealLookupKey),
                          structMeal
                        );
                        const recipeIdForModal =
                          mealTrust?.recipe_id != null &&
                          String(mealTrust.recipe_id).trim() !== '' &&
                          Number.isFinite(Number(mealTrust.recipe_id))
                            ? Number(mealTrust.recipe_id)
                            : null;
                        const openRecipe = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const button = e?.currentTarget;
                          const rect = button?.getBoundingClientRect?.();
                          const anchorRect = rect ? { top: rect.bottom + 8, left: rect.left, width: rect.width } : null;
                          recipeOpenIdRef.current += 1;
                          const thisOpenId = recipeOpenIdRef.current;
                          if (override?.content) {
                            setRecipeModal({ openId: thisOpenId, title: override.title || modalTitle, content: recipeContentOnly(override.content), anchorRect, hasRecipe: true, loading: false });
                            return;
                          }
                          const dishName = (mealFullText.replace(/\s*\([^)]*\)\s*$/g, '').trim() || meal.type || 'Jídlo').slice(0, 150);
                          const isUnverifiedPlaceholder = mealFullText?.toLowerCase().includes('neověřeno') || dishName === 'Jídlo';
                          const recipeId = recipeIdForModal;
                          const htmlRecipeFallback = matchingRecipeHtml
                            ? recipeContentOnly(matchingRecipeHtml)
                            : null;
                          setRecipeModal({
                            openId: thisOpenId,
                            title: modalTitle,
                            content: null,
                            anchorRect,
                            hasRecipe: true,
                            loading: true,
                          });
                          const loadRecipe = async () => {
                            // 1) recipe_id / Spoonacular detail
                            if (recipeId != null) {
                              const spoon = await getSpoonacularRecipe(recipeId);
                              if (spoon) return spoon;
                            }
                            // 2) strict match v lokálních receptech
                            if (htmlRecipeFallback) return htmlRecipeFallback;
                            // 3) fallback přes /api/recipe?dish=
                            if (isUnverifiedPlaceholder) {
                              return recipeErrorHtml('Recept pro toto jídlo není k dispozici – Spoonacular ho nenalezl. Zkus ho nahradit jiným.');
                            }
                            const fallbackRecipe = await getRecipeForDish(dishName);
                            if (fallbackRecipe) return fallbackRecipe;
                            // 4) srozumitelná finální fallback hláška
                            return `
                              <p class="plan-no-recipe-msg">Recept se nepodařilo automaticky dohledat.</p>
                              <p class="plan-no-recipe-hint">Zkus vygenerovat náhradní variantu jídla nebo použij suroviny níže.</p>
                            `;
                          };
                          loadRecipe().then((html) => {
                            const fallback = '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo zkus znovu.</p>';
                            setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: html || fallback, loading: false } : prev));
                          }).catch(() => {
                            setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo zkus znovu.</p>', loading: false } : prev));
                          });
                        };
                        const buildMealIngredientPayload = () => {
                          const mealTitle = mealTextFromMeal(meal, override?.title || '');
                          const built = buildShoppingItemsForMeal({
                            meal,
                            mealText: mealTitle,
                            recipeHtml: override?.content || matchingRecipeHtml || '',
                            structuredMeal: meal,
                          });
                          return {
                            title: modalTitle,
                            items: built.items || [],
                            note: built.note || '',
                            isEstimated: !!built.isEstimated,
                            source: built.source || 'estimated',
                          };
                        };
                        const openIngredients = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMealIngredientsModal(buildMealIngredientPayload());
                        };
                        const openOrderIngredients = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMealOrderModal({ ...buildMealIngredientPayload(), copied: false });
                        };
                        const handleSwap = () => {
                          const dishQuery = `${meal.type || 'Jídlo'} alternativa, do 500 kcal`.slice(0, 150);
                          setSwapModal({ dayIndex: day.originalIndex ?? di, mealIndex: mi, dishQuery, mealType: meal.type || 'Jídlo', loading: true, html: null });
                          getRecipeForDish(dishQuery, dietaryPreferences).then((html) => {
                            setSwapModal((prev) => prev ? { ...prev, loading: false, html: html || '' } : null);
                          });
                        };
                        const mealTextForPin = override ? (override.title || '') : (meal.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
                        const mealPinned = isPinned(meal.type || '', mealTextForPin);
                        const macroLine = mealMacroLineFromTrust(mealTrust);
                        const mealTypeLabel = (meal.type || 'Jídlo').trim();
                        return (
                          <div key={mi} className="plan-meal-card">
                            <div className="plan-meal-icon" aria-hidden>
                              {mealTypeEmojiFromLabel(meal.type)}
                            </div>
                            <div className="plan-meal-body">
                              <div className="plan-meal-type-row">
                                <span className="plan-meal-type">{mealTypeLabel}</span>
                              </div>
                              {override ? (
                                <p className="plan-meal-name">{override.title || 'Náhrada'}</p>
                              ) : recipeIdForModal ? (
                                <p className="plan-meal-name">
                                  <button
                                    type="button"
                                    className="plan-meal-title-link"
                                    onClick={openRecipe}
                                    title="Otevřít recept (detail v aplikaci)"
                                  >
                                    {displayMealTitle}
                                  </button>
                                </p>
                              ) : meal.text && String(meal.text).trim() && !/<[a-z]/i.test(String(meal.text)) ? (
                                <p className="plan-meal-name">{displayMealTitle}</p>
                              ) : meal.text && String(meal.text).trim() ? (
                                <div
                                  className="plan-meal-name plan-meal-name-html"
                                  dangerouslySetInnerHTML={{
                                    __html: stripInlineSpoonacularRecipeAnchors(
                                      stripPlanMediaAttrsFromHtml(meal.text)
                                    ),
                                  }}
                                />
                              ) : (
                                <div
                                  className="plan-meal-name plan-meal-name-html"
                                  dangerouslySetInnerHTML={{
                                    __html: stripInlineSpoonacularRecipeAnchors(
                                      stripPlanMediaAttrsFromHtml(meal.fullHtml || '')
                                    ),
                                  }}
                                />
                              )}
                              {macroLine ? <p className="plan-meal-macros">{macroLine}</p> : null}
                              <div className="plan-meal-actions">
                                <button type="button" className="plan-meal-recipe-btn" onClick={openRecipe}>
                                  Recept
                                </button>
                                <button type="button" className="plan-meal-secondary-btn" onClick={openIngredients}>
                                  Suroviny
                                </button>
                                <button type="button" className="plan-meal-secondary-btn" onClick={openOrderIngredients}>
                                  Nákupní seznam
                                </button>
                                <button type="button" className="plan-meal-swap" onClick={(e) => { e.stopPropagation(); handleSwap(); }}>Nahradit jiným</button>
                                {canPinMeals && (
                                  <button
                                    type="button"
                                    className={`plan-meal-pin ${mealPinned ? 'plan-meal-pin-active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); handleTogglePin(meal.type || '', mealTextForPin, overrideKey); }}
                                    title="Označíš si jídlo pro příští týden — při dalším generování ho zkusíme znovu zapracovat."
                                  >
                                    {mealPinned ? '✓ Zahrnuto do dalšího týdne' : 'Zahrnout do dalšího týdne'}
                                  </button>
                                )}
                              </div>
                              {pinToastMsg?.key === overrideKey && (
                                <span className={`plan-pin-toast plan-pin-toast-${pinToastMsg.type || 'success'}`}>{pinToastMsg.message}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {showTrainingInProfile
                      ? (() => {
                      const dIdx = day.originalIndex ?? di;
                      const wk = day.structDay?.workout ?? structuredPlan?.days?.[dIdx]?.workout;
                      const list = wk?.exercises;
                      const htmlTrain = String(day.trainingHtml || '').trim();
                      if (Array.isArray(list) && list.length > 0) {
                        return (
                          <div className="plan-day-training">
                            <h4 className="plan-day-training-title">Trénink tento den</h4>
                            <ul className="plan-day-training-list" style={{ listStyle: 'disc', paddingLeft: 22 }}>
                              {list.map((ex, xi) => {
                                const name = ex.display_name_cs || ex.name_cs || ex.name || 'Cvik';
                                const wgerId =
                                  ex.wger_exercise_id != null && Number.isFinite(Number(ex.wger_exercise_id))
                                    ? Number(ex.wger_exercise_id)
                                    : null;
                                const reps = ex.reps != null ? String(ex.reps) : '';
                                const part = reps
                                  ? `${ex.sets ?? 3}×${reps}`
                                  : ex.duration_sec
                                    ? `${Math.round(Number(ex.duration_sec) / 60)} min`
                                    : `${ex.sets ?? 3} sérií`;
                                const openWgerExercise = () => {
                                  if (wgerId == null) {
                                    setExerciseHintModal({ name, part, wgerId: null });
                                    return;
                                  }
                                  const url = `https://wger.de/en/exercise/${Number(wgerId)}/view/`;
                                  const w = typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener,noreferrer') : null;
                                  if (!w) {
                                    setExerciseHintModal({ name, part, wgerId });
                                  }
                                };
                                return (
                                  <li key={xi} style={{ marginBottom: 10 }}>
                                    <strong>{name}</strong>
                                    {' '}
                                    – {part}
                                    <span style={{ display: 'block', marginTop: 6, fontSize: 13 }}>
                                      <button
                                        type="button"
                                        className="plan-exercise-hint-btn"
                                        onClick={openWgerExercise}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          padding: 0,
                                          cursor: 'pointer',
                                          color: '#a78bfa',
                                          textDecoration: 'underline',
                                          font: 'inherit',
                                        }}
                                      >
                                        Jak cvik provést (krátký popis)
                                      </button>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      }
                      if (htmlTrain) {
                        return (
                          <div className="plan-day-training">
                            <h4 className="plan-day-training-title">Trénink tento den</h4>
                            <div
                              className="plan-day-training-html plan-day-training-fallback"
                              dangerouslySetInnerHTML={{
                                __html: stripPlanMediaAttrsFromHtml(htmlTrain),
                              }}
                            />
                          </div>
                        );
                      }
                      return null;
                    })()
                      : null}
                    {day.afterPlanEnd ? (
                      <p className="plan-day-after-validity">Tento den už spadá mimo datum platnosti uloženého plánu — zobrazení je orientační.</p>
                    ) : null}
                    {(() => {
                      const dayKey = day.originalIndex ?? di;
                      const daySection = buildShoppingSectionForDay({
                        dayName: day.dayName || 'Den',
                        dateStr: day.dateStr || '',
                        meals: day.meals || [],
                        recipes: parsed?.recipes || [],
                        structuredPlan,
                        dayIndex: dayKey,
                        mealOverrides,
                      });
                      const dayList = daySection.items || [];
                      const raw = dayShoppingState[dayKey];
                      const dayState = {
                        copyDone: raw?.copyDone ?? false,
                        copyError: raw?.copyError ?? null,
                        email: raw?.email && typeof raw.email === 'object'
                          ? { loading: !!raw.email.loading, done: !!raw.email.done, error: raw.email.error ?? null }
                          : { loading: false, done: false, error: null },
                      };
                      if (dayList.length === 0) return null;
                      const copyAndOpenDay = () => {
                        try {
                          const text = Array.isArray(dayList) ? dayList.join('\n') : '';
                          window.open('https://www.rohlik.cz/', '_blank', 'noopener,noreferrer');
                          const key = dayKey;
                          const safeSetCopyDone = (done, errorMsg = null) => {
                            try {
                              setDayShoppingState((s) => ({ ...s, [key]: { ...(s[key] || {}), copyDone: !!done, copyError: errorMsg || undefined } }));
                            } catch (_) {}
                          };
                          // Odložit na další tick – po přihlášení první klik nesmí běžet během auth/load updatu
                          setTimeout(() => {
                            (async () => {
                              try {
                                if (navigator.clipboard?.writeText && text) {
                                  await navigator.clipboard.writeText(text);
                                  safeSetCopyDone(true);
                                  setTimeout(() => safeSetCopyDone(false), 3000);
                                }
                              } catch (_) {
                                safeSetCopyDone(false, 'Seznam se nepodařilo zkopírovat – vlož položky ručně ze seznamu níže (Ctrl+V na Rohlíku).');
                                setTimeout(() => safeSetCopyDone(false, null), 6000);
                              }
                            })().catch(() => {});
                          }, 0);
                        } catch (_) {}
                      };
                      const handleSendEmailDay = async () => {
                        setDayShoppingState((s) => ({ ...s, [dayKey]: { ...(s[dayKey] || {}), email: { loading: true, done: false, error: null } } }));
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          const token = session?.access_token;
                          if (!token) {
                            setDayShoppingState((s) => ({ ...s, [dayKey]: { ...(s[dayKey] || {}), email: { loading: false, done: false, error: 'Pro odeslání e-mailem se přihlas.' } } }));
                            return;
                          }
                          const dayLabel = (day.dayName || 'Den') + (day.dateStr ? ` (${day.dateStr})` : '');
                          const res = await fetch('/api/send-shopping-list', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ items: dayList, title: dayLabel }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setDayShoppingState((s) => ({ ...s, [dayKey]: { ...(s[dayKey] || {}), email: { loading: false, done: false, error: data.error || 'Nepodařilo odeslat.' } } }));
                            return;
                          }
                          setDayShoppingState((s) => ({ ...s, [dayKey]: { ...(s[dayKey] || {}), email: { loading: false, done: true, error: null } } }));
                          setTimeout(() => setDayShoppingState((s) => ({ ...s, [dayKey]: { ...(s[dayKey] || {}), email: { ...(s[dayKey]?.email || {}), done: false } } })), 4000);
                        } catch (e) {
                          setDayShoppingState((s) => ({ ...s, [dayKey]: { ...(s[dayKey] || {}), email: { loading: false, done: false, error: 'Chyba připojení.' } } }));
                        }
                      };
                      const handleShareWhatsAppDay = () => {
                        const text = dayList.join('\n');
                        const dayLabel = (day.dayName || 'Den') + (day.dateStr ? ` (${day.dateStr})` : '');
                        const url = `https://wa.me/?text=${encodeURIComponent('🛒 Suroviny na tento den – ' + dayLabel + ':\n\n' + text)}`;
                        window.open(url, '_blank', 'noopener,noreferrer');
                      };
                      return (
                        <div className="plan-day-shopping-actions plan-order-ingredients">
                          <div className="plan-shopping-actions">
                            <button type="button" className="plan-btn-order" onClick={copyAndOpenDay}>
                              🛒 Nákupní seznam
                            </button>
                            <button type="button" className="plan-btn-share" onClick={handleSendEmailDay} disabled={dayState.email.loading}>
                              {dayState.email.loading ? 'Odesílám…' : '✉️ Poslat e-mailem'}
                            </button>
                            <button type="button" className="plan-btn-share" onClick={handleShareWhatsAppDay}>
                              📱 Sdílet WhatsApp
                            </button>
                          </div>
                          {dayState.copyDone && <span className="plan-copy-hint">Seznam zkopírován do schránky</span>}
                          {dayState.copyError && <span className="plan-copy-hint plan-copy-error">{dayState.copyError}</span>}
                          {dayState.email.done && <span className="plan-copy-hint plan-copy-success">Odesláno na e-mail</span>}
                          {dayState.email.error && <span className="plan-copy-hint plan-copy-error">{dayState.email.error}</span>}
                          <p className="plan-order-links">
                            Seznam se zkopíruje a otevře se <a href="https://www.rohlik.cz/" target="_blank" rel="noopener noreferrer">Rohlík.cz</a>.
                            Můžeš ho vložit v nákupním seznamu (Ctrl+V). Případně nákup vyřídíš na{' '}
                            <a href="https://www.kosik.cz/" target="_blank" rel="noopener noreferrer">Košík.cz</a> nebo{' '}
                            <a href="https://shop.billa.cz/" target="_blank" rel="noopener noreferrer">Billa e-shop</a>.
                          </p>
                        </div>
                      );
                    })()}
                    </>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modal receptu – vykreslen v portálu do body, aby byl u kliknutého jídla (fixed vůči viewportu) */}
          {recipeModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setRecipeModal(null)}>
              <div
                className="plan-recipe-modal plan-recipe-modal-dynamic"
                onClick={(e) => e.stopPropagation()}
                style={(() => {
                  const pad = 16;
                  const maxW = 520;
                  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
                  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
                  const maxH = vh - pad * 2;
                  if (recipeModal.anchorRect && typeof window !== 'undefined') {
                    const top = recipeModal.anchorRect.top;
                    const left = recipeModal.anchorRect.left;
                    const topClamped = Math.max(pad, Math.min(top, vh - maxH - pad));
                    return {
                      position: 'fixed',
                      top: `${topClamped}px`,
                      left: `${Math.max(pad, Math.min(left, vw - maxW - pad))}px`,
                      height: `${maxH}px`,
                      maxHeight: `${maxH}px`,
                      width: 'min(520px, calc(100vw - 24px))',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    };
                  }
                  return {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    height: `${maxH}px`,
                    maxHeight: `${maxH}px`,
                    width: 'min(520px, calc(100vw - 24px))',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  };
                })()}
              >
                <div className="plan-recipe-modal-header">
                  <h3>{recipeModal.title}</h3>
                  <span className="plan-recipe-portion-label">Na 1 porci</span>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setRecipeModal(null)} aria-label="Zavřít">×</button>
                </div>
                {recipeModal.loading ? (
                  <div className="plan-recipe-modal-loading">
                    <span className="plan-recipe-modal-spinner" />
                    <p>Načítám recept z internetu…</p>
                  </div>
                ) : (
                  <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: stripPlanMediaAttrsFromHtml(recipeModal.content || '') }} />
                )}
              </div>
            </div>,
            document.body
          )}

          {mealIngredientsModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setMealIngredientsModal(null)}>
              <div className="plan-recipe-modal plan-recipe-modal-dynamic plan-meal-ingredients-modal" onClick={(e) => e.stopPropagation()}>
                <div className="plan-recipe-modal-header">
                  <h3>Suroviny: {mealIngredientsModal.title}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setMealIngredientsModal(null)} aria-label="Zavřít">×</button>
                </div>
                <div className="plan-recipe-modal-body">
                  {mealIngredientsModal.items?.length ? (
                    <ul className="plan-modal-ingredients-list">
                      {mealIngredientsModal.items.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
                    </ul>
                  ) : (
                    <p className="plan-no-recipe-msg">Suroviny zatím nejsou dostupné.</p>
                  )}
                  {mealIngredientsModal.note ? <p className="plan-no-recipe-hint">{mealIngredientsModal.note}</p> : null}
                </div>
                <div className="plan-recipe-modal-actions">
                  <button
                    type="button"
                    className="plan-recipe-modal-replace-btn"
                    onClick={async () => {
                      try {
                        const text = (mealIngredientsModal.items || []).join('\n');
                        if (!text) return;
                        await navigator.clipboard.writeText(text);
                        if (onToast) onToast({ message: 'Suroviny zkopírovány.', type: 'success' });
                      } catch (_) {
                        if (onToast) onToast({ message: 'Suroviny se nepodařilo zkopírovat.', type: 'error' });
                      }
                    }}
                  >
                    Kopírovat suroviny
                  </button>
                  <button
                    type="button"
                    className="plan-meal-secondary-btn plan-modal-inline-btn"
                    onClick={() => {
                      document.getElementById('plan-nakupni-seznam')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      setMealIngredientsModal(null);
                    }}
                  >
                    Zobrazit v nákupním seznamu
                  </button>
                  <button
                    type="button"
                    className="plan-meal-secondary-btn plan-modal-inline-btn"
                    onClick={() => {
                      setMealOrderModal({ ...mealIngredientsModal, copied: false });
                      setMealIngredientsModal(null);
                    }}
                  >
                    Nákupní seznam
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {mealOrderModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setMealOrderModal(null)}>
              <div className="plan-recipe-modal plan-recipe-modal-dynamic plan-meal-ingredients-modal" onClick={(e) => e.stopPropagation()}>
                <div className="plan-recipe-modal-header">
                  <h3>Nákupní seznam</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setMealOrderModal(null)} aria-label="Zavřít">×</button>
                </div>
                <div className="plan-recipe-modal-body">
                  <p className="plan-order-intro">Seznam surovin je připravený ke zkopírování.</p>
                  {mealOrderModal.items?.length ? (
                    <pre className="plan-order-pre">{mealOrderModal.items.join('\n')}</pre>
                  ) : (
                    <p className="plan-no-recipe-msg">Suroviny zatím nejsou dostupné.</p>
                  )}
                  {mealOrderModal.note ? <p className="plan-no-recipe-hint">{mealOrderModal.note}</p> : null}
                  <p className="plan-no-recipe-hint">Otevři e-shop a vlož seznam do vyhledávání nebo nákupního seznamu. Přímé vložení do košíku zatím není napojené.</p>
                </div>
                <div className="plan-recipe-modal-actions">
                  <button
                    type="button"
                    className="plan-recipe-modal-replace-btn"
                    onClick={async () => {
                      try {
                        const text = (mealOrderModal.items || []).join('\n');
                        if (!text) return;
                        await navigator.clipboard.writeText(text);
                        setMealOrderModal((prev) => prev ? { ...prev, copied: true } : prev);
                      } catch (_) {
                        if (onToast) onToast({ message: 'Seznam se nepodařilo zkopírovat.', type: 'error' });
                      }
                    }}
                  >
                    Kopírovat seznam
                  </button>
                  <div className="plan-modal-links-row">
                    <a className="plan-meal-secondary-btn plan-modal-link-btn" href="https://www.rohlik.cz/" target="_blank" rel="noopener noreferrer">Otevřít Rohlík</a>
                    <a className="plan-meal-secondary-btn plan-modal-link-btn" href="https://www.kosik.cz/" target="_blank" rel="noopener noreferrer">Otevřít Košík</a>
                  </div>
                  {mealOrderModal.copied ? <p className="plan-copy-hint">Seznam zkopírován do schránky.</p> : null}
                </div>
              </div>
            </div>,
            document.body
          )}

          {exerciseHintModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setExerciseHintModal(null)}>
              <div
                className="plan-recipe-modal plan-recipe-modal-dynamic"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'min(440px, calc(100vw - 24px))',
                  maxHeight: '85vh',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div className="plan-recipe-modal-header">
                  <h3>{exerciseHintModal.name}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setExerciseHintModal(null)} aria-label="Zavřít">×</button>
                </div>
                <div className="plan-recipe-modal-body">
                  <p style={{ marginTop: 0 }}><strong>Plán:</strong> {exerciseHintModal.part}</p>
                  <p className="plan-no-recipe-hint" style={{ marginBottom: 0 }}>
                    Krátký popis provedení je na stránce cviku ve veřejné databázi wger (otevře se v novém okně). Pokud se okno neotevřelo, použij tlačítko níže — prohlížeč mohl vyskakovací okno zablokovat.
                  </p>
                  {exerciseHintModal.wgerId != null ? (
                    <button
                      type="button"
                      className="plan-meal-recipe-btn"
                      style={{ marginTop: 14 }}
                      onClick={() => {
                        const id = exerciseHintModal.wgerId;
                        window.open(`https://wger.de/en/exercise/${Number(id)}/view/`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      Otevřít návod na wger.de →
                    </button>
                  ) : (
                    <p className="plan-no-recipe-msg" style={{ marginTop: 12 }}>Pro tento cvik není v plánu uložené ID ve wger — kontaktuj podporu, pokud potřebuješ doplnit.</p>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Swap modal – alternativa jídla */}
          {swapModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setSwapModal(null)}>
              <div className="plan-recipe-modal plan-recipe-modal-dynamic" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(520px, calc(100vw - 24px))', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a2e', borderRadius: '16px', border: '1px solid #333', zIndex: 10001 }}>
                <div className="plan-recipe-modal-header">
                  <h3>Alternativa: {swapModal.loading ? swapModal.dishQuery : (extractMealNameFromRecipeHtml(swapModal.html) || swapModal.dishQuery)}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setSwapModal(null)} aria-label="Zavřít">×</button>
                </div>
                {swapModal.loading ? (
                  <div className="plan-recipe-modal-loading">
                    <span className="plan-recipe-modal-spinner" />
                    <p>Generuji alternativu…</p>
                  </div>
                ) : (
                  <>
                    <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: stripPlanMediaAttrsFromHtml(swapModal.html || '<p>Recept se nepodařilo načíst.</p>') }} />
                    <div className="plan-recipe-modal-actions">
                      <button type="button" className="plan-recipe-modal-replace-btn" onClick={() => {
                        const mealName = extractMealNameFromRecipeHtml(swapModal.html) || `${swapModal.mealType || 'Náhrada'} alternativa`;
                        setMealOverrides((o) => ({ ...o, [`${swapModal.dayIndex}_${swapModal.mealIndex}`]: { title: mealName, content: swapModal.html } }));
                        setSwapModal(null);
                      }}>
                        Nahradit toto jídlo v plánu
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )}

          {/* Mindset se vykresluje v profil.js hned pod Tvé milníky */}

          {/* Nákupní seznam – rozbalovací, filtr Celý týden / konkrétní den */}
          {!hideShoppingList && (() => {
            const fullList = flattenShoppingSections(weekShoppingSections);
            const dayIndex = shoppingFilter === 'week' ? null : Number(shoppingFilter);
            const selectedDay = dayIndex != null && !Number.isNaN(dayIndex) ? planWeekDays.find((d) => (d.originalIndex ?? -1) === dayIndex) : null;
            const selectedDaySection = selectedDay
              ? buildShoppingSectionForDay({
                dayName: selectedDay.dayName || 'Den',
                dateStr: selectedDay.dateStr || '',
                meals: selectedDay.meals || [],
                recipes: parsed?.recipes || [],
                structuredPlan,
                dayIndex: selectedDay.originalIndex ?? 0,
                mealOverrides,
              })
              : null;
            const dayList = selectedDaySection?.items || [];
            const list = shoppingFilter === 'week' ? fullList : dayList;
            const copyAndOpen = () => {
              try {
                const text = Array.isArray(list) ? list.join('\n') : '';
                window.open('https://www.rohlik.cz/', '_blank', 'noopener,noreferrer');
                // Odložit na další tick – po přihlášení první klik nesmí běžet během auth/load updatu
                setTimeout(() => {
                  (async () => {
                    try {
                      if (navigator.clipboard?.writeText && text) {
                        await navigator.clipboard.writeText(text);
                        setShoppingCopyDone(true);
                        setShoppingCopyError(null);
                        setTimeout(() => setShoppingCopyDone(false), 3000);
                      }
                    } catch (_) {
                      setShoppingCopyError('Seznam se nepodařilo zkopírovat – vlož položky ručně ze seznamu níže (Ctrl+V na Rohlíku).');
                      setTimeout(() => setShoppingCopyError(null), 6000);
                    }
                  })().catch(() => {});
                }, 0);
              } catch (_) {}
            };
            const handleSendEmail = async () => {
              setShoppingSendEmail({ loading: true, done: false, error: null });
              try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) {
                  setShoppingSendEmail({ loading: false, done: false, error: 'Pro odeslání e-mailem se přihlas.' });
                  return;
                }
                let bodyPayload;
                if (shoppingFilter === 'week') {
                  const sections = weekShoppingSections.map((s) => ({
                    heading: s.heading,
                    items: s.items || [],
                    note: s.note || '',
                    isEstimated: !!s.isEstimated,
                  }));
                  bodyPayload = {
                    sections,
                    intro: 'Tady máš suroviny z tvého plánu rozdělené podle dnů.',
                  };
                } else {
                  const t = `${selectedDay?.dayName || 'Den'}${selectedDay?.dateStr ? ` (${selectedDay.dateStr})` : ''}`;
                  bodyPayload = { items: list, title: t };
                }
                const res = await fetch('/api/send-shopping-list', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify(bodyPayload),
                });
                const data = await res.json();
                if (!res.ok) {
                  setShoppingSendEmail({ loading: false, done: false, error: data.error || 'Nepodařilo odeslat.' });
                  return;
                }
                setShoppingSendEmail({ loading: false, done: true, error: null });
                setTimeout(() => setShoppingSendEmail((s) => ({ ...s, done: false })), 4000);
              } catch (e) {
                setShoppingSendEmail({ loading: false, done: false, error: 'Chyba připojení.' });
              }
            };
            const handleShareWhatsApp = () => {
              const text = list.join('\n');
              const label = shoppingFilter === 'week' ? 'Nákupní seznam Body & Mind ON' : `Suroviny – ${selectedDay?.dayName || ''}${selectedDay?.dateStr ? ` (${selectedDay.dateStr})` : ''}`;
              const url = `https://wa.me/?text=${encodeURIComponent('🛒 ' + label + ':\n\n' + text)}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            };
            const hasAnyList = fullList.length > 0 || weekShoppingSections.some((s) => (s.items || []).length > 0);
            if (!hasAnyList) {
              return hasParsedDays ? (
                <div id="plan-nakupni-seznam" className="plan-block plan-shopping-block plan-shopping-empty-anchor">
                  <h3 className="plan-block-title">Suroviny a nákup</h3>
                  <p className="plan-block-subtitle">
                    Hromadný nákupní seznam zatím není k dispozici. Suroviny najdeš u jednotlivých jídel a u každého dne tlačítko „Nákupní seznam“ (zkopíruješ řádky a vložíš je do e-shopu).
                  </p>
                </div>
              ) : null;
            }
            return (
              <div id="plan-nakupni-seznam" className="plan-block plan-shopping-block">
                <details className="plan-shopping-details" open={shoppingListOpen} onToggle={(e) => setShoppingListOpen(e.target.open)}>
                  <summary className="plan-shopping-summary">
                    <span className="plan-block-title">Nákupní seznam na týden</span>
                    <span className="plan-shopping-chevron" aria-hidden>{shoppingListOpen ? '▼' : '▶'}</span>
                  </summary>
                  <div className="plan-shopping-inner">
                    <div className="plan-shopping-filter-wrap">
                      <label htmlFor="shopping-filter" className="plan-shopping-filter-label">Zobrazit:</label>
                      <select
                        id="shopping-filter"
                        className="plan-shopping-filter"
                        value={shoppingFilter}
                        onChange={(e) => setShoppingFilter(e.target.value)}
                      >
                        <option value="week">Celý týden</option>
                        {planWeekDays.map((d) => (
                          <option key={d.originalIndex ?? d.dayName} value={d.originalIndex ?? 0}>
                            {d.dayName}{d.dateStr ? ` (${d.dateStr})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {list.length > 0 ? (
                      <>
                        <ul className="plan-shopping-list">
                          {list.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                        {shoppingFilter === 'week' && weekShoppingSections.some((s) => s.note) ? (
                          <p className="plan-shopping-empty-day">
                            Přesné suroviny se nepodařilo rozpoznat u některých dnů. Seznam je v těchto částech orientační podle názvů jídel.
                          </p>
                        ) : null}
                        {shoppingFilter !== 'week' && selectedDaySection?.note ? (
                          <p className="plan-shopping-empty-day">{selectedDaySection.note}</p>
                        ) : null}
                        <div className="plan-order-ingredients">
                          <div className="plan-shopping-actions">
                            <button type="button" className="plan-btn-order" onClick={copyAndOpen}>
                              🛒 Nákupní seznam
                            </button>
                            <button type="button" className="plan-btn-share" onClick={handleSendEmail} disabled={shoppingSendEmail.loading}>
                              {shoppingSendEmail.loading ? 'Odesílám…' : '✉️ Poslat e-mailem'}
                            </button>
                            <button type="button" className="plan-btn-share" onClick={handleShareWhatsApp}>
                              📱 Sdílet WhatsApp
                            </button>
                          </div>
                          {shoppingCopyDone && <span className="plan-copy-hint">Seznam zkopírován do schránky</span>}
                          {shoppingCopyError && <span className="plan-copy-hint plan-copy-error">{shoppingCopyError}</span>}
                          {shoppingSendEmail.done && <span className="plan-copy-hint plan-copy-success">Odesláno na e-mail</span>}
                          {shoppingSendEmail.error && <span className="plan-copy-hint plan-copy-error">{shoppingSendEmail.error}</span>}
                          <p className="plan-order-links">
                            Seznam se zkopíruje a otevře se <a href="https://www.rohlik.cz/" target="_blank" rel="noopener noreferrer">Rohlík.cz</a>.
                            Můžeš ho vložit v nákupním seznamu (Ctrl+V). Případně nákup vyřídíš na{' '}
                            <a href="https://www.kosik.cz/" target="_blank" rel="noopener noreferrer">Košík.cz</a> nebo{' '}
                            <a href="https://shop.billa.cz/" target="_blank" rel="noopener noreferrer">Billa e-shop</a>.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="plan-shopping-empty-day">
                        {selectedDaySection?.note || 'Suroviny se nepodařilo přesně rozpoznat. Níže je orientační seznam podle názvů jídel.'}
                      </p>
                    )}
                  </div>
                </details>
              </div>
            );
          })()}

        </>
      ) : (
        <>
          {!isFuturePlan && (
            <div className="plan-today-banner">
              <span className="plan-today-emoji">📅</span>
              <div>
                <h3>Dnes ({todayStr})</h3>
                <p>Podívej se do svého plánu níže.</p>
              </div>
            </div>
          )}
          <div className="plan-parse-fallback-block">
            <p className="plan-parse-fallback-msg">Plán existuje, ale nepodařilo se ho správně vykreslit.</p>
            <button type="button" className="plan-btn-raw-fallback" onClick={() => setShowRawPlanFallback((v) => !v)}>
              {showRawPlanFallback ? 'Skrýt plán jako text' : 'Zobrazit plán jako text'}
            </button>
            {showRawPlanFallback && plan?.plan_html && (
              <div className="plan-raw-fallback-content" dangerouslySetInnerHTML={{ __html: sanitizeHtmlForFallback(plan.plan_html) }} />
            )}
          </div>
        </>
      )}

      <style jsx>{planSectionStyles}</style>
    </section>
  );
}

const planSectionStyles = `
  .plan-section {
    margin-bottom: 40px;
  }
  .plan-section-premium {
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  .plan-hero {
    text-align: center;
    padding: 28px 24px 32px;
    margin: -24px -24px 24px -24px;
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%);
    border-radius: 20px 20px 0 0;
    position: relative;
  }
  .plan-hero::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.5), transparent);
  }
  .plan-hero-title {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 700;
    color: #fff;
  }
  .plan-badge {
    display: inline-block;
    background: rgba(255,255,255,0.25);
    color: #e9d5ff;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .plan-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 14px 20px;
    margin-bottom: 20px;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 12px;
    border: 1px solid rgba(139, 92, 255, 0.25);
  }
  .plan-nav-item {
    color: #c4b5fd;
    font-weight: 600;
    font-size: 15px;
    text-decoration: none;
    transition: color 0.2s;
  }
  .plan-nav-item:hover {
    color: #e9d5ff;
  }
  .plan-nav-sep {
    color: rgba(148, 163, 184, 0.6);
    font-size: 14px;
  }

  .plan-week-parts {
    margin: 0 0 20px;
    padding: 14px 18px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.45);
    border: 1px solid rgba(139, 92, 255, 0.22);
  }
  .plan-week-parts-title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    color: #a78bfa;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .plan-week-parts-list {
    margin: 0;
    padding-left: 1.2rem;
    color: #cbd5e1;
    font-size: 14px;
    line-height: 1.6;
  }
  .plan-week-parts-list li { margin: 4px 0; }
  .plan-week-parts-compact {
    margin: 0 0 14px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.42);
    border: 1px solid rgba(139, 92, 255, 0.22);
  }
  .plan-week-parts-single {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: #cbd5e1;
  }

  .plan-day-after-validity {
    margin: 8px 16px 0;
    font-size: 12px;
    color: #fbbf24;
    line-height: 1.45;
  }
  .plan-training-supplement {
    margin-top: 10px;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .plan-variant-hint {
    margin: 0 0 16px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(124, 58, 237, 0.12);
    border: 1px solid rgba(167, 139, 250, 0.28);
    color: #e2e8f0;
    font-size: 14px;
    line-height: 1.5;
  }
  .plan-day-training-wrap {
    margin: 16px 16px 0;
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.55);
    border: 1px solid rgba(71, 85, 105, 0.45);
  }
  .plan-day-training-subtitle {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 700;
    color: #c4b5fd;
  }
  .plan-day-training-html :global(ul) {
    margin: 8px 0;
    padding-left: 20px;
    color: #e2e8f0;
  }
  .plan-training-week-wrap {
    margin: 24px 0 0;
    padding: 18px 16px;
    border-radius: 14px;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(124, 58, 237, 0.3);
  }
  .plan-training-week-title { margin: 0 0 12px; }
  .plan-training-week-fallback {
    margin: 0;
    color: #94a3b8;
    font-size: 14px;
    line-height: 1.55;
  }

  .plan-expired {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 20px;
    font-size: 14px;
  }
  .plan-expired p { margin: 0 0 8px; }
  .plan-expired p:last-child { margin-bottom: 0; }
  .plan-expired a { color: #a78bfa; text-decoration: none; }
  .plan-expired a:hover { text-decoration: underline; }
  .plan-expires-soon {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.4);
    color: #fde68a;
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 20px;
    font-size: 14px;
    line-height: 1.5;
  }
  .plan-expires-soon a { color: #a78bfa; text-decoration: none; }
  .plan-expires-soon a:hover { text-decoration: underline; }

  .plan-parse-fallback-block {
    margin-top: 20px;
    padding: 20px;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 12px;
  }
  .plan-parse-fallback-msg {
    margin: 0 0 12px;
    color: #cbd5e1;
    font-size: 15px;
  }
  .plan-btn-raw-fallback {
    padding: 10px 18px;
    background: rgba(139, 92, 255, 0.3);
    border: 1px solid rgba(139, 92, 255, 0.5);
    color: #e9d5ff;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .plan-btn-raw-fallback:hover {
    background: rgba(139, 92, 255, 0.45);
  }
  .plan-raw-fallback-content {
    margin-top: 16px;
    padding: 16px;
    background: rgba(15, 23, 42, 0.8);
    border-radius: 10px;
    font-size: 14px;
    line-height: 1.6;
    color: #cbd5e1;
    max-height: 70vh;
    overflow-y: auto;
  }
  .plan-raw-fallback-content :global(h2) { font-size: 18px; margin: 16px 0 8px; color: #e9d5ff; }
  .plan-raw-fallback-content :global(h3) { font-size: 16px; margin: 14px 0 6px; color: #c4b5fd; }
  .plan-raw-fallback-content :global(p) { margin: 8px 0; }
  .plan-raw-fallback-content :global(ul) { margin: 8px 0; padding-left: 20px; }

  .plan-raw-sections-fallback { margin-top: 16px; }
  .plan-raw-section-block { margin-bottom: 24px; }
  .plan-raw-section-block .plan-block-title { margin-bottom: 10px; }
  .plan-raw-section-content { padding: 12px 0; color: #cbd5e1; font-size: 14px; line-height: 1.5; }
  .plan-raw-section-content :global(p) { margin: 8px 0; }
  .plan-raw-section-content :global(ul) { margin: 8px 0; padding-left: 20px; }

  .plan-block {
    margin-bottom: 32px;
  }
  .plan-block-title {
    font-size: 18px;
    font-weight: 600;
    color: #e9d5ff;
    margin: 0 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(139, 92, 255, 0.3);
  }
  .plan-block-subtitle {
    margin: -10px 0 18px;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.5;
  }
  .plan-block-training {
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(71, 85, 105, 0.5);
    border-left: 4px solid #7c3aed;
    border-radius: 12px;
    padding: 20px;
  }
  .plan-block-training .plan-block-title { border-bottom-color: rgba(124, 58, 237, 0.4); }
  .plan-training-content {
    color: #e2e8f0;
    font-size: 15px;
    line-height: 1.65;
  }
  .plan-training-content p { margin: 0 0 12px; }
  .plan-training-content p:last-child { margin-bottom: 0; }
  .plan-training-content b { color: #c4b5fd; }
  .plan-training-content img,
  .plan-training-content picture,
  .plan-training-content video { display: none; }
  .plan-training-content ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .plan-exercise-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .plan-exercise-item:last-child {
    border-bottom: none;
  }
  .plan-exercise-number {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(124, 58, 237, 0.15);
    border: 1px solid rgba(124, 58, 237, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #a78bfa;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .plan-exercise-name {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    font-weight: 600;
    color: #f1f5f9;
    line-height: 1.45;
  }
  .plan-exercise-name :global(p) {
    margin: 0 0 4px;
  }
  .plan-exercise-name :global(p:last-child) {
    margin-bottom: 0;
  }
  .plan-exercise-sets {
    font-size: 13px;
    color: #7c3aed;
    font-weight: 600;
    margin-left: auto;
    flex-shrink: 0;
  }
  .plan-validity-range {
    margin: -8px 0 12px;
    font-size: 13px;
    color: #94a3b8;
  }
  .plan-day-today {
    border-left: 3px solid #c4b5fd;
    background: rgba(124, 58, 237, 0.08);
  }
  .plan-mindset-block { background: rgba(139, 92, 255, 0.08); border-radius: 12px; padding: 16px; }
  .plan-mindset-text { margin: 0; color: #e9d5ff; line-height: 1.5; }
  .plan-shopping-block { margin-bottom: 32px; }
  .plan-shopping-details {
    border: 1px solid rgba(139, 92, 255, 0.25);
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.4);
  }
  .plan-shopping-summary {
    list-style: none;
    cursor: pointer;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
    color: #e9d5ff;
    user-select: none;
  }
  .plan-shopping-summary::-webkit-details-marker { display: none; }
  .plan-shopping-summary:hover { background: rgba(139, 92, 255, 0.1); border-radius: 12px; }
  .plan-shopping-chevron { font-size: 12px; opacity: 0.8; }
  .plan-shopping-inner { padding: 0 18px 18px; }
  .plan-shopping-filter-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .plan-shopping-filter-label {
    font-size: 14px;
    color: #94a3b8;
    margin: 0;
  }
  .plan-shopping-filter {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(139, 92, 255, 0.4);
    background: rgba(15, 15, 26, 0.9);
    color: #e2e8f0;
    font-size: 14px;
    min-width: 180px;
  }
  .plan-shopping-empty-day {
    margin: 0;
    padding: 12px 0;
    color: #94a3b8;
    font-size: 14px;
  }
  .plan-shopping-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .plan-shopping-list li {
    padding: 6px 10px;
    background: rgba(255,255,255,0.06);
    border-radius: 8px;
    color: #e9d5ff;
  }
  .plan-order-ingredients {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(139, 92, 255, 0.25);
  }
  .plan-day-shopping-actions {
    margin: 12px 16px 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(71, 85, 105, 0.4);
  }
  .plan-shopping-day-fallback-hint,
  .plan-shopping-day-fallback-note {
    margin: 0 0 10px;
    font-size: 13px;
    color: #94a3b8;
  }
  .plan-shopping-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .plan-btn-order {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #7c3aed, #6366f1);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .plan-btn-order:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
  }
  .plan-btn-share {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: rgba(139, 92, 255, 0.25);
    color: #e9d5ff;
    border: 1px solid rgba(139, 92, 255, 0.4);
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .plan-btn-share:hover:not(:disabled) {
    background: rgba(139, 92, 255, 0.35);
    transform: translateY(-1px);
  }
  .plan-btn-share:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  .plan-copy-hint {
    display: inline-block;
    margin-left: 12px;
    font-size: 13px;
    color: #86efac;
  }
  .plan-copy-success { color: #86efac !important; }
  .plan-copy-error { color: #f87171 !important; }
  .plan-order-links {
    margin: 12px 0 0;
    font-size: 13px;
    color: rgba(233, 213, 255, 0.85);
    line-height: 1.5;
  }
  .plan-order-links a {
    color: #a78bfa;
    text-decoration: none;
  }
  .plan-order-links a:hover {
    text-decoration: underline;
  }

  .plan-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .plan-card {
    background: linear-gradient(145deg, rgba(139, 92, 255, 0.12), rgba(99, 102, 241, 0.08));
    border: 1px solid rgba(139, 92, 255, 0.25);
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    animation: planFadeIn 0.4s ease-out backwards;
  }
  .plan-card-icon {
    font-size: 24px;
    margin-bottom: 4px;
  }
  .plan-card-label {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .plan-card-value {
    font-size: 14px;
    font-weight: 600;
    color: #e9d5ff;
    text-align: center;
  }

  .plan-macros-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .plan-macro-card {
    flex: 1;
    min-width: 80px;
    background: rgba(0,0,0,0.2);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .plan-macro-value {
    display: block;
    font-size: 20px;
    font-weight: 700;
    color: #a78bfa;
  }
  .plan-macro-label {
    font-size: 12px;
    color: #64748b;
  }

  .plan-today-banner {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    background: linear-gradient(135deg, rgba(155, 92, 255, 0.18), rgba(14, 165, 233, 0.12));
    border: 1px solid rgba(155, 92, 255, 0.35);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 28px;
  }
  .plan-today-emoji {
    font-size: 32px;
    line-height: 1;
  }
  .plan-today-banner h3 {
    margin: 0 0 6px;
    font-size: 18px;
    color: #fff;
  }
  .plan-today-banner p {
    margin: 0;
    color: #cbd5e1;
    font-size: 14px;
  }

  .plan-days {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .plan-day-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
  }
  .plan-day-placeholder {
    border-style: dashed;
    opacity: 0.85;
  }
  .plan-day-placeholder-msg {
    grid-column: 1 / -1;
    padding: 24px 16px;
    color: #94a3b8;
    font-size: 14px;
    text-align: center;
    margin: 0;
  }
  .plan-day-header-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .plan-day-header-btn:hover { background: rgba(255,255,255,0.03); }
  .plan-day-name {
    margin: 0;
    padding: 14px 18px;
    font-size: 16px;
    font-weight: 600;
    color: #c4b5fd;
    background: rgba(139, 92, 255, 0.1);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex: 1;
  }
  .plan-day-chevron {
    padding: 14px 18px;
    font-size: 12px;
    color: #94a3b8;
  }
  .plan-day-expanded .plan-day-chevron { color: #c4b5fd; }
  .plan-day-peek-btn {
    display: block;
    width: 100%;
    margin: 0;
    padding: 10px 18px 14px;
    border: none;
    border-top: 1px solid rgba(255,255,255,0.04);
    background: rgba(15, 23, 42, 0.35);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
    color: #94a3b8;
    transition: background 0.15s, color 0.15s;
  }
  .plan-day-peek-btn:hover {
    background: rgba(124, 58, 237, 0.1);
    color: #e2e8f0;
  }
  .plan-day-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-wrap: wrap;
  }
  .plan-day-nav-link {
    color: #a78bfa;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
  }
  .plan-day-nav-link:hover { color: #c4b5fd; text-decoration: underline; }
  .plan-day-nav-sep { color: #64748b; font-size: 12px; }
  .plan-day-nav-static {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #a78bfa;
  }
  .plan-meals {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    padding: 16px;
  }
  .plan-day-training {
    margin: 0 16px 16px;
    padding: 14px 16px;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 12px;
    border: 1px solid rgba(71, 85, 105, 0.5);
    font-family: inherit;
    font-size: 15px;
    line-height: 1.6;
    color: #e2e8f0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .plan-day-training-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(139, 92, 255, 0.3);
    letter-spacing: -0.02em;
    line-height: 1.3;
  }
  .plan-day-training-intro {
    margin: 0 0 14px;
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.6;
  }
  .plan-day-training-intro strong { color: #c4b5fd; }
  .plan-day-training-list {
    margin: 0;
    padding-left: 0;
    list-style: none;
  }
  .plan-day-training-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }
  .plan-day-training-item:last-child { margin-bottom: 0; }
  .plan-day-training-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .plan-day-training-body { flex: 1; min-width: 0; }
  .plan-day-training-thumb {
    display: block;
    width: 100%;
    max-width: 260px;
    height: 120px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    margin-bottom: 10px;
    background: rgba(15, 23, 42, 0.45);
  }
  .plan-day-training-header-btn {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .plan-day-training-header-btn:hover .plan-day-training-toggle-hint {
    background: rgba(124, 58, 237, 0.35);
    border-color: rgba(167, 139, 253, 0.6);
    color: #e9d5ff;
  }
  .plan-day-training-text {
    display: block;
    color: #f1f5f9;
    line-height: 1.55;
    font-weight: 600;
    font-size: 15px;
  }
  .plan-day-training-toggle-hint {
    display: inline-block;
    margin-top: 8px;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    color: #c4b5fd;
    background: rgba(124, 58, 237, 0.25);
    border: 1px solid rgba(139, 92, 255, 0.45);
    border-radius: 10px;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .plan-day-training-detail {
    margin-top: 12px;
    padding: 12px 14px;
    background: rgba(30, 41, 59, 0.6);
    border-radius: 10px;
    border: 1px solid rgba(71, 85, 105, 0.5);
  }
  .plan-day-training-detail-title {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 700;
    color: #f1f5f9;
  }
  .plan-day-training-detail-block {
    margin-bottom: 10px;
    font-size: 14px;
    color: #e2e8f0;
    line-height: 1.55;
  }
  .plan-day-training-detail-block:last-child { margin-bottom: 0; }
  .plan-day-training-detail-block strong { display: block; margin-bottom: 4px; color: #a78bfa; font-size: 13px; }
  .plan-day-training-detail-block p { margin: 0; line-height: 1.6; }
  .plan-day-training-equipment {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(71, 85, 105, 0.4);
    font-size: 12px;
    color: #94a3b8;
  }
  .plan-day-equip-line { margin: 0 0 4px; line-height: 1.4; }
  .plan-day-equip-line:last-child { margin-bottom: 0; }
  .plan-day-equip-line strong { color: #c4b5fd; font-weight: 600; }
  .plan-day-training :global(p) { margin: 0 0 8px; }
  .plan-day-training :global(p:last-child) { margin-bottom: 0; }
  .plan-day-training :global(ul) { margin: 0; padding-left: 20px; }
  .plan-day-training :global(li) { margin-bottom: 4px; }
  .plan-meal-card {
    background: #0f0f1a;
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .plan-meal-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  .plan-meal-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
    line-height: 1;
  }
  .plan-meal-body {
    flex: 1;
    min-width: 0;
    position: relative;
  }
  .plan-meal-type-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }
  .plan-meal-type {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #7c3aed;
    margin-bottom: 4px;
  }
  .plan-meal-recipe-btn {
    flex-shrink: 0;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid rgba(124, 58, 237, 0.75);
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.72), rgba(99, 102, 241, 0.72));
    color: #f8fafc;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .plan-meal-recipe-btn:hover {
    background: rgba(124, 58, 237, 0.4);
    border-color: rgba(167, 139, 250, 0.65);
  }
  .plan-meal-secondary-btn {
    font-size: 11px;
    color: #cbd5e1;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .plan-meal-secondary-btn:hover {
    border-color: rgba(167, 139, 250, 0.6);
    color: #e9d5ff;
    background: rgba(124, 58, 237, 0.12);
  }
  .plan-recipe-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    z-index: 1000;
    padding: 12px;
    box-sizing: border-box;
  }
  .plan-recipe-modal {
    background: linear-gradient(180deg, #1e1b4b 0%, #0f0f1a 100%);
    border: 1px solid rgba(139, 92, 255, 0.4);
    border-radius: 20px;
    max-width: 520px;
    width: 100%;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 48px rgba(0,0,0,0.5);
  }
  .plan-recipe-modal-dynamic {
    align-self: stretch;
  }
  .plan-recipe-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .plan-recipe-portion-label {
    position: absolute;
    top: 14px;
    right: 44px;
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(255,255,255,0.08);
    padding: 4px 10px;
    border-radius: 8px;
  }
  .plan-recipe-modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #e9d5ff;
  }
  .plan-recipe-modal-close {
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }
  .plan-recipe-modal-close:hover {
    background: rgba(239, 68, 68, 0.3);
  }
  .plan-recipe-modal-loading {
    padding: 40px 20px;
    text-align: center;
    color: #94a3b8;
  }
  .plan-recipe-modal-spinner {
    display: inline-block;
    width: 32px;
    height: 32px;
    border: 3px solid rgba(139, 92, 255, 0.3);
    border-top-color: #9b5cff;
    border-radius: 50%;
    animation: plan-spin 0.8s linear infinite;
  }
  .plan-recipe-modal-loading p {
    margin: 16px 0 0;
    font-size: 14px;
  }
  @keyframes plan-spin {
    to { transform: rotate(360deg); }
  }
  .plan-recipe-modal-body {
    padding: 20px;
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1 1 auto;
    min-height: 0;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.6;
    -webkit-overflow-scrolling: touch;
  }
  .plan-recipe-modal-body :global(p) { margin: 10px 0; }
  .plan-recipe-modal-body :global(b) { color: #e9d5ff; }
  .plan-recipe-modal-body :global(ul) { margin: 10px 0; padding-left: 20px; }
  .plan-recipe-modal-body :global(.plan-no-recipe-msg) {
    color: #fbbf24;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .plan-recipe-modal-body :global(.plan-no-recipe-hint) {
    color: #94a3b8;
    font-size: 13px;
  }
  .plan-recipe-modal-body :global(.recipe-nutrition-block) {
    margin: 16px 0 20px;
    padding: 14px 16px;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .plan-recipe-modal-body :global(.recipe-nutrition-title) {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #e9d5ff;
  }
  .plan-recipe-modal-body :global(.recipe-nutrients) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-row) {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-top) {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 8px 12px;
    font-size: 13px;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-label) {
    color: #cbd5e1;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-value) {
    color: #94a3b8;
    font-weight: 500;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-pct) {
    color: #94a3b8;
    font-size: 12px;
    min-width: 36px;
    text-align: right;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-bar-wrap) {
    height: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-bar) {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-bar-macro) {
    background: linear-gradient(90deg, #ec4899 0%, #f472b6 100%);
  }
  .plan-recipe-modal-body :global(.recipe-nutrient-bar-micro) {
    background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
  }
  .plan-meal-name {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.45;
  }
  .plan-meal-name-html {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.45;
  }
  .plan-meal-name-html :global(p) {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    line-height: inherit;
  }
  .plan-meal-name-html :global(b) {
    color: #e9d5ff;
  }
  .plan-meal-macros {
    margin: 0 0 10px;
    font-size: 12px;
    color: #64748b;
    line-height: 1.45;
  }
  .plan-meal-title-link {
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 600;
    color: #e9d5ff;
    text-align: left;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .plan-meal-title-link:hover {
    color: #f5d0fe;
  }
  .plan-meal-portions-h {
    margin: 8px 0 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
  }
  .plan-meal-portions {
    margin: 0 0 10px;
    padding-left: 18px;
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.45;
  }
  .plan-meal-portions li {
    margin: 3px 0;
  }
  .plan-meal-ingredients-details {
    margin: 6px 0 12px;
    border: 1px solid rgba(139,92,246,0.38);
    border-radius: 12px;
    background: linear-gradient(165deg,rgba(44,43,76,0.5) 0%,rgba(15,23,42,0.38) 100%);
    overflow: hidden;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
  }
  .plan-meal-ingredients-summary {
    cursor: pointer;
    list-style: none;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 700;
    color: #ddd6fe;
    line-height: 1.35;
  }
  .plan-meal-ingredients-summary::-webkit-details-marker {
    display: none;
  }
  .plan-meal-ingredients-panel {
    padding: 2px 12px 12px;
    border-top: 1px solid rgba(124,58,237,0.22);
    background: rgba(10,14,31,0.35);
  }
  .plan-meal-ingredients-panel .plan-meal-portions-h {
    margin-top: 10px;
  }
  .plan-meal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
  }
  .plan-meal-swap {
    font-size: 11px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .plan-meal-swap:hover { color: #c4b5fd; border-color: rgba(139, 92, 255, 0.5); }
  .plan-meal-pin {
    font-size: 11px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .plan-meal-pin:hover { color: #22c55e; border-color: rgba(34, 197, 94, 0.5); }
  .plan-meal-pin-active {
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.5);
  }
  .plan-pin-toast {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #22c55e;
  }
  .plan-pin-toast-error { color: #f87171; }
  .plan-export-row { padding-top: 0; }
  .plan-export-btn {
    padding: 10px 18px;
    background: rgba(139, 92, 255, 0.2);
    border: 1px solid rgba(139, 92, 255, 0.4);
    border-radius: 12px;
    color: #e9d5ff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .plan-export-btn:hover { background: rgba(139, 92, 255, 0.3); }
  .plan-recipe-modal-actions { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); }
  .plan-meal-ingredients-modal .plan-recipe-modal-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .plan-modal-inline-btn {
    width: 100%;
    min-height: 42px;
    font-size: 13px;
  }
  .plan-modal-links-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .plan-modal-link-btn {
    min-height: 42px;
    font-size: 13px;
  }
  .plan-modal-ingredients-list {
    margin: 0 0 10px;
    padding-left: 20px;
    color: #e2e8f0;
  }
  .plan-order-intro {
    margin: 0 0 10px;
    color: #e2e8f0;
  }
  .plan-order-pre {
    margin: 0 0 10px;
    white-space: pre-wrap;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 10px 12px;
    color: #e2e8f0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    max-height: 220px;
    overflow: auto;
  }
  .plan-recipe-modal-replace-btn {
    width: 100%;
    padding: 12px 16px;
    background: linear-gradient(135deg, #7c3aed, #9b5cff);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
  .plan-recipe-modal-replace-btn:hover { opacity: 0.95; }

  .plan-recipe-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    overflow: hidden;
  }
  .plan-recipe-card summary {
    padding: 14px 18px;
    font-weight: 600;
    color: #c4b5fd;
    cursor: pointer;
    list-style: none;
  }
  .plan-recipe-card summary::-webkit-details-marker { display: none; }
  .plan-recipe-card summary::after {
    content: ' ▶';
    font-size: 12px;
    color: #64748b;
  }
  .plan-recipe-card[open] summary::after { content: ' ▼'; }
  .plan-recipe-body {
    padding: 0 18px 18px;
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.6;
  }
  .plan-recipe-body :global(p) { margin: 8px 0; }
  .plan-recipe-body :global(b) { color: #e9d5ff; }

  .plan-expandable {
    margin-top: 24px;
  }
  .plan-toggle {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #a78bfa;
    padding: 14px 20px;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    width: 100%;
    transition: all 0.2s;
  }
  .plan-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: #9b5cff;
  }
  .plan-full-content {
    margin-top: 16px;
    padding: 24px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    line-height: 1.7;
  }
  .plan-full-content :global(h2) { color: #fff; font-size: 22px; margin: 0 0 16px; }
  .plan-full-content :global(h3) { color: #e9d5ff; font-size: 17px; margin: 20px 0 10px; }
  .plan-full-content :global(h4) { color: #c4b5fd; font-size: 15px; margin: 14px 0 8px; }
  .plan-full-content :global(p) { margin: 8px 0; color: #cbd5e1; }
  .plan-full-content :global(ul), .plan-full-content :global(ol) { margin: 12px 0; padding-left: 24px; }
  .plan-full-content :global(li) { margin: 6px 0; color: #cbd5e1; }
  .plan-full-content :global(b) { color: #e9d5ff; }

  .plan-macros { margin-bottom: 24px; }
  .plan-macros h3 { font-size: 18px; margin-bottom: 12px; color: #e9d5ff; }
  .plan-macros-content {
    background: rgba(255, 255, 255, 0.03);
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .empty-plan {
    color: #94a3b8;
    text-align: center;
    padding: 20px;
  }
  .empty-plan a {
    color: #a78bfa;
    text-decoration: underline;
  }

  @keyframes planFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 767px) {
    .plan-nav { flex-wrap: wrap; gap: 10px; padding: 12px 16px; justify-content: center; }
    .plan-nav-item { font-size: 14px; padding: 10px 14px; min-height: 48px; display: inline-flex; align-items: center; touch-action: manipulation; }
    .plan-block { padding: 16px; }
    .plan-days { gap: 20px; }
    .plan-day-card { border-radius: 14px; }
    .plan-day-header-btn { padding: 0; }
    .plan-day-name { padding: 14px 16px; font-size: 15px; }
    .plan-day-chevron { padding: 14px 16px; }
    .plan-meals { grid-template-columns: 1fr; gap: 16px; padding: 16px; }
    .plan-meal-card { border-radius: 12px; padding: 16px; gap: 14px; }
    .plan-meal-icon { width: 44px; height: 44px; font-size: 20px; }
    .plan-meal-name, .plan-meal-name-html { font-size: 15px; }
    .plan-meal-macros { font-size: 11px; }
    .plan-meal-actions { gap: 12px; flex-wrap: wrap; }
    .plan-meal-secondary-btn,
    .plan-meal-swap, .plan-meal-pin, .plan-meal-recipe-btn {
      min-height: 48px;
      padding: 12px 16px;
      font-size: 14px;
      touch-action: manipulation;
    }
    .plan-modal-links-row { grid-template-columns: 1fr; }
    .plan-export-btn { min-height: 48px; padding: 12px 20px; touch-action: manipulation; }
    .plan-day-training { margin: 0 14px 14px; padding: 14px 16px; }
    .plan-day-training-title { font-size: 1.2rem; }
    .plan-day-training-intro { font-size: 14px; line-height: 1.5; }
    .plan-day-training-toggle-hint { padding: 12px 14px; font-size: 13px; min-height: 48px; box-sizing: border-box; display: inline-flex; align-items: center; touch-action: manipulation; }
    .plan-day-training-list { padding-left: 18px; }
    .plan-day-training-item { padding: 14px 0; }
    .plan-day-training-detail { padding: 14px 12px; font-size: 14px; line-height: 1.5; }
    .plan-btn-order, .plan-btn-share { min-height: 48px; padding: 14px 20px; touch-action: manipulation; }
    .plan-today-banner { padding: 16px; gap: 12px; margin-bottom: 20px; }
    .plan-today-banner h3 { font-size: 16px; }
    .plan-today-banner p { font-size: 13px; }
  }
  @media (max-width: 640px) {
    .plan-hero { padding: 20px 16px 24px; margin-left: -16px; margin-right: -16px; }
    .plan-hero-title { font-size: 18px; }
    .plan-cards-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .plan-day-training-list { padding-left: 16px; }
    .plan-day-training-item { padding: 12px 0; }
    .plan-day-training-detail { padding: 12px 10px; font-size: 13px; }
    .plan-recipe-modal-overlay { padding: 10px; align-items: center; }
    .plan-recipe-modal { max-width: 100%; max-height: 90vh; border-radius: 16px; }
    .plan-recipe-modal-header { padding: 14px 16px; }
  }
  @media (max-width: 380px) {
    .plan-cards-grid { grid-template-columns: 1fr; }
    .plan-hero-title { font-size: 16px; }
  }
`;
