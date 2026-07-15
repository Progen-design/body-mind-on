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
  flattenShoppingSections,
} from '../lib/shoppingListBuilder';
import { mealDisplayTitleForStructuredMeal } from '../lib/mealDisplayNameHelpers';
import { parsePlanHtml } from '../lib/parsePlanHtml';
import { getPlanOutputMode, shouldRenderTraining } from '../lib/planOutputMode.js';
import { buildPlanPdfHtml } from '../lib/planPdf';
import { formatExerciseSetsRepsDisplay } from '../lib/planDataIntegrity.js';
import { renderPlanHtmlFromStructured } from '../lib/planRenderer.js';
import { catalogLookupIdFromMeal } from '../lib/recipeDetailUrl.js';
import {
  buildMealRecipeModalHtml,
  buildMealRecipeRateLimitFallbackHtml,
  createMealDisplayModelFromStructuredMeal,
  hasLocalMealRecipeDetail,
  mergeRecipeApiErrorWithLocalFallback,
  shouldFetchMealRecipeFromApi,
} from '../lib/mealRecipeDisplay.js';
import { collectExerciseMediaSources, hasDisplayableExerciseMedia, isVideoMediaUrl } from '../lib/exerciseMediaHelpers.js';
import { getExerciseInstructionGuide } from '../lib/exerciseInstructions.js';
import { resolveToCanonicalKey } from '../lib/exerciseCanonicalMap.js';
import {
  EXERCISE_MEDIA_PLACEHOLDER_CS,
  exerciseDisplayNameMatchesCanonical,
} from '../lib/exerciseIntegrity.js';
import { addCalendarDaysIsoPrague, calendarDateIsoInPrague, weekdayIndexJsFromPragueIso } from '../lib/czechCalendar';
import { buildMacroPillCss, BM_ON_DESIGN, BM_ON_GRADIENTS } from '../lib/designTokens.js';
import { buildMacroEnergyNutritionHtml } from '../lib/recipeDetailHtml.js';
import { buildStructuredWeekSource } from '../lib/plan/structuredWeekSource.js';
import ProfileTodayPanels from './profile/ProfileTodayPanels';
import { trackProductEvent } from '../lib/productAnalytics';
import ProfileDayMealsPanel from './profile/ProfileDayMealsPanel';
import MacroRatioChart from './MacroRatioChart';

function exerciseMediaMatchesName(name, canonicalKey) {
  if (!canonicalKey) {
    const nameKey = resolveToCanonicalKey(name);
    if (!nameKey) return true;
    return true;
  }
  return exerciseDisplayNameMatchesCanonical({
    canonical_key: canonicalKey,
    display_name_cs: name,
    name_cs: name,
    name,
  }).ok;
}

function workoutExercisesList(workout, { excludeRest = false } = {}) {
  const raw = Array.isArray(workout?.exercises) ? workout.exercises : [];
  if (!excludeRest) return raw;
  return raw.filter((ex) => String(ex?.canonical_key || '').toLowerCase() !== 'rest');
}

function renderExerciseInstructionBlock(canonicalKey) {
  const guide = getExerciseInstructionGuide(canonicalKey);
  if (!guide) return null;
  return (
    <div className="plan-exercise-guide" style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5 }}>
      <p style={{ margin: '0 0 8px 0' }}><strong>Jak na to:</strong> {guide.how}</p>
      {guide.breathing ? (
        <p style={{ margin: '0 0 8px 0' }}><strong>Dýchání:</strong> {guide.breathing}</p>
      ) : null}
      {guide.tempo ? (
        <p style={{ margin: '0 0 8px 0' }}><strong>Tempo:</strong> {guide.tempo}</p>
      ) : null}
      <p style={{ margin: '0 0 8px 0' }}><strong>Na co si dát pozor:</strong> {guide.caution}</p>
      <p style={{ margin: 0 }}><strong>Lehčí varianta:</strong> {guide.easier}</p>
    </div>
  );
}

export { parsePlanHtml };

function renderExerciseMediaPreview(media, name, onMediaError) {
  const { gifUrl, imageUrl, videoUrl } = media || {};
  const alt = `Ukázka cviku ${name}`;
  if (gifUrl) {
    return (
      <img
        src={gifUrl}
        alt={alt}
        className="plan-exercise-media"
        loading="lazy"
        onError={onMediaError}
      />
    );
  }
  if (imageUrl && !isVideoMediaUrl(imageUrl)) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        className="plan-exercise-media"
        loading="lazy"
        onError={onMediaError}
      />
    );
  }
  if (videoUrl || (imageUrl && isVideoMediaUrl(imageUrl))) {
    const src = videoUrl || imageUrl;
    return (
      <video
        src={src}
        className="plan-exercise-media"
        controls
        playsInline
        preload="metadata"
        onError={onMediaError}
      />
    );
  }
  return null;
}

function stripRecipeSourceMetaHtml(html) {
  if (!html || typeof html !== 'string') return html || '';
  return html.replace(/<p[^>]*class=["'][^"']*plan-recipe-source-meta[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, '');
}

function ensureMealModalMacroBar(html, displayModel) {
  const cleaned = stripRecipeSourceMetaHtml(html || '');
  if (!displayModel) return cleaned;
  if (/recipe-macro-energy-bar/i.test(cleaned)) return cleaned;
  const macroBlock = buildMacroEnergyNutritionHtml(displayModel);
  if (!macroBlock) return cleaned;
  return `${cleaned}${macroBlock}`;
}

async function fetchExerciseMediaFromApi({ canonicalKey, wgerId, name }) {
  const params = new URLSearchParams();
  if (canonicalKey) params.set('canonical_key', canonicalKey);
  if (wgerId != null) params.set('wger_id', String(wgerId));
  if (name) params.set('name', name);
  const res = await fetch(`/api/exercise-media?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.ok) return null;
  return collectExerciseMediaSources(data);
}

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
function collapsedDayMealsPeekParts(day, di, mealOverrides, structuredPlan, planHtml) {
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
    if (title.length > 120) title = `${title.slice(0, 117)}…`;
    if (m.type && title) parts.push(`${m.type}: ${title}`);
    else if (title) parts.push(title);
    else if (m.type) parts.push(m.type);
  });
  return parts;
}

/** Pořadí dnů odpovídající getDay(): 0=Neděle, 1=Pondělí, …, 6=Sobota */
const CZECH_DAYS_BY_DOW = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/** Připočte dny k ISO datu (YYYY-MM-DD) v Europe/Prague. */
function addDaysToDateStr(dateStr, days) {
  return addCalendarDaysIsoPrague(String(dateStr || '').split('T')[0], days);
}

/** Pro slot týdne (valid_from + index) vrátí český název dne v Europe/Prague. */
function getDayNameForPlanSlot(validFromIso, slotIndex) {
  const vf = String(validFromIso || '').split('T')[0];
  if (!vf) return '';
  return CZECH_DAYS_BY_DOW[weekdayIndexJsFromPragueIso(vf, slotIndex)] || '';
}

/** Vybere den z pole days, který odpovídá slotu týdne. Fallback pro plány s nesprávným pořadím dnů. */
function findDayForDate(days, dateIso, origIdx, validFromIso) {
  const expected = getDayNameForPlanSlot(validFromIso, origIdx);
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

const SHORT_DAY_LABELS = [
  ['Pondělí', 'Po'],
  ['Úterý', 'Út'],
  ['Středa', 'St'],
  ['Čtvrtek', 'Čt'],
  ['Pátek', 'Pá'],
  ['Sobota', 'So'],
  ['Neděle', 'Ne'],
];

function shortDayNavLabel(dayName) {
  const n = String(dayName || '');
  for (const [full, short] of SHORT_DAY_LABELS) {
    if (n.includes(full)) return short;
  }
  return n.slice(0, 2) || 'Den';
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

/** Odstraní z HTML jména jídla vložené odkazy na detail receptu (duplicita vedle tlačítka Recept). */
function stripInlineRecipeDetailAnchors(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/<a\b[^>]*href\s*=\s*["'][^"']*(?:spoonacular-recipe|recipe-from-catalog)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
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
  if (r) {
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
function mealMacroItemsFromTrust(mealTrust) {
  if (!mealTrust) return [];
  const items = [];
  if (mealTrust.calories != null && Number.isFinite(Number(mealTrust.calories))) {
    items.push({ key: 'kcal', label: 'cca', value: `${Math.round(Number(mealTrust.calories))} kcal`, tone: 'kcal' });
  }
  if (mealTrust.protein_g != null && Number.isFinite(Number(mealTrust.protein_g))) {
    items.push({ key: 'b', label: 'Bílkoviny', value: `${Math.round(Number(mealTrust.protein_g))} g`, tone: 'protein' });
  }
  if (mealTrust.carbs_g != null && Number.isFinite(Number(mealTrust.carbs_g))) {
    items.push({ key: 's', label: 'Sacharidy', value: `${Math.round(Number(mealTrust.carbs_g))} g`, tone: 'carbs' });
  }
  if (mealTrust.fat_g != null && Number.isFinite(Number(mealTrust.fat_g))) {
    items.push({ key: 't', label: 'Tuky', value: `${Math.round(Number(mealTrust.fat_g))} g`, tone: 'fat' });
  }
  if (mealTrust.fiber_g != null && Number.isFinite(Number(mealTrust.fiber_g))) {
    items.push({ key: 'fiber', label: 'Vláknina', value: `${Math.round(Number(mealTrust.fiber_g))} g`, tone: 'fiber' });
  }
  return items;
}

function parseNumberFromMacroText(value) {
  const txt = String(value || '');
  const m = txt.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractTargetsFromParsedMacros(parsedMacros) {
  const out = { calories_per_day: null, protein_g: null, carbs_g: null, fat_g: null };
  if (!Array.isArray(parsedMacros)) return out;
  parsedMacros.forEach((item) => {
    const label = String(item?.label || '').toLowerCase();
    const valueNum = parseNumberFromMacroText(item?.value);
    if (valueNum == null) return;
    if (label.includes('kcal') || label.includes('kalori')) out.calories_per_day = valueNum;
    if (label.includes('bílkov') || label.includes('protein')) out.protein_g = valueNum;
    if (label.includes('sachar')) out.carbs_g = valueNum;
    if (label.includes('tuk')) out.fat_g = valueNum;
  });
  return out;
}

function resolvePlanHtml(planObj, patchObj) {
  const directHtml = patchObj?.plan_html || planObj?.plan_html || '';
  if (directHtml) return directHtml;
  const structured = patchObj?.structured_plan_json || planObj?.structured_plan_json;
  if (structured && typeof structured === 'object') {
    try {
      return renderPlanHtmlFromStructured(structured);
    } catch (_) {
      return '';
    }
  }
  return '';
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

export default function PlanViewer({
  plan,
  userName: _userName,
  hideHero,
  hideShoppingList = false,
  dietaryPreferences = '',
  canPinMeals = true,
  onToast,
  outputMode: outputModeProp,
  onRegeneratePlan,
  regeneratingPlan = false,
  canRegeneratePlan = false,
  regenerateBlockedMessage = null,
  todayFirstLayout = false,
  program = 'START',
  trainingEnvironmentLabel = '',
}) {
  const [parsed, setParsed] = useState(null);
  const [planPatch, setPlanPatch] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null); // { title, content, anchorRect, hasRecipe, openId? }
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
  const [mealTrustMap, setMealTrustMap] = useState({});
  const [exerciseMediaMap, setExerciseMediaMap] = useState({});
  const [showRawPlanFallback, setShowRawPlanFallback] = useState(false);
  const [exerciseHintModal, setExerciseHintModal] = useState(null); // { name, part, wgerId }
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(!todayFirstLayout);
  const [expandedDayCards, setExpandedDayCards] = useState(() => new Set());
  const recipeOpenHandlersRef = useRef({});
  const swapOpenHandlersRef = useRef({});
  const pinOpenHandlersRef = useRef({});
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

  const getCatalogRecipeDetail = (recipeId, displayModel = null) => {
    if (!recipeId || !Number.isInteger(Number(recipeId))) return Promise.resolve(null);
    const params = new URLSearchParams({ id: String(recipeId) });
    if (displayModel?.title) params.set('display_name', String(displayModel.title).slice(0, 150));
    const meal = displayModel?.normalizedMeal;
    if (meal?.type) params.set('meal_type', String(meal.type));
    if (displayModel?.calories != null) params.set('kcal', String(Math.round(displayModel.calories)));
    if (displayModel?.protein_g != null) params.set('protein_g', String(Math.round(displayModel.protein_g)));
    if (displayModel?.carbs_g != null) params.set('carbs_g', String(Math.round(displayModel.carbs_g)));
    if (displayModel?.fat_g != null) params.set('fat_g', String(Math.round(displayModel.fat_g)));
    return fetch(`/api/recipe-from-catalog?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        const html = ok && data?.ok && data?.html ? data.html : null;
        const errMsg = !html && data?.error ? data.error : null;
        const result = html || (errMsg ? recipeErrorHtml(errMsg) : null);
        return mergeRecipeApiErrorWithLocalFallback(result, displayModel) || result;
      })
      .catch(() => (displayModel && hasLocalMealRecipeDetail(displayModel)
        ? buildMealRecipeModalHtml(displayModel)
        : null));
  };

  const getRecipeForDish = (dishName, avoid = '', displayModel = null) => {
    if (!(dishName || '').trim()) return Promise.resolve(null);
    let url = '/api/recipe?dish=' + encodeURIComponent((dishName || '').trim().slice(0, 150));
    if (avoid && typeof avoid === 'string' && avoid.trim()) url += '&avoid=' + encodeURIComponent(avoid.trim().slice(0, 300));
    return fetch(url)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        const html = ok && data?.ok && data?.html ? data.html : null;
        const errMsg = !html && data?.error ? data.error : null;
        const result = html || (errMsg ? recipeErrorHtml(errMsg) : null);
        return mergeRecipeApiErrorWithLocalFallback(result, displayModel) || result;
      })
      .catch(() => (displayModel && hasLocalMealRecipeDetail(displayModel)
        ? buildMealRecipeModalHtml(displayModel)
        : null));
  };

  useEffect(() => {
    const html = resolvePlanHtml(plan, planPatch);
    if (html && typeof document !== 'undefined') {
      const result = parsePlanHtml(html);
      setParsed(result);
      const noGraphical = !result || ((result.days?.length ?? 0) === 0 && Object.keys(result.rawSections || {}).length === 0);
      if (noGraphical) setShowRawPlanFallback(true);
    } else {
      setParsed(null);
    }
  }, [plan?.plan_html, planPatch?.plan_html, plan?.structured_plan_json, planPatch?.structured_plan_json]);

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

  // Po načtení plánu posunout na „dnešek“ – jen v klasickém layoutu (ne today-first profil)
  useEffect(() => {
    if (todayFirstLayout) return;
    if (typeof document === 'undefined' || !parsed?.days?.length || !plan?.valid_from) return;
    const planFromStr = (plan.valid_from || '').split('T')[0];
    const todayIsoStr = calendarDateIsoInPrague(new Date());
    if (planFromStr && planFromStr > todayIsoStr) return; // náhled budoucího týdne – neposouvat
    const t = setTimeout(() => {
      let todayIdx = -1;
      for (let i = 0; i < 7; i += 1) {
        if (addDaysToDateStr(planFromStr, i) === todayIsoStr) {
          todayIdx = i;
          break;
        }
      }
      const el = document.getElementById(todayIdx >= 0 ? `plan-day-card-${todayIdx}` : 'plan-days');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
    return () => clearTimeout(t);
  }, [todayFirstLayout, parsed?.days?.length, plan?.valid_from, plan?.plan_html]);

  useEffect(() => {
    if (!plan?.plan_html || typeof document === 'undefined') {
      setMealTrustMap({});
      setExerciseMediaMap({});
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
        setExerciseMediaMap(data?.exercise_media && typeof data.exercise_media === 'object' ? data.exercise_media : {});
      } catch (_) {
        if (!cancelled) {
          setMealTrustMap({});
          setExerciseMediaMap({});
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
      const msg = pinned ? 'Odebráno z preferencí.' : 'Uloženo. Tohle jídlo budeme preferovat v dalších plánech.';
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
    if (recipeModal || swapModal || exerciseHintModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [recipeModal, swapModal, exerciseHintModal]);

  const hasRenderablePlan = !!(
    plan && (planPatch?.plan_html || plan.plan_html || planPatch?.structured_plan_json || plan.structured_plan_json)
  );

  const todayIsoStr = calendarDateIsoInPrague(new Date());
  const planFromStr = (plan.valid_from || '').split('T')[0];
  const isFuturePlan = !!planFromStr && planFromStr > todayIsoStr;
  const today = new Date(`${todayIsoStr}T12:00:00`);
  const todayStr = today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const isValid = plan.valid_until ? new Date(plan.valid_until + 'T23:59:59') >= today : true;
  const validUntilDate = plan.valid_until ? new Date(plan.valid_until + 'T12:00:00') : null;
  const daysUntilExpiry = validUntilDate ? Math.ceil((validUntilDate - today) / (24 * 60 * 60 * 1000)) : null;
  const planExpiresSoon = isValid && daysUntilExpiry != null && daysUntilExpiry >= 0 && daysUntilExpiry <= 2;
  const showGraphical = parsed && (parsed.personal?.length > 0 || parsed.days?.length > 0 || Object.keys(parsed.rawSections || {}).length > 0);
  const hasParsedDays = (parsed?.days?.length ?? 0) > 0;

  const effectivePlan = planPatch ? { ...plan, ...planPatch } : plan;
  const structuredPlan = effectivePlan?.structured_plan_json && typeof effectivePlan.structured_plan_json === 'object'
    ? effectivePlan.structured_plan_json
    : null;
  const effectiveTargets = structuredPlan?.targets && typeof structuredPlan.targets === 'object'
    ? structuredPlan.targets
    : {
      calories_per_day: Number(effectivePlan?.daily_calories) || null,
      protein_g: Number(effectivePlan?.macros?.protein_g) || null,
      carbs_g: Number(effectivePlan?.macros?.carbs_g) || null,
      fat_g: Number(effectivePlan?.macros?.fat_g) || null,
    };
  const parsedTargets = extractTargetsFromParsedMacros(parsed?.macros);
  const targetMismatch =
    parsedTargets.calories_per_day != null
    && effectiveTargets.calories_per_day != null
    && Math.abs(Number(parsedTargets.calories_per_day) - Number(effectiveTargets.calories_per_day)) > 20;
  if (process.env.NODE_ENV !== 'production' && targetMismatch) {
    console.warn('Plan target mismatch between today and weekly view', {
      plan_id: plan?.id ?? null,
      parsed_calories_target: parsedTargets.calories_per_day,
      effective_calories_target: effectiveTargets.calories_per_day,
    });
  }
  const resolvedTrainingLabel = trainingEnvironmentLabel
    || (structuredPlan?.training_environment_label
      ? `Typ: ${structuredPlan.training_environment_label}`
      : '');

  const {
    planWeekDays,
    todayWeekIdx,
    todayWeekDay,
  } = buildStructuredWeekSource({
    parsedDays: parsed?.days || [],
    structuredPlan,
    validFrom: plan?.valid_from || '',
    validUntil: plan?.valid_until || '',
    todayIsoStr,
    isFuturePlan,
    planHtml: plan?.plan_html || '',
    buildMealsFromStructuredDay,
  });

  useEffect(() => {
    if (!todayFirstLayout || !planWeekDays?.length) return;
    const ti = planWeekDays.findIndex((d) => d.isToday);
    setExpandedDayCards(new Set(ti >= 0 ? [ti] : [0]));
    setWeeklyPlanOpen(false);
  }, [todayFirstLayout, plan?.id, planWeekDays.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || hideShoppingList) return;
    const openShopping = () => setShoppingListOpen(true);
    window.addEventListener('bmo:open-shopping-list', openShopping);
    return () => window.removeEventListener('bmo:open-shopping-list', openShopping);
  }, [hideShoppingList]);

  const planViewedRef = useRef(false);
  const dailyPlanViewedRef = useRef(false);

  useEffect(() => {
    if (!hasRenderablePlan || planViewedRef.current) return;
    planViewedRef.current = true;
    trackProductEvent('plan_viewed', { program: String(program || 'START').toUpperCase() }, { source: 'PlanViewer' });
  }, [hasRenderablePlan, program, plan?.id]);

  useEffect(() => {
    if (!todayFirstLayout || !planWeekDays?.length || dailyPlanViewedRef.current) return;
    const ti = planWeekDays.findIndex((d) => d.isToday);
    if (ti < 0) return;
    dailyPlanViewedRef.current = true;
    trackProductEvent('daily_plan_viewed', { day_number: ti + 1, program: String(program || 'START').toUpperCase() }, { source: 'PlanViewer' });
  }, [todayFirstLayout, planWeekDays, program]);

  if (!hasRenderablePlan) {
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

  const weekShoppingSections = buildShoppingSectionsForWeek({
    planWeekDays,
    recipes: parsed?.recipes || [],
    structuredPlan,
    mealOverrides,
  });

  const buildMealActionContext = (di, mi) => {
    const day = planWeekDays[di];
    if (!day) return null;
    const meal = day.meals?.[mi];
    if (!meal) return null;
    const overrideKey = `${day.originalIndex ?? di}_${mi}`;
    const override = mealOverrides[overrideKey];
    const mealFullText = override
      ? `${meal.type || ''} ${override.title || ''}`.trim()
      : `${meal.type || ''} ${meal.text || ''}`.trim();
    const matchingRecipeHtml = recipeHtmlByMealName(mealFullText, parsed?.recipes || []);
    const dishTitle = (meal.text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const mealLookupKey = meal.meal_key || null;
    const structDayIdx = day.originalIndex ?? di;
    const structDay = day.structDay
      || (structuredPlan?.days?.[structDayIdx] ?? null);
    const structMeal = structDay
      ? structuredMealForStructuredDay(structDay, meal.type, mi)
      : structuredPlan?.days
        && Array.isArray(structuredPlan.days)
        && structDayIdx >= 0
        && structDayIdx < structuredPlan.days.length
        ? structuredMealForDaySlot(structuredPlan, structDayIdx, meal.type, mi)
        : null;
    const displayMealTitle = structMeal
      ? mealDisplayTitleForStructuredMeal(structMeal, plan.plan_html || '', day.dayName || '')
      : dishTitle;
    const modalTitle = meal.type && displayMealTitle
      ? `${meal.type}: ${displayMealTitle}`
      : displayMealTitle || meal.type || mealFullText || 'Jídlo';
    const mealTrust = mergeTrustWithStructuredPlanMeal(
      resolveMealTrustMerged(meal, mealFullText || meal.text || meal.type, mealTrustMap, mealLookupKey),
      structMeal
    );
    const catalogLookupIdForModal = structMeal
      ? catalogLookupIdFromMeal(structMeal)
      : mealTrust?.recipe_id != null
        && String(mealTrust.recipe_id).trim() !== ''
        && Number.isFinite(Number(mealTrust.recipe_id))
        ? Number(mealTrust.recipe_id)
        : null;
    const displayModel = structMeal ? createMealDisplayModelFromStructuredMeal(structMeal) : null;
    const mealTextForPin = override
      ? (override.title || '')
      : (meal.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
    return {
      day,
      meal,
      overrideKey,
      override,
      mealFullText,
      matchingRecipeHtml,
      modalTitle,
      mealTrust,
      catalogLookupIdForModal,
      displayModel,
      mealTextForPin,
    };
  };

  const performOpenRecipe = (di, mi, e) => {
    const ctx = buildMealActionContext(di, mi);
    if (!ctx) return;
    const {
      override,
      modalTitle,
      displayModel,
      mealFullText,
      matchingRecipeHtml,
      catalogLookupIdForModal,
      meal,
    } = ctx;
    if (e?.preventDefault) e.preventDefault();
    if (e?.stopPropagation) e.stopPropagation();
    const button = e?.currentTarget;
    const rect = button?.getBoundingClientRect?.();
    const useAnchoredModal = typeof window !== 'undefined' && window.innerWidth >= 768;
    const anchorRect = useAnchoredModal && rect
      ? { top: rect.bottom + 8, left: rect.left, width: rect.width }
      : null;
    recipeOpenIdRef.current += 1;
    const thisOpenId = recipeOpenIdRef.current;

    if (override?.content) {
      setRecipeModal({
        openId: thisOpenId,
        title: override.title || modalTitle,
        content: stripRecipeSourceMetaHtml(recipeContentOnly(override.content)),
        anchorRect,
        hasRecipe: true,
        loading: false,
      });
      return;
    }

    if (displayModel && hasLocalMealRecipeDetail(displayModel)) {
      setRecipeModal({
        openId: thisOpenId,
        title: modalTitle,
        content: ensureMealModalMacroBar(buildMealRecipeModalHtml(displayModel), displayModel),
        anchorRect,
        hasRecipe: true,
        loading: false,
        source: displayModel.source,
        consistencyStatus: displayModel.consistencyStatus,
      });
      return;
    }

    const dishName = (mealFullText.replace(/\s*\([^)]*\)\s*$/g, '').trim() || meal.type || 'Jídlo').slice(0, 150);
    const isUnverifiedPlaceholder = mealFullText?.toLowerCase().includes('neověřeno') || dishName === 'Jídlo';
    const recipeId = displayModel?.normalizedMeal
      ? catalogLookupIdFromMeal(displayModel.normalizedMeal)
      : catalogLookupIdForModal;
    const htmlRecipeFallback = matchingRecipeHtml ? recipeContentOnly(matchingRecipeHtml) : null;
    setRecipeModal({
      openId: thisOpenId,
      title: modalTitle,
      content: null,
      anchorRect,
      hasRecipe: true,
      loading: true,
    });
    const loadRecipe = async () => {
      if (displayModel && !shouldFetchMealRecipeFromApi(displayModel)) {
        return buildMealRecipeModalHtml(displayModel);
      }
      if (recipeId != null) {
        const catalogRecipe = await getCatalogRecipeDetail(recipeId, displayModel);
        if (catalogRecipe) return catalogRecipe;
      }
      if (htmlRecipeFallback) return htmlRecipeFallback;
      if (isUnverifiedPlaceholder) {
        return recipeErrorHtml('Recept pro toto jídlo není v katalogu. Zkus ho nahradit jiným.');
      }
      const fallbackRecipe = await getRecipeForDish(dishName, '', displayModel);
      if (fallbackRecipe) return fallbackRecipe;
      if (displayModel?.title) {
        return buildMealRecipeRateLimitFallbackHtml(displayModel);
      }
      return `
        <p class="plan-no-recipe-msg">Recept se nepodařilo automaticky dohledat.</p>
        <p class="plan-no-recipe-hint">Zkus vygenerovat náhradní variantu jídla.</p>
      `;
    };
    loadRecipe().then((html) => {
      const fallback = displayModel?.title
        ? buildMealRecipeRateLimitFallbackHtml(displayModel)
        : '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo znovu.</p>';
      const merged = ensureMealModalMacroBar(html || fallback, displayModel);
      setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: merged, loading: false } : prev));
    }).catch(() => {
      const fallback = displayModel?.title
        ? buildMealRecipeRateLimitFallbackHtml(displayModel)
        : '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo znovu.</p>';
      const merged = ensureMealModalMacroBar(fallback, displayModel);
      setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: merged, loading: false } : prev));
    });
  };

  const performPinMealForNextWeek = (di, mi) => {
    const ctx = buildMealActionContext(di, mi);
    if (!ctx) return;
    const { meal, mealTextForPin, overrideKey } = ctx;
    return handleTogglePin(meal.type || '', mealTextForPin, overrideKey);
  };

  const buildExerciseActionContext = (di, xi, { excludeRest = false } = {}) => {
    const day = planWeekDays[di];
    if (!day) return null;
    const dIdx = day.originalIndex ?? di;
    const wk = day.structDay?.workout ?? structuredPlan?.days?.[dIdx]?.workout;
    const list = workoutExercisesList(wk, { excludeRest });
    const ex = list[xi];
    if (!ex) return null;
    return { day, ex, dIdx, list };
  };

  const performOpenExercise = async (di, xi, { excludeRest = false } = {}) => {
    const ctx = buildExerciseActionContext(di, xi, { excludeRest });
    if (!ctx) return;
    const { ex } = ctx;
    const name = ex.display_name_cs || ex.name_cs || ex.name || 'Cvik';
    const wgerId =
      ex.wger_exercise_id != null && Number.isFinite(Number(ex.wger_exercise_id))
        ? Number(ex.wger_exercise_id)
        : null;
    const part = formatExerciseSetsRepsDisplay(ex);
    const mediaKey = ex.canonical_key ? normalizeLookupKey(ex.canonical_key) : normalizeLookupKey(name);
    const canonicalKey = ex.canonical_key || mediaKey || null;
    const mediaFromMap =
      (wgerId != null ? exerciseMediaMap[`wger:${Number(wgerId)}`] : null) ||
      (mediaKey ? exerciseMediaMap[mediaKey] : null) ||
      null;
    let media = collectExerciseMediaSources({
      image_url: ex.image_url,
      gif_url: ex.gif_url,
      video_url: ex.video_url,
      imageUrl: mediaFromMap?.image_url,
      gifUrl: mediaFromMap?.gif_url,
      videoUrl: mediaFromMap?.video_url,
    });
    setExerciseHintModal({
      name,
      part,
      wgerId,
      canonicalKey,
      ...media,
      loading: true,
    });
    try {
      if (canonicalKey || !hasDisplayableExerciseMedia(media)) {
        const fetched = await fetchExerciseMediaFromApi({
          canonicalKey,
          wgerId,
          name,
        });
        if (fetched && hasDisplayableExerciseMedia(fetched)) {
          if (exerciseMediaMatchesName(name, canonicalKey)) {
            media = fetched;
          } else {
            media = { imageUrl: null, gifUrl: null, videoUrl: null };
          }
        }
      } else if (!exerciseMediaMatchesName(name, canonicalKey)) {
        media = { imageUrl: null, gifUrl: null, videoUrl: null };
      }
    } catch {
      /* ponechat embedded media */
    }
    setExerciseHintModal({
      name,
      part,
      wgerId,
      canonicalKey,
      ...media,
      loading: false,
    });
  };

  const performMealSwap = async (di, mi) => {
    const day = planWeekDays[di];
    if (!day) return;
    const structDay = day.structDay || structuredPlan?.days?.[day.originalIndex ?? di];
    const meal = day.meals?.[mi];
    const structMeal = structDay?.meals?.[mi]
      || structDay?.meals?.find((m) => (m?.type || '') === (meal?.type || ''));
    const currentTitle = structMeal
      ? mealDisplayTitleForStructuredMeal(structMeal, effectivePlan?.plan_html || '', day.dayName || '')
      : (meal?.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    setSwapModal({
      dayIndex: day.originalIndex ?? di,
      mealIndex: mi,
      mealType: meal?.type || 'Jídlo',
      currentTitle,
      loading: true,
      error: null,
      newTitle: null,
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Pro nahrazení jídla se přihlas.');
      if (!plan?.id) throw new Error('Plán není k dispozici — obnov stránku.');
      const res = await fetch('/api/plan-replace-meal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: plan.id,
          day_slot_index: di,
          day_index: day.originalIndex ?? di,
          meal_index: mi,
          current_title: currentTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const errMsg = String(data?.error || '');
        if (/překročen limit|rate limit|429/i.test(errMsg)) {
          throw new Error('Náhrada jídla probíhá lokálně — zkus to znovu za chvíli nebo obnov stránku.');
        }
        throw new Error(errMsg || 'Nepodařilo nahradit jídlo');
      }
      setPlanPatch({
        plan_html: data.plan_html,
        structured_plan_json: data.structured_plan_json,
      });
      setSwapModal(null);
      if (onToast) onToast({ message: `Nahrazeno: ${data.new_title}`, type: 'success' });
    } catch (err) {
      setSwapModal((prev) => prev ? {
        ...prev,
        loading: false,
        error: err.message || 'Nepodařilo nahradit jídlo',
      } : null);
      if (onToast) onToast({ message: err.message || 'Nepodařilo nahradit jídlo', type: 'error' });
    }
  };

  return (
    <section id="plan-overview" className="card plan-section plan-section-premium">
      {/* Hero nadpis (lze skrýt, když je vykreslen nahoře na stránce) */}
      {!hideHero && (
        <div className="plan-hero">
          <h2 className="plan-hero-title">Tvůj osobní jídelní plán Body & Mind ON</h2>
          {plan.plan_type && <span className="plan-badge">{getPlanTypeLabel(plan.plan_type)}</span>}
          {resolvedTrainingLabel ? <span className="plan-badge plan-badge-env">{resolvedTrainingLabel}</span> : null}
        </div>
      )}

      {/* Navigace: Můj plán | Jídelníček */}
      {showGraphical && !todayFirstLayout && (
        <nav className="plan-nav" aria-label="Sekce plánu">
          <a href="#plan-overview" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-overview')?.scrollIntoView({ behavior: 'smooth' }); }}>Můj plán</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-jidelnicek" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-jidelnicek')?.scrollIntoView({ behavior: 'smooth' }); }}>Jídelníček</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-day-nav" className="plan-nav-item" onClick={(e) => {
            e.preventDefault();
            const todayIdx = planWeekDays.findIndex((d) => d.isToday);
            const targetId = todayIdx >= 0 ? `plan-day-card-${todayIdx}` : 'plan-days';
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>Na dnešek</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-nakupni-seznam" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-nakupni-seznam')?.scrollIntoView({ behavior: 'smooth' }); }}>Nákup</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-varianty-jidel" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-varianty-jidel')?.scrollIntoView({ behavior: 'smooth' }); }}>Varianty</a>
        </nav>
      )}

      {!isValid && (
        <div className="plan-expired">
          <p>⚠️ Tento plán již vypršel.</p>
          {canRegeneratePlan && onRegeneratePlan ? (
            <p>
              <button
                type="button"
                className="plan-expired-btn"
                onClick={onRegeneratePlan}
                disabled={regeneratingPlan}
              >
                {regeneratingPlan ? 'Generuji nový plán…' : 'Vygenerovat nový plán'}
              </button>
            </p>
          ) : (
            <p className="plan-expired-blocked">
              {regenerateBlockedMessage || 'Pro nový plán potřebuješ aktivní předplatné – zaplať ho výše na profilu.'}
            </p>
          )}
        </div>
      )}
      {planExpiresSoon && (
        <p className="plan-expires-soon">
          Plán vyprší {daysUntilExpiry === 0 ? 'dnes' : daysUntilExpiry === 1 ? 'zítra' : `za ${daysUntilExpiry} dny`} ({plan.valid_until ? new Date(plan.valid_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''}).
          {canRegeneratePlan && onRegeneratePlan ? (
            <>
              {' '}
              <button
                type="button"
                className="plan-expires-soon-btn"
                onClick={onRegeneratePlan}
                disabled={regeneratingPlan}
              >
                {regeneratingPlan ? 'Generuji…' : 'Vygenerovat nový týden'}
              </button>
            </>
          ) : regenerateBlockedMessage ? (
            <> {regenerateBlockedMessage}</>
          ) : null}
        </p>
      )}

      {showGraphical ? (
        <>
          {todayFirstLayout && planWeekDays?.length > 0 && todayWeekDay ? (
            <ProfileTodayPanels
              todayLabel={todayStr}
              todayDay={todayWeekDay}
              todayDayIndex={todayWeekIdx >= 0 ? todayWeekIdx : 0}
              structuredPlan={structuredPlan}
              planTargets={effectiveTargets}
              program={program}
              planHtml={plan?.plan_html || ''}
              trainingEnvironmentLabel={resolvedTrainingLabel}
              canPinMeals={canPinMeals}
              onRecipeClick={(mi) => {
                const di = todayWeekIdx >= 0 ? todayWeekIdx : 0;
                performOpenRecipe(di, mi);
              }}
              onSwapClick={(mi) => {
                const di = todayWeekIdx >= 0 ? todayWeekIdx : 0;
                performMealSwap(di, mi);
              }}
              onPinClick={(mi) => {
                const di = todayWeekIdx >= 0 ? todayWeekIdx : 0;
                performPinMealForNextWeek(di, mi);
              }}
              isMealPinned={(mealType, mealText) => isPinned(mealType, mealText)}
              pinToastByKey={pinToastMsg?.key ? { [pinToastMsg.key]: pinToastMsg } : {}}
              onExerciseClick={(xi) => {
                const di = todayWeekIdx >= 0 ? todayWeekIdx : 0;
                performOpenExercise(di, xi, { excludeRest: true });
              }}
              onScrollToMeals={() => document.getElementById('profile-today-meals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              onScrollToWorkout={() => document.getElementById('profile-today-workout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              onScrollToWeek={() => {
                setWeeklyPlanOpen(true);
                setTimeout(() => document.getElementById('plan-jidelnicek')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
              }}
              planId={plan?.id || null}
              trainingEnvironment={structuredPlan?.training_environment || trainingEnvironmentLabel || 'gym'}
              onWorkoutPlanUpdated={(data) => {
                if (data?.structured_plan_json) {
                  setPlanPatch({
                    structured_plan_json: data.structured_plan_json,
                    ...(data.plan_html ? { plan_html: data.plan_html } : {}),
                  });
                }
                if (onToast) onToast({ message: 'Trénink na dnešek byl aktualizován.', type: 'success' });
              }}
            />
          ) : null}

          {/* Osobní údaje & cíle – karty s ikonami */}
          {!todayFirstLayout && parsed.personal?.length > 0 && (
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

          {/* Denní cíle – makra (source of truth = structured_plan_json.targets) */}
          {!todayFirstLayout && effectiveTargets?.calories_per_day && (
            <div className="plan-block">
              <h3 className="plan-block-title">Dnešní plán · cíle</h3>
              <div className="plan-macros-row">
                <div className="plan-macro-card">
                  <span className="plan-macro-value">{Math.round(Number(effectiveTargets.calories_per_day) || 0)} kcal</span>
                  <span className="plan-macro-label">Denní kalorie</span>
                </div>
                <div className="plan-macro-card">
                  <span className="plan-macro-value">{Math.round(Number(effectiveTargets.protein_g) || 0)} g</span>
                  <span className="plan-macro-label">Bílkoviny</span>
                </div>
                <div className="plan-macro-card">
                  <span className="plan-macro-value">{Math.round(Number(effectiveTargets.carbs_g) || 0)} g</span>
                  <span className="plan-macro-label">Sacharidy</span>
                </div>
                <div className="plan-macro-card">
                  <span className="plan-macro-value">{Math.round(Number(effectiveTargets.fat_g) || 0)} g</span>
                  <span className="plan-macro-label">Tuky</span>
                </div>
              </div>
            </div>
          )}

          {hasParsedDays && !todayFirstLayout && (
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
                    const htmlStr = buildPlanPdfHtml({
                      days: planWeekDays || [],
                      mealOverrides,
                      planValidFrom: plan?.valid_from || null,
                      planValidUntil: plan?.valid_until || null,
                      dailyMacros: [
                        { label: 'Denní kalorie', value: `${Math.round(Number(effectiveTargets?.calories_per_day) || 0)} kcal` },
                        { label: 'Bílkoviny', value: `${Math.round(Number(effectiveTargets?.protein_g) || 0)} g` },
                        { label: 'Sacharidy', value: `${Math.round(Number(effectiveTargets?.carbs_g) || 0)} g` },
                        { label: 'Tuky', value: `${Math.round(Number(effectiveTargets?.fat_g) || 0)} g` },
                      ],
                      planId: plan?.id || null,
                      appBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
                      planHtml: plan?.plan_html || '',
                    });

                    const html2pdf = (await import('html2pdf.js')).default;
                    await html2pdf().from(htmlStr).set({
                      margin: [10, 10, 10, 10],
                      filename: 'jidelnicek-tyden.pdf',
                      image: { type: 'jpeg', quality: 0.92 },
                      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#0b1220' },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                      pagebreak: { mode: ['css', 'legacy'] },
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
            <>
            {todayFirstLayout ? (
              <div className="plan-block plan-week-accordion" id="plan-tyden-accordion">
                <div className="plan-week-accordion-header">
                  <div className="plan-week-accordion-titles">
                    <h3 className="plan-block-title" style={{ margin: 0 }}>Celý týdenní plán</h3>
                    <p className="plan-week-accordion-sub">Celý týdenní jídelníček a tréninky po dnech</p>
                  </div>
                  <button
                    type="button"
                    className="plan-week-accordion-toggle"
                    onClick={() => setWeeklyPlanOpen((v) => !v)}
                    aria-expanded={weeklyPlanOpen}
                  >
                    {weeklyPlanOpen ? 'Sbalit týden' : 'Rozbalit týden'}
                  </button>
                </div>
              </div>
            ) : null}
            <div
              id="plan-jidelnicek"
              className="plan-block"
              style={todayFirstLayout && !weeklyPlanOpen ? { display: 'none' } : undefined}
            >
              <h3 className="plan-block-title">Týdenní plán</h3>
              <p className="plan-block-subtitle">
                Každý den je plně rozepsaný — jídla s makry, součet kalorií a trénink.
              </p>
              <p id="plan-varianty-jidel" className="plan-variant-hint">
                <strong>Tip:</strong> u každého jídla najdeš tlačítko „Nahradit jiným“ pro alternativu se zachovanými makry.
              </p>
              {plan.valid_from && plan.valid_until && (
                <p className="plan-validity-range">
                  Platnost plánu: {new Date(plan.valid_from).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })} – {new Date(plan.valid_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                </p>
              )}
              <nav className="plan-week-day-nav" aria-label="Přejít na den v týdnu">
                {planWeekDays.map((day, di) => (
                  <button
                    key={di}
                    type="button"
                    className={`plan-week-day-pill${day.isToday ? ' plan-week-day-pill--today' : ''}`}
                    onClick={() => {
                      setExpandedDayCards(new Set([di]));
                      setWeeklyPlanOpen(true);
                      setTimeout(() => document.getElementById(`plan-day-card-${di}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                    }}
                  >
                    {shortDayNavLabel(day.dayName)}
                    {day.dateStr ? ` ${day.dateStr}` : ''}
                  </button>
                ))}
              </nav>
              <div id="plan-days" className="plan-days">
                {planWeekDays.map((day, di) => {
                  const dIdxForMeals = day.originalIndex ?? di;
                  const structDayForTotal =
                    day.structDay ||
                    (structuredPlan?.days &&
                    Array.isArray(structuredPlan.days) &&
                    dIdxForMeals >= 0 &&
                    dIdxForMeals < structuredPlan.days.length
                      ? structuredPlan.days[dIdxForMeals]
                      : null);
                  const dayKcalTotal = (structDayForTotal?.meals || []).reduce((sum, m) => {
                    const k = Number(m?.kcal ?? m?.recipe?.calories);
                    return Number.isFinite(k) && k > 0 ? sum + k : sum;
                  }, 0);
                  const isDayExpanded = todayFirstLayout
                    ? expandedDayCards.has(di)
                    : true;
                  const renderDayShoppingActions = () => {
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
                  };
                  return (
                  <div
                    id={`plan-day-card-${di}`}
                    key={di}
                    className={`plan-day-card ${isDayExpanded ? 'plan-day-expanded' : 'plan-day-collapsed'} ${day._placeholder ? 'plan-day-placeholder' : ''} ${day.isToday ? 'plan-day-today' : ''}`}
                  >
                    <div
                      className="plan-day-header-static"
                      role={todayFirstLayout ? 'button' : undefined}
                      tabIndex={todayFirstLayout ? 0 : undefined}
                      onClick={todayFirstLayout ? () => {
                        setExpandedDayCards((prev) => {
                          if (prev.has(di) && prev.size === 1) return new Set();
                          return new Set([di]);
                        });
                      } : undefined}
                      onKeyDown={todayFirstLayout ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedDayCards((prev) => {
                            if (prev.has(di) && prev.size === 1) return new Set();
                            return new Set([di]);
                          });
                        }
                      } : undefined}
                    >
                      <h4 className="plan-day-name">
                        {day.dayName}{day.dateStr ? ` (${day.dateStr})` : ''}{day.isToday ? ' – dnes' : ''}
                      </h4>
                    </div>
                    {isDayExpanded ? (
                    todayFirstLayout && day.isToday ? (
                      // Dnešní den má plný interaktivní detail nahoře v sekci „Dnešní plán“ — tady jen kompaktní odkaz, žádná duplicitní jídla.
                      <div className="plan-day-today-compact">
                        <p className="plan-day-today-compact-msg">
                          Dnešní detail máš nahoře v sekci <strong>Dnešní plán</strong> — recepty, náhrady jídel i trénink.
                        </p>
                        <button
                          type="button"
                          className="plan-day-today-compact-btn"
                          onClick={() => {
                            document.getElementById('profile-today-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        >
                          ↑ Přejít na Dnešní plán
                        </button>
                      </div>
                    ) : todayFirstLayout ? (
                      // Ostatní dny v týdenním přehledu: stejný moderní design jako horní „Dnešní plán“ (sdílený renderer).
                      <div className="plan-day-modern">
                        {day._placeholder && (day.meals || []).length === 0 ? (
                          <p className="plan-day-placeholder-msg">Pro tento den se nepodařilo načíst jídla. Zkus znovu načíst plán nebo kontaktuj podporu.</p>
                        ) : null}
                        <ProfileDayMealsPanel
                          meals={day.meals || []}
                          structDay={structDayForTotal}
                          planHtml={plan?.plan_html || ''}
                          dayName={day.dayName || ''}
                          dayIndexForKeys={day.originalIndex ?? di}
                          canPinMeals={canPinMeals}
                          onRecipeClick={(mi, e) => performOpenRecipe(di, mi, e)}
                          onSwapClick={(mi) => performMealSwap(di, mi)}
                          onPinClick={(mi) => performPinMealForNextWeek(di, mi)}
                          isMealPinned={(mealType, mealText) => isPinned(mealType, mealText)}
                          pinToastByKey={pinToastMsg?.key ? { [pinToastMsg.key]: pinToastMsg } : {}}
                          workout={showTrainingInProfile
                            ? (day.structDay?.workout ?? structuredPlan?.days?.[day.originalIndex ?? di]?.workout ?? null)
                            : null}
                          showWorkout={showTrainingInProfile}
                          onExerciseClick={(xi) => performOpenExercise(di, xi, { excludeRest: true })}
                        />
                        {dayKcalTotal > 0 ? (
                          <p className="plan-day-kcal-total">
                            <strong>Celkem za den:</strong> {Math.round(dayKcalTotal).toLocaleString('cs-CZ')} kcal
                          </p>
                        ) : null}
                        {day.afterPlanEnd ? (
                          <p className="plan-day-after-validity">Tento den už spadá mimo datum platnosti uloženého plánu — zobrazení je orientační.</p>
                        ) : null}
                        {renderDayShoppingActions()}
                      </div>
                    ) : (
                    <>
                    <nav className="plan-day-nav" aria-label="Jídla dne">
                      <span className="plan-day-nav-static">Co dnes jíst</span>
                    </nav>
                    <div id={`plan-day-${di}-meals`} className="plan-meals">
                      {day._placeholder && day.meals.length === 0 ? (
                        <p className="plan-day-placeholder-msg">Pro tento den se nepodařilo načíst jídla. Zkus znovu načíst plán nebo kontaktuj podporu.</p>
                      ) : null}
                      {day.meals.map((meal, mi) => {
                        const ctx = buildMealActionContext(di, mi);
                        if (!ctx) return null;
                        const {
                          overrideKey,
                          override,
                          mealFullText,
                          structMeal,
                          displayMealTitle,
                          modalTitle,
                          mealTrust,
                          catalogLookupIdForModal,
                          mealTextForPin,
                        } = ctx;
                        const openRecipe = (e) => performOpenRecipe(di, mi, e);
                        recipeOpenHandlersRef.current[`${di}_${mi}`] = openRecipe;
                        const handleSwap = () => performMealSwap(di, mi);
                        swapOpenHandlersRef.current[`${di}_${mi}`] = handleSwap;
                        pinOpenHandlersRef.current[`${di}_${mi}`] = () => performPinMealForNextWeek(di, mi);
                        const mealPinned = isPinned(meal.type || '', mealTextForPin);
                        const macroItems = mealMacroItemsFromTrust(mealTrust);
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
                              ) : catalogLookupIdForModal ? (
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
                                    __html: stripInlineRecipeDetailAnchors(
                                      stripPlanMediaAttrsFromHtml(meal.text)
                                    ),
                                  }}
                                />
                              ) : (
                                <div
                                  className="plan-meal-name plan-meal-name-html"
                                  dangerouslySetInnerHTML={{
                                    __html: stripInlineRecipeDetailAnchors(
                                      stripPlanMediaAttrsFromHtml(meal.fullHtml || '')
                                    ),
                                  }}
                                />
                              )}
                              {macroItems.length > 0 ? (
                                <div className="plan-meal-macros" aria-label="Nutriční hodnoty jídla">
                                  {macroItems.map((item) => (
                                    <span key={item.key} className={`plan-meal-macro-pill plan-meal-macro-pill--${item.tone}`}>
                                      <span className="plan-meal-macro-pill-label">{item.label}</span>
                                      <span className="plan-meal-macro-pill-value">{item.value}</span>
                                    </span>
                                  ))}
                                  <MacroRatioChart
                                    protein_g={mealTrust?.protein_g}
                                    carbs_g={mealTrust?.carbs_g}
                                    fat_g={mealTrust?.fat_g}
                                    calories={mealTrust?.calories}
                                    compact
                                    className="plan-meal-macro-chart"
                                  />
                                </div>
                              ) : null}
                              <div className="plan-meal-actions">
                                <button type="button" className="plan-meal-recipe-btn plan-meal-recipe-btn--primary" onClick={openRecipe}>
                                  Recept
                                </button>
                                <div className="plan-meal-secondary-actions">
                                  <button type="button" className="plan-meal-swap plan-meal-secondary-btn" onClick={(e) => { e.stopPropagation(); handleSwap(); }}>Nahradit jiným</button>
                                  {canPinMeals && (
                                    <button
                                      type="button"
                                      className={`plan-meal-pin plan-meal-secondary-btn ${mealPinned ? 'plan-meal-pin-active' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); performPinMealForNextWeek(di, mi); }}
                                      title="Označíš si jídlo pro příští týden — při dalším generování ho zkusíme znovu zapracovat."
                                    >
                                      {mealPinned ? '✓ Zahrnuto od dalšího týdne' : 'Zahrnout od dalšího týdne'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {pinToastMsg?.key === overrideKey && (
                                <span className={`plan-pin-toast plan-pin-toast-${pinToastMsg.type || 'success'}`}>{pinToastMsg.message}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {dayKcalTotal > 0 ? (
                      <p className="plan-day-kcal-total">
                        <strong>Celkem za den:</strong> {Math.round(dayKcalTotal).toLocaleString('cs-CZ')} kcal
                      </p>
                    ) : null}
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
                                const part = formatExerciseSetsRepsDisplay(ex);
                                return (
                                  <li key={xi} style={{ marginBottom: 10 }}>
                                    <strong>{name}</strong>
                                    {' '}
                                    – {part}
                                    <span style={{ display: 'block', marginTop: 6, fontSize: 13 }}>
                                      <button
                                        type="button"
                                        className="plan-exercise-hint-btn"
                                        onClick={() => performOpenExercise(di, xi)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          padding: 0,
                                          cursor: 'pointer',
                                          color: '#a78bfa',
                                          textDecoration: 'underline',
                                          font: 'inherit',
                                          minHeight: 44,
                                        }}
                                      >
                                        Jak cvik provést
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
                    {renderDayShoppingActions()}
                    </>
                    )
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </div>
            </>
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
                    <p>Načítám recept…</p>
                  </div>
                ) : (
                  <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: stripPlanMediaAttrsFromHtml(recipeModal.content || '') }} />
                )}
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
                  <p style={{ marginTop: 0, marginBottom: 12 }}><strong>Série / opakování:</strong> {exerciseHintModal.part}</p>
                  {exerciseHintModal.loading ? (
                    <p className="plan-no-recipe-hint" style={{ marginBottom: 12 }}>Načítám ukázku cviku…</p>
                  ) : (() => {
                    const media = collectExerciseMediaSources(exerciseHintModal);
                    const safeMedia = exerciseMediaMatchesName(
                      exerciseHintModal.name,
                      exerciseHintModal.canonicalKey
                    ) ? media : { imageUrl: null, gifUrl: null, videoUrl: null };
                    const preview = renderExerciseMediaPreview(safeMedia, exerciseHintModal.name, async () => {
                      try {
                        const fetched = await fetchExerciseMediaFromApi({
                          canonicalKey: exerciseHintModal.canonicalKey,
                          wgerId: exerciseHintModal.wgerId,
                          name: exerciseHintModal.name,
                        });
                        if (fetched && hasDisplayableExerciseMedia(fetched)) {
                          setExerciseHintModal((prev) => (prev ? { ...prev, ...fetched, loading: false } : prev));
                        } else {
                          setExerciseHintModal((prev) => (prev ? {
                            ...prev,
                            imageUrl: null,
                            gifUrl: null,
                            videoUrl: null,
                            loading: false,
                          } : prev));
                        }
                      } catch {
                        setExerciseHintModal((prev) => (prev ? {
                          ...prev,
                          imageUrl: null,
                          gifUrl: null,
                          videoUrl: null,
                          loading: false,
                        } : prev));
                      }
                    });
                    return preview || (
                      <p className="plan-no-recipe-hint" style={{ marginBottom: 12 }}>
                        {EXERCISE_MEDIA_PLACEHOLDER_CS}
                      </p>
                    );
                  })()}
                  {renderExerciseInstructionBlock(exerciseHintModal.canonicalKey || resolveToCanonicalKey(exerciseHintModal.name))}
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Swap modal – náhrada jídla ze START knihovny */}
          {swapModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => !swapModal.loading && setSwapModal(null)}>
              <div className="plan-recipe-modal plan-recipe-modal-dynamic" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(520px, calc(100vw - 24px))', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a2e', borderRadius: '16px', border: '1px solid #333', zIndex: 10001 }}>
                <div className="plan-recipe-modal-header">
                  <h3>Nahrazuji: {swapModal.currentTitle || swapModal.mealType}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setSwapModal(null)} aria-label="Zavřít">×</button>
                </div>
                {swapModal.loading ? (
                  <div className="plan-recipe-modal-loading">
                    <span className="plan-recipe-modal-spinner" />
                    <p>Hledám vhodnou alternativu…</p>
                  </div>
                ) : (
                  <div className="plan-recipe-modal-body">
                    <p>{swapModal.error || 'Hotovo.'}</p>
                  </div>
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
                    Hromadný nákupní seznam zatím není k dispozici. U každého dne pod jídly můžeš zkopírovat řádky přes týdenní nákupní sekci níže nebo použít odkaz Nákup.
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
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .plan-section.card {
    padding: clamp(1rem, 2.5vw, 1.5rem);
    border-radius: 16px;
  }
  .plan-section-premium {
    overflow: visible;
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
  .plan-expired-btn,
  .plan-expires-soon-btn {
    background: linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  .plan-expired-btn:disabled,
  .plan-expires-soon-btn:disabled { opacity: 0.7; cursor: wait; }
  .plan-expired-blocked { color: #fca5a5; font-size: 0.92rem; }
  .plan-expires-soon-btn {
    background: transparent;
    color: #a78bfa;
    padding: 0;
    font-size: inherit;
    font-weight: 600;
    text-decoration: underline;
  }
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
  .plan-week-day-nav {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px 2px 14px;
    margin: 0 0 8px;
    position: sticky;
    top: 0;
    z-index: 6;
    background: linear-gradient(180deg, rgba(15, 15, 26, 0.98) 70%, rgba(15, 15, 26, 0));
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }
  .plan-week-day-nav::-webkit-scrollbar {
    height: 6px;
  }
  .plan-week-day-nav::-webkit-scrollbar-thumb {
    background: rgba(167, 139, 250, 0.35);
    border-radius: 999px;
  }
  .plan-week-day-pill {
    flex: 0 0 auto;
    scroll-snap-align: start;
    border: 1px solid rgba(139, 92, 255, 0.35);
    background: rgba(30, 41, 59, 0.65);
    color: #c4b5fd;
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    touch-action: manipulation;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .plan-week-day-pill:hover {
    background: rgba(124, 58, 237, 0.2);
    border-color: rgba(167, 139, 250, 0.55);
    color: #e9d5ff;
  }
  .plan-week-day-pill--today {
    background: rgba(124, 58, 237, 0.35);
    border-color: #a78bfa;
    color: #fff;
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
    background: linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%);
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
    background: rgba(15, 23, 42, 0.55);
    border-radius: 999px;
    padding: 12px 18px;
    text-align: center;
    border: 2px solid rgba(167, 139, 250, 0.35);
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
  .plan-day-today-compact {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
  }
  .plan-day-modern {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    max-width: 100%;
  }
  .plan-day-today-compact-msg {
    margin: 0;
    flex: 1 1 240px;
    min-width: 0;
    font-size: 14px;
    line-height: 1.5;
    color: #94a3b8;
  }
  .plan-day-today-compact-msg strong { color: #c4b5fd; }
  .plan-day-today-compact-btn {
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid rgba(167, 139, 250, 0.45);
    background: rgba(124, 58, 237, 0.2);
    color: #e9d5ff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }
  .plan-day-today-compact-btn:hover { background: rgba(124, 58, 237, 0.32); }
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
  .plan-day-collapsed .plan-day-header-static {
    cursor: pointer;
  }
  .plan-week-accordion-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .plan-week-accordion-titles {
    flex: 1 1 200px;
    min-width: 0;
  }
  .plan-week-accordion-sub {
    margin: 6px 0 0;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.4;
  }
  .plan-week-accordion-toggle {
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid rgba(167, 139, 250, 0.45);
    background: rgba(124, 58, 237, 0.2);
    color: #e9d5ff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
  }
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
  .plan-day-peek-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plan-day-peek-line {
    display: block;
  }
  .plan-day-peek-line-training {
    color: #c4b5fd;
    font-weight: 600;
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
    grid-template-columns: 1fr;
    gap: clamp(0.75rem, 2.5vw, 1rem);
    padding-inline: clamp(0.5rem, 2.5vw, 1rem);
    padding-block: clamp(0.75rem, 2.5vw, 1rem);
    width: 100%;
    box-sizing: border-box;
  }
  @media (min-width: 768px) and (max-width: 1023px) {
    .plan-meals {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1024px) {
    .plan-meals {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      padding-inline: clamp(0.75rem, 2vw, 1rem);
    }
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
    align-items: flex-start;
    gap: 16px;
    width: 100%;
    box-sizing: border-box;
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
    background: linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%);
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
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid rgba(124, 58, 237, 0.75);
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.92), rgba(99, 102, 241, 0.92));
    color: #f8fafc;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
  }
  .plan-meal-recipe-btn--primary {
    width: 100%;
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
    background: linear-gradient(180deg, #111827 0%, #070B18 100%);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 22px;
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
  .plan-recipe-modal-body :global(.recipe-detail-image) {
    max-width: 100%;
    max-height: 280px;
    border-radius: 12px;
    object-fit: cover;
    display: block;
    margin: 0 0 16px;
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
  .plan-recipe-modal-body :global(.plan-recipe-rate-limit-msg) {
    color: #fbbf24;
    font-weight: 600;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.25);
  }
  .plan-recipe-modal-body :global(.plan-recipe-source-meta) {
    margin-top: 12px;
    color: #64748b;
    font-size: 12px;
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
  .plan-recipe-modal-body :global(.recipe-macro-energy-bar) {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.1);
    width: 100%;
    max-width: 100%;
    margin: 12px 0 14px;
    box-sizing: border-box;
  }
  .plan-recipe-modal-body :global(.recipe-macro-energy-seg) {
    display: block;
    height: 100%;
    min-width: 2px;
  }
  .plan-recipe-modal-body :global(.recipe-macro-energy-seg--protein),
  .plan-recipe-modal-body :global(.recipe-nutrient-bar.recipe-macro-energy-seg--protein) {
    background: #f472b6;
  }
  .plan-recipe-modal-body :global(.recipe-macro-energy-seg--carbs),
  .plan-recipe-modal-body :global(.recipe-nutrient-bar.recipe-macro-energy-seg--carbs) {
    background: #60a5fa;
  }
  .plan-recipe-modal-body :global(.recipe-macro-energy-seg--fat),
  .plan-recipe-modal-body :global(.recipe-nutrient-bar.recipe-macro-energy-seg--fat) {
    background: #fbbf24;
  }
  .plan-recipe-modal-body :global(.recipe-macro-kcal-line) {
    margin: 0 0 8px;
    font-size: 15px;
    color: #e2e8f0;
  }
  .plan-recipe-modal-body :global(.recipe-macro-kcal-label) {
    color: #94a3b8;
    margin-right: 6px;
  }
  .plan-recipe-modal-body :global(.recipe-macro-unavailable) {
    margin: 8px 0 0;
    color: #94a3b8;
    font-size: 13px;
  }
  .plan-recipe-modal-body :global(.recipe-macro-kcal-warning) {
    margin: 10px 0 0;
    font-size: 12px;
    color: #fcd34d;
    line-height: 1.4;
  }
  .plan-recipe-modal-body :global(.recipe-nutrients--macro-energy .recipe-nutrient-top) {
    grid-template-columns: 1fr auto;
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
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 10px;
  }
  .plan-meal-macros :global(.plan-meal-macro-chart) {
    flex: 1 1 100%;
    width: 100%;
  }
  .plan-meal-macro-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 2px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.55);
    font-size: 11px;
    line-height: 1.35;
  }
  .plan-meal-macro-pill-label {
    font-weight: 700;
    color: #cbd5e1;
  }
  .plan-meal-macro-pill-value {
    font-weight: 800;
    color: #f8fafc;
  }
  ${buildMacroPillCss()}
  .plan-exercise-media {
    display: block;
    width: 100%;
    max-height: 280px;
    object-fit: contain;
    margin: 12px 0 0;
    border-radius: 14px;
    border: 1px solid rgba(167, 139, 250, 0.25);
    background: rgba(15, 23, 42, 0.45);
  }
  video.plan-exercise-media {
    background: #000;
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
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    margin-top: 8px;
    width: 100%;
  }
  .plan-meal-secondary-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
  }
  .plan-meal-swap {
    font-size: 11px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    flex: 1 1 auto;
    min-width: 0;
  }
  .plan-meal-swap:hover { color: #c4b5fd; border-color: rgba(139, 92, 255, 0.5); }
  .plan-meal-pin {
    font-size: 11px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    flex: 1 1 auto;
    min-width: 0;
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
    background: linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%);
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

  @media (min-width: 768px) {
    .plan-meal-recipe-btn--primary {
      width: auto;
      align-self: flex-start;
    }
    .plan-meal-actions {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
    }
    .plan-meal-secondary-actions {
      width: auto;
      flex: 1 1 auto;
    }
  }

  @media (max-width: 767px) {
    .plan-section.card {
      padding-inline: 0;
      padding-block: 0.5rem 0;
      border-radius: 0;
      border: none;
      background: transparent;
      margin-bottom: 0;
      box-shadow: none;
    }
    .plan-nav { flex-wrap: wrap; gap: 10px; padding: 12px clamp(0.75rem, 3vw, 1rem); justify-content: center; }
    .plan-nav-item { font-size: 14px; padding: 10px 14px; min-height: 48px; display: inline-flex; align-items: center; touch-action: manipulation; }
    .plan-block { padding-inline: 0; padding-block: 0.75rem; }
    .plan-days { gap: 20px; }
    .plan-day-card { border-radius: 14px; }
    .plan-day-header-btn { padding: 0; }
    .plan-day-name { padding: 14px clamp(0.75rem, 3vw, 1rem); font-size: 15px; }
    .plan-day-chevron { padding: 14px clamp(0.75rem, 3vw, 1rem); }
    .plan-meals { grid-template-columns: 1fr; gap: clamp(0.75rem, 2.5vw, 1rem); padding-inline: 0; padding-block: 0.75rem; }
    .plan-meal-card { border-radius: 12px; padding: clamp(0.875rem, 3vw, 1rem); gap: 14px; width: 100%; }
    .plan-meal-icon { width: 44px; height: 44px; font-size: 20px; }
    .plan-meal-name, .plan-meal-name-html { font-size: 15px; }
    .plan-meal-macros { font-size: 11px; }
    .plan-meal-actions { gap: 10px; }
    .plan-meal-secondary-actions { flex-direction: column; }
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
    .plan-hero {
      padding: 20px clamp(0.75rem, 3vw, 1rem) 24px;
      margin-inline: calc(-1 * clamp(0.5rem, 2.5vw, 0.75rem));
    }
    .plan-hero-title { font-size: 18px; }
    .plan-cards-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .plan-day-training-list { padding-left: 16px; }
    .plan-day-training-item { padding: 12px 0; }
    .plan-day-training-detail { padding: 12px 10px; font-size: 13px; }
    .plan-recipe-modal-overlay { padding: 10px; align-items: center; justify-content: center; }
    .plan-recipe-modal { max-width: 100%; max-height: min(90vh, 720px); border-radius: 16px; }
    .plan-recipe-modal-dynamic {
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: calc(100vw - 20px) !important;
      height: auto !important;
      max-height: min(90vh, 720px) !important;
    }
    .plan-recipe-modal-header { padding: 14px 16px; }
  }
  @media (max-width: 380px) {
    .plan-cards-grid { grid-template-columns: 1fr; }
    .plan-hero-title { font-size: 16px; }
  }
`;
