// /components/PlanViewer.js – Grafické zobrazení AI plánu (wow efekt, obrázky u jídel)
//
// NO LIES UI RULE: Frontend must not display media in a way that misleads about trust.
// - illustrative ≠ exact  |  fallback ≠ verified  |  none ≠ broken image
// Trust labels and placeholders reflect backend image_trust_level / trust_level.
// NEXT_PUBLIC_API_ONLY_MEDIA=true → show images/media only when exact (Spoonacular, wger), not Pexels.
const API_ONLY_MEDIA = process.env.NEXT_PUBLIC_API_ONLY_MEDIA === 'true';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import { getPlanTypeLabel } from '../lib/planLabels';

// Static meal fallbacks: used ONLY when meal_trust has no entry for this meal (legacy/incomplete enrichment).
// When meal_trust exists and image_trust_level is "none", we never use DISH_IMAGES – show placeholder only (no fake exact).
// When used, the UI labels as "Ilustrační foto", never as exact.
const DISH_IMAGES = [
  { keys: ['palačinky z mandlové', 'palacinky z mandlove', 'palačinky', 'palacinky', 'pancake'], url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=280&fit=crop' },
  { keys: ['chia pudink s kokosovým', 'chia pudink s kokosovym', 'chia pudink', 'chia pudding'], url: 'https://images.unsplash.com/photo-1517673132405-a56a62b18ddb?w=400&h=280&fit=crop' },
  { keys: ['jogurt s bezlepkovými ovesnými', 'jogurt s ovesnými vločkami', 'ovesnými vločkami', 'ovesne vlocky', 'ovesné vločky'], url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=280&fit=crop' },
  { keys: ['vejce na tvrdo s avokádem', 'vajec na tvrdo', 'vejce na tvrdo'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['toasty s avokádovým krémem', 'toast s avokádovým', 'avokádovým krémem', 'avokadovym kremem', 'bezlepkové toasty'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['červený salát s červenou řepou', 'cerveny salat s cervenou repou', 'červenou řepou', 'cervenou repou', 'řepou a bylinkami'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['zeleninové placky s jogurtovým', 'zeleninove placky', 'placky s jogurtem'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['hovězí steak s quinoa a zeleninovým salátem', 'hovezi steak s quinoa', 'hovězí steak s batátovou kaší', 'hovezi steak s batatovou kasi', 'hovězí steak s batátovou', 'steak s batátovou kaší', 'steak s quinoa'], url: 'https://images.unsplash.com/photo-1558030006-4502153934bb?w=400&h=280&fit=crop' },
  { keys: ['zeleninová polévka s čočkou', 'zeleninova polevka s cockou', 'polévka s čočkou', 'polevka s cockou'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['zeleninové curry s luštěninami', 'zeleninove curry s lusteninami', 'curry s luštěninami a rýží', 'curry s lusteninami'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=280&fit=crop' },
  { keys: ['tofu stir-fry s rýžovými nudlemi', 'tofu stir-fry se zeleninou', 'tofu stir-fry', 'stir-fry se zeleninou', 'stir-fry s rýžovými'], url: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400&h=280&fit=crop' },
  { keys: ['kuřecí stehno pečené', 'kureci stehno pecene', 'kuřecí stehno', 'kuřecí prso s pečenou'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['grilované kuřecí prso s brokolicí', 'grilovane kureci prso s brokolici', 'kuřecí prso s brokolicí', 'kureci prso s brokolici'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['brambory s kuřecím špenátem', 'brambory s kurecim', 'kuřecím špenátem'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['kuřecí salát s avokádem', 'kureci salat s avokadem', 'kuřecí salát'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['omeleta se špenátem a feta', 'omeleta se spinatem', 'omeleta', 'omelet', 'vajíčk', 'vejce', 'vajec'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['kuřecí', 'kuře', 'chicken', 'zapečené kuře', 'grilované kuře', 'kureci prso'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['hovězí burger', 'beef burger', 'burger'], url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=280&fit=crop' },
  { keys: ['pečená ryba s bramborovou', 'pecena ryba s bramborovou', 'pečená ryba', 'pecena ryba', 'ryba s brambor'], url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=280&fit=crop' },
  { keys: ['pečený losos s nokem', 'peceny losos s nokem', 'losos s cuketou', 'losos', 'salmon', 'pečený losos'], url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=280&fit=crop' },
  { keys: ['quinoa salát s cizrnou a paprikou', 'quinoa salat s cizrnou', 'quinoa salát s avokádem', 'cizrnou a paprikou'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['cizrnový salát s červenou cibulí', 'cizrnovy salat', 'cizrnový salát'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['steak', 'hovězí', 'beef', 'pečený steak', 'hovězí steak'], url: 'https://images.unsplash.com/photo-1558030006-4502153934bb?w=400&h=280&fit=crop' },
  { keys: ['zeleninové curry', 'zeleninove curry', 'vegetable curry', 'curry s houbami'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=280&fit=crop' },
  { keys: ['rizoto', 'risotto', 'houbové rizoto'], url: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=280&fit=crop' },
  { keys: ['kari', 'curry', 'kokosové mléko', 'kokosove mleko'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=280&fit=crop' },
  { keys: ['quinoa', 'bulgur'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['bramborová kaše', 'bramborova kase', 'bramborovou kaší', 'batátovou kaší', 'batatovou kasi'], url: 'https://images.unsplash.com/photo-1518013431117-eb2895b37a9d?w=400&h=280&fit=crop' },
  { keys: ['ovesná kaše', 'oatmeal', 'porridge', 'ovesna kase'], url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=280&fit=crop' },
  { keys: ['jogurt', 'granola', 'müsli', 'parfait'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=280&fit=crop' },
  { keys: ['smoothie s banánem a proteinem', 'smoothie s banánem', 'smoothie s proteinem', 'smoothie', 'koktejl'], url: 'https://images.unsplash.com/photo-1505252585461-04db1ebd3c2c?w=400&h=280&fit=crop' },
  { keys: ['houbové', 'houby', 'mushroom', 'žampion'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['kuskus', 'couscous'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['polévka', 'polevka', 'soup'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['těstovin', 'testovin', 'pasta', 'špagety', 'spagety', 'nokem', 'noky', 'gnocchi'], url: 'https://images.unsplash.com/photo-1551183053-bf91a1f81115?w=400&h=280&fit=crop' },
  { keys: ['rýže', 'ryze', 'rice'], url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=280&fit=crop' },
  { keys: ['brambor', 'brambory'], url: 'https://images.unsplash.com/photo-1518013431117-eb2895b37a9d?w=400&h=280&fit=crop' },
  { keys: ['brokolic', 'brokolice'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['cuket', 'cuketa'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['feta', 'fetou'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['salát', 'salad'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['večeře', 'večere'], url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=280&fit=crop' },
  { keys: ['oběd', 'obed'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['snídaně', 'snidane'], url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=280&fit=crop' },
  { keys: ['svačina', 'svacina'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=280&fit=crop' },
];
const DEFAULT_MEAL_IMAGE = 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400&h=280&fit=crop'; // Used only by getMealImageByDish when no trust data; never as onError fallback (would mask trust).

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

/** Formát data pro zobrazení u dne (např. "27. 2."). */
function formatDayLabel(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

/**
 * Vybere obrázek podle názvu jídla. Používá NEJDELŠÍ SHODU (nejvíc specifický klíč vyhrává),
 * aby „Palačinky z mandlové mouky“ dostaly obrázek palačinek, ne těstovin nebo snídaně.
 */
function getMealImageByDish(mealText) {
  if (!mealText || typeof mealText !== 'string') return DEFAULT_MEAL_IMAGE;
  const plain = mealText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = norm(plain);
  let best = { url: DEFAULT_MEAL_IMAGE, keyLen: 0 };
  for (const { keys, url } of DISH_IMAGES) {
    for (const k of keys) {
      const nk = norm(k);
      if (nk && lower.includes(nk) && nk.length > best.keyLen) {
        best = { url, keyLen: nk.length };
      }
    }
  }
  return best.url;
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

function getEnrichedMealImage(mealText, mealImagesMap = {}, preferredKey = null) {
  const map = mealImagesMap || {};
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
 * Resolve trust metadata for a meal using the same key resolution as getEnrichedMealImage.
 * Returns { image_url, image_trust_level, exact_source, illustrative_source } or null.
 * NO LIES UI RULE: Frontend must not display media in a way that misleads about trust.
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

function getExerciseMediaFromItemText(itemText, exerciseMediaMap = {}, preferredKey = null) {
  const map = exerciseMediaMap || {};
  if (preferredKey && map[preferredKey]) return map[preferredKey];
  const rawName = String(itemText || '').split(':')[0].trim();
  const key = normalizeLookupKey(rawName);
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

/** Odstraní obrázky z HTML (v sekci Trénink nechceme velké obrázky). */
function stripImagesFromHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(/<img[^>]*>/gi, '').trim();
}

/** Odstraní blok „Progrese a bezpečnost“ z tréninkového HTML (duplicitní k denním cílům). */
function stripProgreseBezpecnost(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(/<p[^>]*>[\s\S]*?Progrese a bezpečnost[\s\S]*?<\/p>/gi, '').trim();
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

/** Z HTML bloku „Trénink tento den“ vytáhne položky <li> (pro zobrazení s figurinami). Extrahuje data-exercise-key pro API-first lookup. */
function parseTrainingItems(html) {
  if (!html || typeof html !== 'string') return null;
  const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  const items = [];
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const tag = m[1] || '';
    const inner = m[2];
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const keyMatch = tag.match(/data-exercise-key\s*=\s*["']([^"']*)["']/i);
    const exercise_key = keyMatch ? normalizeLookupKey(keyMatch[1]) : null;
    items.push({
      innerHTML: inner,
      text,
      exercise_key: exercise_key || undefined,
    });
  }
  return items.length ? items : null;
}

/** Zakázané fráze – nikdy je nezobrazovat žádnému klientovi. Při výskytu se použije safe fallback. */
const FORBIDDEN_EQUIPMENT_PHRASES = [
  'personál', 'poradí', 'požádej', 'ukáže', 'ukázku', 'rádi poradí', 'poraď se', 'konzultac', 'trenér ti',
];

/**
 * Pro každý typ cviku: slova, která musí být v textu, aby byl považován za odpovídající.
 * Systém tím automaticky ověřuje, že zobrazený návod odpovídá cviku – žádné ruční kontroly.
 */
const EQUIPMENT_MUST_MATCH_KEYWORDS = {
  warmup:   ['kardio', 'strečink', 'rozcvič', 'kroužení', 'dynamický'],
  cooldown: ['strečink', 'hamstringy', 'záda', 'ramena', 'protažení'],
  rest:     ['procházka', 'odpočinek', 'protažení', 'dýchat'],
  squat:    ['dřep', 'plošin', 'nohy', 'sed', 'opor'],
  push_up:  ['kliky', 'tlaky', 'hrudník', 'lavice', 'tlačíš'],
  pull_up:  ['přítahy', 'shyby', 'hrazda', 'přitáhnout', 'táhneš'],
  lunge:    ['výpad', 'koleno', 'krok', 'činkami'],
  plank:    ['prkno', 'předloktí', 'dlaních', 'tělo v rovině'],
  superman: ['superman', 'břicho', 'lehni', 'zvedni', 'natažené'],
  press:    ['tlaky', 'lavice', 'hrudník', 'činky', 'tlačíš'],
  deadlift: ['mrtvý tah', 'osa', 'zvedni', 'záda rovná', 'trap bar'],
  rdl:      ['rumunský', 'hamstringy', 'kyčlích', 'hinge', 'předklon'],
};

/**
 * Vrátí bezpečné texty pro zobrazení (pro všechny klienty stejně).
 * 1) Zakázané fráze → vždy fallback.
 * 2) Ověření shody: text musí obsahovat alespoň jedno klíčové slovo daného cviku, jinak fallback.
 * Tím je vždy ověřeno, že návod odpovídá cviku – bez ruční kontroly.
 */
function getSafeEquipment(iconType) {
  const raw = EXERCISE_EQUIPMENT[iconType] || EXERCISE_EQUIPMENT.default;
  const def = EXERCISE_EQUIPMENT.default;
  const hasForbidden = (s) => typeof s === 'string' && FORBIDDEN_EQUIPMENT_PHRASES.some((phrase) => s.toLowerCase().includes(phrase));
  const keywords = EQUIPMENT_MUST_MATCH_KEYWORDS[iconType];
  const textMatchesExercise = (s) => {
    if (!keywords || keywords.length === 0) return true;
    if (typeof s !== 'string' || !s.trim()) return false;
    const lower = s.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  };
  const safeMachine = (hasForbidden(raw.machine) || !textMatchesExercise(raw.machine)) ? def.machine : (raw.machine ?? def.machine);
  const safeHome = (hasForbidden(raw.home) || !textMatchesExercise(raw.home)) ? def.home : (raw.home ?? def.home);
  return { machine: safeMachine, home: safeHome };
}

/** Stroj / vybavení ve fitku a domácí alternativa – vždy obě varianty, srozumitelné bez trenéra. Nikdy neuvádět poradit se s někým. */
const EXERCISE_EQUIPMENT = {
  warmup:   { machine: 'Lehké kardio na páse, rotopedu nebo orbitreku. Pak dynamický strečink: kroužení ramen, kyčlí, kolen – stejně jako doma.', home: 'Lehké kardio: chůze, běh na místě, kolo. Dynamický strečink: kroužení ramen, kyčlí, kolen.' },
  cooldown: { machine: 'Strečink na zemi nebo vestoje – stejné cviky jako doma. V posilovně můžeš využít podložku a klidnější koutek.', home: 'Strečink na zemi nebo vestoje – hamstringy, záda, ramena, přední strana stehen.' },
  rest:     { machine: 'Procházka na pásu nebo lehké protažení v klidu. Můžeš zůstat na místě a dýchat.', home: 'Procházka venku nebo na místě, lehké protažení.' },
  squat:    { machine: 'V posilovně: stroj na dřepy (nohy tlačíš proti plošině), nebo dřep s osou za hlavou – nastavení výšky opory podle své výšky.', home: 'Dřepy s vlastní vahou, s lahví vody nebo závažím. Židle jako opora – sedni si a vstaň (opakuj).' },
  push_up:  { machine: 'V posilovně: tlaky na hrudník na lavici (ležíš na zádech, tlačíš tyč nebo činky nahoru od hrudníku). Lavice s tyčí je obvykle u stěny.', home: 'Kliky na zemi (na kolenou snazší), kliky o zeď nebo o stůl. Roztahovače (gumy) mezi dveřmi.' },
  pull_up:  { machine: 'V posilovně: přítahy k hrudníku vsedě (táhneš tyč nebo rukojeti k sobě), nebo shyby na hrazdě – hrazda je nad hlavou, přitáhni se až brada nad úroveň rukou.', home: 'Přítahy s expanderem (gumou) ke dveřím. Inverzní řady pod stolem – chyť se stolu a přitáhni hrudník.' },
  lunge:    { machine: 'Výpady v prostoru s činkami v rukou (po jedné v každé ruce) nebo jen s vlastní vahou. Kroky vpřed, koleno zadní nohy jde k zemi.', home: 'Výpady v prostoru s vlastní vahou nebo s lahví / činkami. Držet se židle pro stabilitu.' },
  plank:    { machine: 'Prkno na zemi v posilovně – stejně jako doma: opora na předloktích nebo dlaních, tělo v rovině. Můžeš na kolenou zjednodušit.', home: 'Prkno na předloktí nebo na dlaních. Můžeš na kolenou zjednodušit.' },
  superman: { machine: 'Superman na zemi v posilovně – stejně jako doma: lehni na břicho, paže i nohy natažené. Zvedni hrudník, ruce i nohy mírně nad zem a chvíli drž, pak pomalu polož. Opakuj.', home: 'Lehni na břicho, ruce i nohy natažené. Zvedni hrudník, ruce a nohy mírně nad zem, chvíli vydrž a pomalu polož. Cvičíš jen s vlastní vahou na podlaze.' },
  press:    { machine: 'V posilovně: tlaky na hrudník na lavici (ležíš na zádech, tlačíš tyč nebo činky nahoru). Lavice s tyčí je typicky u zdi.', home: 'Kliky, tlaky s expanderem, tlaky s lahvemi nebo činkami vleže na zemi.' },
  deadlift: { machine: 'Mrtvý tah: stoj, osa nebo činky před stehny. Záda rovná, mírný podřep, chyť osu, zvedni do stoje (výdech při zvedání). V posilovně použij osu na zemi nebo trap bar (šestiúhelníková osa).', home: 'Mrtvý tah s činkami nebo lahvemi: stoj, záda rovná, mírný předklon a pokrčení kolen, zvedni závaží do stoje. Výdech při zvedání.' },
  rdl:      { machine: 'Rumunský mrtvý tah: stoj s činkami nebo osou před stehny. Lehce pokrčená kolena, záda rovná. Předklon v kyčlích (hinge), posun zadečku vzad, pocit tahu v hamstringách; návrat do stoje. V posilovně osa nebo jednoručky.', home: 'Rumunský mrtvý tah s činkami nebo lahvemi: předklon v kyčlích, kolena lehce pokrčená, záda rovná, tah v zadní straně stehen – návrat do stoje.' },
  total:    { machine: null, home: null },
  default:  { machine: 'V posilovně: podle názvu cviku – stroj na nohy (plošina), lavice na tlaky, tyč nebo kladka na přítahy. Doma: varianta s vlastní vahou nebo expanderem (gumou).', home: 'Zkus variantu s vlastní vahou nebo s expanderem (gumou).' },
};

/** Ilustrační obrázky cviků – fotky odpovídající danému cviku (Unsplash). Při chybě se obrázek skryje. */
const EXERCISE_IMAGE_URLS = {
  warmup:   'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&h=150&fit=crop', // strečink / dynamická rozcvička
  cooldown: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&h=150&fit=crop', // strečink
  rest:     'https://images.unsplash.com/photo-1571019613454-1a2f803b42f0?w=200&h=150&fit=crop', // chůze / odpočinek
  squat:    'https://images.unsplash.com/photo-1566241142559-40f630bd52f7?w=200&h=150&fit=crop', // dřep – osoba při dřepu
  push_up:  'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=200&h=150&fit=crop', // kliky
  pull_up:  'https://images.unsplash.com/photo-1605297942671-279dd0e29b15?w=200&h=150&fit=crop', // přítahy (v předklonu / shyby)
  lunge:    'https://images.unsplash.com/photo-1517836351103-54377833d2f2?w=200&h=150&fit=crop', // výpady
  plank:    'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=200&h=150&fit=crop', // prkno
  superman: 'https://images.unsplash.com/photo-1571019613454-1a2f803b42f0?w=200&h=150&fit=crop', // superman / záda v leže
  press:    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&h=150&fit=crop', // bench press / tlaky
  deadlift: 'https://images.unsplash.com/photo-1534368959876-26bf04f2c947?w=200&h=150&fit=crop', // mrtvý tah
  rdl:      'https://images.unsplash.com/photo-1534368959876-26bf04f2c947?w=200&h=150&fit=crop', // rumunský mrtvý tah
  default:  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&h=150&fit=crop',
};

/** Z textu položky tréninku vrátí typ ikony (squat, push_up, …). */
function getExerciseIconType(text) {
  const t = (text || '').toLowerCase();
  if (/trénink celkem|trenink celkem|celkem\s*\d+\s*min/i.test(t)) return 'total';
  if (/rozcvička|warm-up|rozcvicka/i.test(t)) return 'warmup';
  if (/závěr|zaver|strečink|strecink|cool-down|mobilita/i.test(t) && !/rozcvička|rozcvicka/i.test(t)) return 'cooldown';
  if (/odpočinek|odpocinek|procházka|prochazka|chůze|chuze/i.test(t)) return 'rest';
  if (/dřepy|drep|squat/i.test(t)) return 'squat';
  if (/kliky|klik|push-up|push up/i.test(t)) return 'push_up';
  if (/přítahy|pritah|pull-up|pull up|shyby|předklonu|predklonu|row/i.test(t)) return 'pull_up';
  if (/výpady|vypad|lunge/i.test(t)) return 'lunge';
  if (/superman/i.test(t)) return 'superman'; // před plank – popis často obsahuje „břicho“, nesmí spadnout na plank
  if (/rumunský mrtvý|rumunsky mrtvy|romanian deadlift|rdl/i.test(t)) return 'rdl'; // před deadlift – RDL je jiný cvik (hinge, hamstringy)
  if (/mrtvý tah|mrtvy tah|deadlift/i.test(t)) return 'deadlift';
  if (/hip thrust|good morning|goodmorning/i.test(t)) return 'rdl'; // hinge cviky – podobný návod jako RDL
  if (/prkno|plank|core|břicho|bricho|břicha|bricha|ab\s|abs|zvedání nohou|zvedani nohou|leg raise/i.test(t)) return 'plank';
  if (/tlak|press|bench|tlaky na ramen|overhead|military press|ohp/i.test(t)) return 'press';
  if (/leg press|nohy na plošin|plošin/i.test(t)) return 'squat'; // stroj na nohy – podobný kontext jako dřep
  return 'default';
}

/** Figurina cviku (ikonka) – jednoduchá stick-figure, naznačuje provedení. */
function ExerciseIcon({ type, className = '' }) {
  const w = 32;
  const h = 32;
  const stroke = 'currentColor';
  const fill = 'none';
  const common = { width: w, height: h, viewBox: `0 0 ${w} ${h}`, fill, stroke, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'warmup':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="7" r="3" />
          <path d="M16 11v3M14 14l2 8 2-4 2 4 2-8" />
          <path d="M12 18h8" />
        </svg>
      );
    case 'squat':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="6" r="3" />
          <path d="M16 10v1M12 11l-1 10 2 1 3-6 2 6 2-1-1-10M16 11l-2 5 2 5 2-5" />
        </svg>
      );
    case 'push_up':
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M6 22l3-5h14l3 5M9 17V9l6 2v6M15 17V9l6 2v6" />
          <circle cx="16" cy="6" r="2.5" />
        </svg>
      );
    case 'pull_up':
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M4 5h24M16 5v12l-3 4-3-4V5" />
          <circle cx="16" cy="10" r="2.5" />
        </svg>
      );
    case 'lunge':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="6" r="3" />
          <path d="M16 10v1M15 11l-3 11 2 1 2-6 2 6 2-1-3-11" />
        </svg>
      );
    case 'plank':
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M5 18h22M7 18l2-5 6 0 2 5M15 13V8" />
        </svg>
      );
    case 'superman':
      return (
        <svg {...common} className={className} aria-hidden>
          <ellipse cx="16" cy="18" rx="10" ry="4" />
          <path d="M8 14l4-6 4 2 4-2 4 6M16 8v4" />
        </svg>
      );
    case 'press':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="8" r="2.5" />
          <path d="M16 11v2M12 13l4 6 4-6M16 13v6" />
        </svg>
      );
    case 'deadlift':
    case 'rdl':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="6" r="2.5" />
          <path d="M16 9v4M14 13l-2 8 2 1 4-6 2 6 2-1-2-8" />
          <path d="M12 21h8" />
        </svg>
      );
    case 'cooldown':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="10" r="3" />
          <path d="M16 14v6M12 17h8" />
        </svg>
      );
    case 'rest':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="14" cy="10" r="3" />
          <path d="M17 20l2-3 1 2 2-3" />
        </svg>
      );
    case 'total':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="16" cy="16" r="10" />
          <path d="M16 10v6l4 2" />
        </svg>
      );
    default:
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M14 8l2 2 4-4M10 16l-2 4 4 2 6-8" />
        </svg>
      );
  }
}

/** Fallback: sestaví nákupní seznam z bloků Suroviny v receptech */
function buildShoppingListFromRecipes(recipes) {
  if (!Array.isArray(recipes) || recipes.length === 0) return [];
  const seen = new Set();
  const out = [];
  const surovinyRe = /suroviny\s*:?\s*<\/b>\s*([\s\S]*?)(?=<p\s*><b>|$)/gi;
  recipes.forEach((r) => {
    const content = r.content || '';
    const match = surovinyRe.exec(content);
    if (!match) return;
    const block = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const items = block.split(/[,;]|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    items.forEach((item) => {
      const n = item.toLowerCase().slice(0, 50);
      if (n && !seen.has(n)) { seen.add(n); out.push(item); }
    });
  });
  return out;
}

/** Z textu jídla (např. "Míchaná vejce na ghí, batáty (3 vejce, 1 lžíce ghí, 200 g batátů)") vrátí pole surovin. */
function getIngredientsFromMealText(mealText) {
  if (!mealText || typeof mealText !== 'string') return [];
  let t = mealText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(Snídaně|Oběd|Večeře|Svačina)\s*/i, '').trim();
  const out = [];
  const parenMatches = t.match(/\(([^)]+)\)/g);
  if (parenMatches && parenMatches.length) {
    parenMatches.forEach((s) => {
      const inner = s.replace(/^\(|\)$/g, '').trim();
      inner.split(/[,;]|\s+a\s+/).forEach((part) => {
        const item = part.trim();
        if (item) out.push(item);
      });
    });
  }
  if (out.length === 0 && t) {
    t.split(/[,;]/).forEach((part) => {
      const item = part.trim();
      if (item) out.push(item);
    });
  }
  return out;
}

/** Sestaví nákupní seznam jen z jídel daného dne (suroviny z textu jídel – závorky, čárky). Žádný fallback. */
function buildDayShoppingListFromMeals(meals, mealOverrides, dayKey) {
  if (!Array.isArray(meals) || meals.length === 0) return [];
  const seen = new Set();
  const out = [];
  meals.forEach((meal, mi) => {
    const overrideKey = `${dayKey}_${mi}`;
    const override = mealOverrides[overrideKey];
    const mealFullText = override ? `${meal.type || ''} ${override.title || ''}`.trim() : `${meal.type || ''} ${meal.text || ''}`.trim();
    const items = getIngredientsFromMealText(mealFullText);
    items.forEach((item) => {
      const n = item.toLowerCase().slice(0, 80);
      if (n && !seen.has(n)) { seen.add(n); out.push(item); }
    });
  });
  return out;
}

/** Vrátí recepty odpovídající seznamu názvů/textů jídel (pro daný den). */
function getRecipesForDay(recipes, mealFullTexts) {
  if (!Array.isArray(recipes) || !Array.isArray(mealFullTexts)) return [];
  const matched = [];
  mealFullTexts.forEach((mealFullText) => {
    const mealStart = (mealFullText || '').replace(/\s*\(.*$/, '').trim().slice(0, 35);
    const r = recipes.find((rec) => {
      const rn = (rec.name || '').toLowerCase();
      const mt = (mealFullText || '').toLowerCase();
      if (mt.includes(rn)) return true;
      const startWords = mealStart.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
      if (startWords.length >= 5 && rn.includes(startWords)) return true;
      return false;
    });
    if (r && !matched.includes(r)) matched.push(r);
  });
  return matched;
}

function parsePlanHtml(html) {
  if (!html || typeof document === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = { personal: [], macros: [], days: [], recipes: [], workout: '', regeneration: [], shoppingList: [], mindsetTip: '', rawSections: {} };

    const sections = doc.querySelectorAll('section, body');
    const root = sections[0] || doc.body;
    const allH3 = root.querySelectorAll('h3');
    allH3.forEach((h3) => {
      const title = (h3.textContent || '').trim();
      let next = h3.nextElementSibling;
      const list = [];
      let htmlContent = '';
      let rawSectionHtml = '';
      while (next && next.tagName !== 'H3') {
        rawSectionHtml += next.outerHTML || '';
        if (next.tagName === 'UL') {
          next.querySelectorAll('li').forEach((li) => list.push(li.innerHTML || li.textContent));
        } else if (next.tagName === 'P' || next.tagName === 'H4') {
          htmlContent += next.outerHTML;
        }
        next = next.nextElementSibling;
      }
      if (title && rawSectionHtml) result.rawSections[title] = rawSectionHtml;

      if (/Osobní údaje|údaje & cíle/i.test(title)) {
        result.personal = list.map((item) => {
          const m = (item.replace(/<[^>]+>/g, ' ').trim() || '').match(/^([^:]+):\s*(.+)$/);
          return m ? { label: m[1].trim(), value: m[2].trim() } : null;
        }).filter(Boolean);
      } else if (/Denní cíle|makro/i.test(title)) {
        result.macros = list.map((item) => {
          const m = (item.replace(/<[^>]+>/g, ' ').trim() || '').match(/^([^:]+):\s*(.+)$/);
          return m ? { label: m[1].trim(), value: m[2].trim() } : null;
        }).filter(Boolean);
      } else if (/Jídelníček|celý týden/i.test(title)) {
        const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
        const mealTypes = ['Snídaně', 'Oběd', 'Večeře', 'Svačina', 'Snidane', 'Obed', 'Vecere', 'Svacina'];
        let el = h3.nextElementSibling;
        while (el) {
          const isDayHeader = (el.tagName === 'H4' || el.tagName === 'H3');
          const dayName = (el.textContent || '').trim();
          if (isDayHeader && dayNames.some((d) => dayName.includes(d))) {
            const meals = [];
            let trainingHtml = '';
            let next = el.nextElementSibling;
            while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
              if (next.tagName === 'P') {
                const bold = next.querySelector('b');
                const mealType = bold ? bold.textContent.replace(/:\s*$/, '').trim() : '';
                const rest = (next.textContent || '').replace(bold?.textContent || '', '').replace(/^:\s*/, '').trim();
                const isMeal = mealTypes.some((m) => norm(mealType).includes(norm(m)));
                const paragraphText = (next.textContent || '').trim();
                const isTrainingBlock =
                  /Trénink tento den|trenink tento den/i.test(mealType || '') ||
                  /Trénink tento den|trenink tento den/i.test(paragraphText);
                const mealKey = next.getAttribute?.('data-meal-key') ? normalizeLookupKey(next.getAttribute('data-meal-key')) : null;
                if (isMeal && (mealType || rest)) meals.push({ type: mealType || 'Jídlo', text: rest, fullHtml: next.innerHTML, meal_key: mealKey || undefined });
                if (isTrainingBlock) {
                  trainingHtml = next.outerHTML || '';
                  next = next.nextElementSibling;
                  while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
                    trainingHtml += next.outerHTML || '';
                    next = next.nextElementSibling;
                  }
                  continue;
                }
              }
              next = next.nextElementSibling;
            }
            result.days.push({
              dayName,
              meals,
              trainingHtml: trainingHtml || '<p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>',
            });
          }
          el = el.nextElementSibling;
        }
      } else if (/Recepty/i.test(title)) {
        const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'H4') {
            const name = (el.textContent || '').trim();
            if (!dayNames.some((d) => name.includes(d))) {
              let next = el.nextElementSibling;
              let content = '';
              while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
                content += next.outerHTML;
                next = next.nextElementSibling;
              }
              if (name && content) result.recipes.push({ name, content });
            }
          }
          el = el.nextElementSibling;
        }
      } else if (/Trénink/i.test(title)) {
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          result.workout += el.outerHTML || '';
          el = el.nextElementSibling;
        }
      } else if (/Regenerace|Mindset/i.test(title) && !/Mindset na tento týden/i.test(title)) {
        result.regeneration = list;
      } else if (/Nákupní seznam/i.test(title)) {
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'UL') {
            el.querySelectorAll('li').forEach((li) => {
              const t = (li.textContent || '').trim();
              if (t) result.shoppingList.push(t);
            });
            break;
          }
          el = el.nextElementSibling;
        }
      } else if (/Mindset na tento týden/i.test(title)) {
        let el = h3.nextElementSibling;
        const parts = [];
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'BLOCKQUOTE') {
            parts.push(el.innerHTML || el.textContent || '');
          }
          el = el.nextElementSibling;
        }
        result.mindsetTip = parts.join('\n');
      }
    });

    // Doplnění chybějících dnů (AI někdy vynechá den) – vždy zobrazit 7 dní
    // Pořadí začíná od prvního dne v plánu (ne vždy Pondělí)
    const dayOrder = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
    if (result.days.length > 0 && result.days.length < 7) {
      const byDay = {};
      result.days.forEach((d) => {
        const match = dayOrder.find((dn) => (d.dayName || '').includes(dn));
        if (match) byDay[match] = d;
      });
      // Detekce prvního dne – zachovat pořadí dle plánu
      const firstDayName = result.days[0]?.dayName || '';
      const firstIdx = dayOrder.findIndex((dn) => firstDayName.includes(dn));
      const rotated = firstIdx >= 0
        ? [...dayOrder.slice(firstIdx), ...dayOrder.slice(0, firstIdx)]
        : dayOrder;
      result.days = rotated.map((dn) => byDay[dn] || { dayName: dn, meals: [], _placeholder: true });
    }

    if (result.personal.length || result.macros.length || result.days.length || Object.keys(result.rawSections).length > 0) return result;
    return null;
  } catch (e) {
    return null;
  }
}

export { parsePlanHtml };
const MAX_MEAL_TEXT_LEN = 200;
function normalizeMealTextForPin(text) {
  if (!text || typeof text !== 'string') return '';
  let s = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (s.length > MAX_MEAL_TEXT_LEN) s = s.slice(0, MAX_MEAL_TEXT_LEN);
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export default function PlanViewer({ plan, userName, hideHero, hideShoppingList = false, dietaryPreferences = '', canPinMeals = true, onToast }) {
  const [parsed, setParsed] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null); // { title, content, anchorRect, hasRecipe, openId? }
  const [mealOverrides, setMealOverrides] = useState({}); // { "di_mi": { title, content } }
  const [swapModal, setSwapModal] = useState(null); // { dayIndex, mealIndex, dishQuery, loading, html }
  const [mealPins, setMealPins] = useState([]); // { meal_type, meal_text }[]
  const [mealPinsLoading, setMealPinsLoading] = useState(false);
  const [pinToastMsg, setPinToastMsg] = useState(null); // lokální toast pro pin
  const [shoppingCopyDone, setShoppingCopyDone] = useState(false);
  const [shoppingCopyError, setShoppingCopyError] = useState(null);
  const [shoppingSendEmail, setShoppingSendEmail] = useState({ loading: false, done: false, error: null });
  const [dayShoppingState, setDayShoppingState] = useState({}); // { dayIndex: { copyDone, email: { loading, done, error } } }
  const [shoppingFilter, setShoppingFilter] = useState('week'); // 'week' | day originalIndex (number)
  const [shoppingListOpen, setShoppingListOpen] = useState(false); // rozbalovací sekce
  const [expandedTrainingKey, setExpandedTrainingKey] = useState(null); // 'dayIdx-itemIdx' – rozbalený cvik (detail Ve fitku / Doma)
  const [expandedDays, setExpandedDays] = useState(null); // null = dnes rozbalený; Set(di) = které dny jsou rozbalené
  const [mealImagesMap, setMealImagesMap] = useState({});
  const [mealTrustMap, setMealTrustMap] = useState({});
  const [exerciseMediaMap, setExerciseMediaMap] = useState({});
  /** Keys of meal cards whose image failed to load — show placeholder instead of broken/static fallback (NO LIES UI RULE). */
  const [mealImageErrorKeys, setMealImageErrorKeys] = useState(() => new Set());
  const [exerciseMediaErrorKeys, setExerciseMediaErrorKeys] = useState(() => new Set());
  const [showRawPlanFallback, setShowRawPlanFallback] = useState(false);
  const recipeOpenIdRef = useRef(0);

  /** Odstraní nebezpečné tagy z HTML pro zobrazení v fallbacku. */
  const sanitizeHtmlForFallback = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .trim();
  };

  const recipeErrorHtml = (msg) => `<p class="plan-no-recipe-msg">${String(msg || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</p>`;

  const getSpoonacularRecipe = (recipeId) => {
    if (!recipeId || !Number.isInteger(Number(recipeId))) return Promise.resolve(null);
    return fetch('/api/spoonacular-recipe?id=' + encodeURIComponent(String(recipeId)))
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
      setMealPinsLoading(true);
      try {
        const res = await fetch('/api/meal-pins', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.pins) setMealPins(data.pins);
      } catch {
        if (!cancelled) setMealPins([]);
      } finally {
        if (!cancelled) setMealPinsLoading(false);
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
      setMealImagesMap({});
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
        setMealImagesMap(data?.meal_images && typeof data.meal_images === 'object' ? data.meal_images : {});
        setMealTrustMap(data?.meal_trust && typeof data.meal_trust === 'object' ? data.meal_trust : {});
        setExerciseMediaMap(data?.exercise_media && typeof data.exercise_media === 'object' ? data.exercise_media : {});
        setMealImageErrorKeys(new Set());
        setExerciseMediaErrorKeys(new Set());
      } catch (_) {
        if (!cancelled) {
          setMealImagesMap({});
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
    if (recipeModal || swapModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [recipeModal, swapModal]);

  if (!plan || !plan.plan_html) {
    return (
      <section className="card plan-section">
        <h2>Můj plán</h2>
        <p className="empty-plan">
          Zatím nemáš žádný plán. Vyplň dotazník na <a href="/start">stránce START</a> a dostaneš osobní plán na míru.
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

  // Dynamicky zobrazit dny od dneška do konce platnosti (ne pevný týden od pondělí)
  const displayedDays = (() => {
    const days = parsed?.days || [];
    if (days.length === 0 || !plan?.valid_from) return days.map((d, i) => ({ ...d, dateStr: '', isToday: false, originalIndex: i }));
    const start = new Date(plan.valid_from + 'T12:00:00');
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((now - start) / 86400000);
    const dayIndex = Math.max(0, Math.min(days.length - 1, diffDays));
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sliceCount = Math.min(days.length - dayIndex, 7);
    const result = [];
    for (let i = 0; i < sliceCount; i++) {
      const origIdx = dayIndex + i;
      const dateIso = addDaysToDateStr(plan.valid_from, origIdx);
      const day = findDayForDate(days, dateIso, origIdx);
      result.push({
        ...day,
        dateStr: formatDayLabel(dateIso),
        isToday: dateIso === todayIso && !isFuturePlan,
        originalIndex: origIdx,
      });
    }
    return result;
  })();

  return (
    <section id="plan-overview" className="card plan-section plan-section-premium">
      {/* Hero nadpis (lze skrýt, když je vykreslen nahoře na stránce) */}
      {!hideHero && (
        <div className="plan-hero">
          <h2 className="plan-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
          {plan.plan_type && <span className="plan-badge">{getPlanTypeLabel(plan.plan_type)}</span>}
        </div>
      )}

      {/* Navigace: Můj plán | Jídelníček */}
      {showGraphical && (
        <nav className="plan-nav" aria-label="Sekce plánu">
          <a href="#plan-overview" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-overview')?.scrollIntoView({ behavior: 'smooth' }); }}>Můj plán</a>
          <span className="plan-nav-sep" aria-hidden>|</span>
          <a href="#plan-jidelnicek" className="plan-nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('plan-jidelnicek')?.scrollIntoView({ behavior: 'smooth' }); }}>Jídelníček</a>
        </nav>
      )}

      {!isValid && (
        <div className="plan-expired">
          <p>⚠️ Tento plán již vypršel.</p>
          <p><a href="/start">Vygeneruj si nový plán</a></p>
        </div>
      )}
      {planExpiresSoon && (
        <p className="plan-expires-soon">
          Plán vyprší {daysUntilExpiry === 0 ? 'dnes' : daysUntilExpiry === 1 ? 'zítra' : `za ${daysUntilExpiry} dny`} ({plan.valid_until ? new Date(plan.valid_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''}). Pro nový plán přejdi na <a href="/start">stránku START</a>.
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
              <h3 className="plan-block-title">Denní cíle</h3>
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

          {/* Dnes banner – jen u aktuálního plánu, ne u náhledu příštího týdne */}
          {!isFuturePlan && (
            <div className="plan-today-banner">
              <span className="plan-today-emoji">📅</span>
              <div>
                <h3>Dnes ({todayStr})</h3>
                <p>Podívej se do jídelníčku a na tréninkový plán (jak cvičit, rozcvička, cviky) níže.</p>
              </div>
            </div>
          )}

          {/* Když parser nevrátil dny, ale máme rawSections – zobrazit plán po sekcích (Trénink, Regenerace, …) */}
          {showGraphical && !hasParsedDays && Object.keys(parsed?.rawSections || {}).length > 0 && (
            <div className="plan-block plan-raw-sections-fallback">
              <p className="plan-parse-fallback-msg" style={{ marginBottom: 16 }}>Plán zobrazen po sekcích (parser nerozpoznal jídelníček).</p>
              {Object.entries(parsed.rawSections).map(([sectionTitle, sectionHtml]) => (
                <div key={sectionTitle} className="plan-raw-section-block">
                  <h3 className="plan-block-title">{sectionTitle}</h3>
                  <div className="plan-raw-section-content" dangerouslySetInnerHTML={{ __html: sanitizeHtmlForFallback(sectionHtml) }} />
                </div>
              ))}
            </div>
          )}

          {/* Export jídelníčku – PDF s češtinou a obrázky */}
          {displayedDays?.length > 0 && (
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
                    const allDays = parsed?.days || [];
                    const exportDays = allDays.map((_, idx) => {
                      const dateIso = plan?.valid_from ? addDaysToDateStr(plan.valid_from, idx) : '';
                      const day = findDayForDate(allDays, dateIso, idx);
                      return {
                        ...day,
                        originalIndex: idx,
                        dateStr: dateIso ? formatDayLabel(dateIso) : '',
                        isToday: Boolean(dateIso && dateIso === todayIsoStr && !isFuturePlan),
                      };
                    });
                    let rows = '';
                    (exportDays || []).forEach((day, di) => {
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
          {displayedDays?.length > 0 && (
            <div id="plan-jidelnicek" className="plan-block">
              <h3 className="plan-block-title">Jídelníček</h3>
              {plan.valid_from && plan.valid_until && (
                <p className="plan-validity-range">
                  Platnost plánu: {new Date(plan.valid_from).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })} – {new Date(plan.valid_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                </p>
              )}
              <div className="plan-days">
                {displayedDays.map((day, di) => {
                  const isDayExpanded = expandedDays === null ? (day.isToday || (isFuturePlan && di === 0)) : expandedDays.has(di);
                  const toggleDay = () => {
                    setExpandedDays((prev) => {
                      const todayIdx = displayedDays.findIndex((d) => d.isToday);
                      const next = new Set(prev === null ? [todayIdx >= 0 ? todayIdx : 0] : Array.from(prev));
                      if (next.has(di)) next.delete(di);
                      else next.add(di);
                      return next;
                    });
                  };
                  return (
                  <div id={day.isToday ? 'plan-day-card-today' : undefined} key={di} className={`plan-day-card ${day._placeholder ? 'plan-day-placeholder' : ''} ${day.isToday ? 'plan-day-today' : ''} ${isDayExpanded ? 'plan-day-expanded' : ''}`}>
                    <button type="button" className="plan-day-header-btn" onClick={toggleDay} aria-expanded={isDayExpanded}>
                      <h4 className="plan-day-name">
                        {day.dayName}{day.dateStr ? ` (${day.dateStr})` : ''}{day.isToday ? ' – dnes' : ''}
                      </h4>
                      <span className="plan-day-chevron" aria-hidden>{isDayExpanded ? '▼' : '▶'}</span>
                    </button>
                    {isDayExpanded && (
                    <>
                    <nav className="plan-day-nav" aria-label="Sekce dne">
                      <a href={`#plan-day-${di}-meals`} className="plan-day-nav-link" onClick={(e) => { e.preventDefault(); document.getElementById(`plan-day-${di}-meals`)?.scrollIntoView({ behavior: 'smooth' }); }}>Jídelníček</a>
                      {day.trainingHtml && (
                        <>
                          <span className="plan-day-nav-sep" aria-hidden>|</span>
                          <a href={`#plan-day-${di}-training`} className="plan-day-nav-link" onClick={(e) => { e.preventDefault(); document.getElementById(`plan-day-${di}-training`)?.scrollIntoView({ behavior: 'smooth' }); }}>Trénink</a>
                        </>
                      )}
                    </nav>
                    <div id={`plan-day-${di}-meals`} className="plan-meals">
                      {day._placeholder && day.meals.length === 0 ? (
                        <p className="plan-day-placeholder-msg">V plánu chybí – vygeneruj nový plán pro kompletní jídelníček.</p>
                      ) : null}
                      {day.meals.map((meal, mi) => {
                        const overrideKey = `${day.originalIndex ?? di}_${mi}`;
                        const override = mealOverrides[overrideKey];
                        const mealFullText = override ? `${meal.type || ''} ${override.title || ''}`.trim() : `${meal.type || ''} ${meal.text || ''}`.trim();
                        const mealStart = mealFullText.replace(/\s*\(.*$/, '').trim().slice(0, 35);
                        const matchingRecipe = !override && parsed.recipes?.find((r) => {
                          const rn = r.name.toLowerCase();
                          const mt = mealFullText.toLowerCase();
                          if (mt.includes(rn)) return true;
                          const startWords = mealStart.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
                          if (startWords.length >= 5 && rn.includes(startWords)) return true;
                          return false;
                        });
                        const dishTitle = (meal.text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
                        const modalTitle = (meal.type && dishTitle) ? `${meal.type}: ${dishTitle}` : dishTitle || meal.type || mealFullText || 'Jídlo';
                        const openRecipe = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (override?.content) {
                            const button = e?.currentTarget;
                            const rect = button?.getBoundingClientRect?.();
                            const anchorRect = rect ? { top: rect.bottom + 8, left: rect.left, width: rect.width } : null;
                            recipeOpenIdRef.current += 1;
                            setRecipeModal({ openId: recipeOpenIdRef.current, title: override.title || modalTitle, content: recipeContentOnly(override.content), anchorRect, hasRecipe: true, loading: false });
                            return;
                          }
                          const button = e?.currentTarget;
                          const rect = button?.getBoundingClientRect?.();
                          const anchorRect = rect ? { top: rect.bottom + 8, left: rect.left, width: rect.width } : null;
                          recipeOpenIdRef.current += 1;
                          const thisOpenId = recipeOpenIdRef.current;
                          const hasRealRecipe = matchingRecipe?.content && !/lorem\s+ipsum|dolor\s+sit\s+amet/i.test(matchingRecipe.content);
                          if (hasRealRecipe) {
                            setRecipeModal({ openId: thisOpenId, title: matchingRecipe.name || modalTitle, content: recipeContentOnly(matchingRecipe.content), anchorRect, hasRecipe: true, loading: false });
                            return;
                          }
                          const dishName = (mealFullText.replace(/\s*\([^)]*\)\s*$/g, '').trim() || meal.type || 'Jídlo').slice(0, 150);
                          const isUnverifiedPlaceholder = mealFullText?.toLowerCase().includes('neověřeno') || dishName === 'Jídlo';
                          setRecipeModal({ openId: thisOpenId, title: modalTitle, content: null, anchorRect, hasRecipe: false, loading: true });
                          const recipeId = mealTrust?.recipe_id;
                          const loadRecipe = async () => {
                            if (recipeId) {
                              const spoon = await getSpoonacularRecipe(recipeId);
                              if (spoon) return spoon;
                            }
                            if (isUnverifiedPlaceholder) {
                              return recipeErrorHtml('Recept pro toto jídlo není k dispozici – Spoonacular ho nenalezl. Zkus ho nahradit jiným.');
                            }
                            return getRecipeForDish(dishName);
                          };
                          loadRecipe().then((html) => {
                            const fallback = '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo zkus znovu.</p>';
                            setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: html || fallback, loading: false } : prev));
                          }).catch(() => {
                            setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo zkus znovu.</p>', loading: false } : prev));
                          });
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
                        const mealLookupKey = meal.meal_key || null;
                        const mealTrust = getEnrichedMealTrust(mealFullText || meal.text || meal.type, mealTrustMap, mealLookupKey);
                        const enrichedUrl = getEnrichedMealImage(mealFullText || meal.text || meal.type, mealImagesMap, mealLookupKey);
                        // API-first: (1) meal_trust is priority 1 – use image_url and trust_level from backend. (2) meal_images only if no trust entry. (3) DISH_IMAGES only when no trust metadata at all (legacy). NO LIES: when trust === "none" or backend says no image → placeholder only, never static stock.
                        const dishFallbackUrl = !mealTrust ? getMealImageByDish(mealFullText || meal.text || meal.type) : null;
                        let resolvedUrl = null;
                        let trustLevel = 'none';
                        if (mealTrust) {
                          trustLevel = mealTrust.image_trust_level ?? 'none';
                          if (trustLevel === 'exact' && mealTrust.image_url) {
                            resolvedUrl = mealTrust.image_url;
                          } else if (!API_ONLY_MEDIA && trustLevel === 'illustrative') {
                            resolvedUrl = mealTrust.image_url ?? enrichedUrl ?? null;
                          }
                          if (trustLevel === 'none' || !mealTrust.image_url) {
                            resolvedUrl = null;
                          }
                          if (API_ONLY_MEDIA && trustLevel !== 'exact') {
                            resolvedUrl = null;
                          }
                        } else {
                          resolvedUrl = API_ONLY_MEDIA ? null : (enrichedUrl ?? dishFallbackUrl ?? null);
                          trustLevel = enrichedUrl ? 'illustrative' : (dishFallbackUrl ? 'illustrative' : 'none');
                        }
                        const mealCardKey = `meal-${di}-${mi}-${normalizeLookupKey(mealFullText || meal.text || meal.type).slice(0, 40)}`;
                        const imageLoadFailed = mealImageErrorKeys.has(mealCardKey);
                        const showMealImage = !imageLoadFailed && !!resolvedUrl;
                        return (
                          <div key={mi} className="plan-meal-card">
                            <button type="button" className="plan-meal-image-wrap" onClick={openRecipe} title="Klikni pro zobrazení receptu">
                              {showMealImage ? (
                                <img
                                  src={resolvedUrl}
                                  alt=""
                                  className="plan-meal-image"
                                  onError={() => setMealImageErrorKeys((prev) => new Set([...prev, mealCardKey]))}
                                />
                              ) : (
                                <div className="plan-meal-no-image" aria-hidden>
                                  <span className="plan-meal-no-image-text">Bez ověřeného obrázku</span>
                                </div>
                              )}
                              <span className="plan-meal-type">{meal.type}</span>
                              {showMealImage && (
                                <span className={`plan-trust-badge plan-trust-badge-meal plan-trust-badge-${trustLevel}`} title={trustLevel === 'exact' ? 'Obrázek odpovídá nalezenému receptu' : 'Orientační vizuál'}>
                                  {trustLevel === 'exact' && <>Přesný zdroj{mealTrust?.exact_source === 'spoonacular' ? <span className="plan-trust-sublabel"> Spoonacular</span> : null}</>}
                                  {trustLevel === 'illustrative' && <>Ilustrační foto</>}
                                </span>
                              )}
                              <span className="plan-meal-recept-badge">Klikni pro recept</span>
                            </button>
                            <div className="plan-meal-body">
                              <p className="plan-meal-text">
                                {override ? (override.title || 'Náhrada') : <span dangerouslySetInnerHTML={{ __html: meal.text || meal.fullHtml }} />}
                              </p>
                              <div className="plan-meal-actions">
                                <button type="button" className="plan-meal-swap" onClick={(e) => { e.stopPropagation(); handleSwap(); }}>Nahradit jiným</button>
                                {canPinMeals && (
                                  <button
                                    type="button"
                                    className={`plan-meal-pin ${mealPinned ? 'plan-meal-pin-active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); handleTogglePin(meal.type || '', mealTextForPin, overrideKey); }}
                                    title="Přidá toto jídlo do dalšího týdne – při příštím generování plánu ho AI zahrne."
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
                    {(() => {
                      const dayKey = day.originalIndex ?? di;
                      const dayList = buildDayShoppingListFromMeals(day.meals || [], mealOverrides, dayKey);
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
                              🛒 Objednat suroviny
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
                    {day.trainingHtml && (() => {
                      const trainingItems = parseTrainingItems(day.trainingHtml);
                      return (
                        <div id={`plan-day-${di}-training`} className="plan-day-training">
                          <h3 className="plan-day-training-title">Tréninkový plán</h3>
                          <p className="plan-day-training-intro">Po rozkliknutí cviku se zobrazí, jak cvik provést a obě varianty – <strong>ve fitku</strong> (jaký stroj) i <strong>doma</strong> (alternativa).</p>
                          {trainingItems ? (
                            <ul className="plan-day-training-list">
                              {trainingItems.map((item, idx) => {
                                const iconType = getExerciseIconType(item.text);
                                const equipment = getSafeEquipment(iconType);
                                const exerciseMedia = getExerciseMediaFromItemText(item.text, exerciseMediaMap, item.exercise_key || null);
                                const exTrustLevel = exerciseMedia?.trust_level ?? 'none';
                                const exerciseThumb = (API_ONLY_MEDIA ? exTrustLevel === 'exact' : exTrustLevel !== 'none') ? (exerciseMedia?.gif_url || exerciseMedia?.image_url || null) : null;
                                const itemKey = `training-${di}-${idx}`;
                                const exerciseThumbFailed = exerciseMediaErrorKeys.has(itemKey);
                                const showExerciseThumb = exerciseThumb && !exerciseThumbFailed;
                                const isExpanded = expandedTrainingKey === itemKey;
                                const hasDetail = (equipment.machine || equipment.home) && iconType !== 'total';
                                const isStructuralItem = ['total', 'warmup', 'cooldown', 'rest'].includes(iconType);
                                const showMediaBox = !isStructuralItem;
                                return (
                                  <li key={idx} className={`plan-day-training-item ${isExpanded ? 'plan-day-training-item-expanded' : ''}`}>
                                    <span className="plan-day-training-icon" aria-hidden title="Jak cvičit">
                                      <ExerciseIcon type={iconType} />
                                    </span>
                                    <div className="plan-day-training-body">
                                      {showMediaBox && (showExerciseThumb ? (
                                        <>
                                          <img
                                            src={exerciseThumb}
                                            alt=""
                                            className="plan-day-training-thumb"
                                            loading="lazy"
                                            onError={() => setExerciseMediaErrorKeys((prev) => new Set([...prev, itemKey]))}
                                          />
                                          <span className={`plan-trust-badge plan-trust-badge-exercise plan-trust-badge-${exTrustLevel}`} title={exTrustLevel === 'exact' ? 'Vizuál odpovídá rozpoznanému cviku' : exTrustLevel === 'fallback' ? 'Náhradní vizuál' : ''}>
                                            {exTrustLevel === 'exact' && <>Ověřený cvik{exerciseMedia?.source && exerciseMedia.source !== 'none' ? <span className="plan-trust-sublabel"> {exerciseMedia.source === 'wger' ? 'wger.de' : exerciseMedia.source}</span> : null}</>}
                                            {exTrustLevel === 'fallback' && 'Náhradní vizuál'}
                                          </span>
                                        </>
                                      ) : (
                                        <div className="plan-exercise-no-media" aria-hidden>
                                          <span className="plan-exercise-no-media-text">Bez ověřeného média</span>
                                        </div>
                                      ))}
                                      {hasDetail ? (
                                        <button
                                          type="button"
                                          className="plan-day-training-header-btn"
                                          onClick={() => setExpandedTrainingKey((k) => (k === itemKey ? null : itemKey))}
                                          aria-expanded={isExpanded}
                                        >
                                          <span className="plan-day-training-text" dangerouslySetInnerHTML={{ __html: item.innerHTML }} />
                                          <span className="plan-day-training-toggle-hint">
                                            {isExpanded ? ' ▼ Skrýt detail' : 'Jak na to – stroje ve fitku a varianta doma'}
                                          </span>
                                        </button>
                                      ) : (
                                        <span className="plan-day-training-text" dangerouslySetInnerHTML={{ __html: item.innerHTML }} />
                                      )}
                                      {isExpanded && hasDetail && (
                                        <div className="plan-day-training-detail">
                                          <p className="plan-day-training-detail-title">Jak cvik provést</p>
                                          {equipment.machine && (
                                            <div className="plan-day-training-detail-block">
                                              <strong>Ve fitku – jaký stroj použít:</strong>
                                              <p>{equipment.machine}</p>
                                            </div>
                                          )}
                                          {equipment.home && (
                                            <div className="plan-day-training-detail-block">
                                              <strong>Doma – alternativa:</strong>
                                              <p>{equipment.home}</p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div dangerouslySetInnerHTML={{ __html: day.trainingHtml }} />
                          )}
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
                  <h3>{recipeModal.hasRecipe ? `Recept: ${recipeModal.title}` : recipeModal.title}</h3>
                  <span className="plan-recipe-portion-label">Na 1 porci</span>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setRecipeModal(null)} aria-label="Zavřít">×</button>
                </div>
                {recipeModal.loading ? (
                  <div className="plan-recipe-modal-loading">
                    <span className="plan-recipe-modal-spinner" />
                    <p>Načítám recept z internetu…</p>
                  </div>
                ) : (
                  <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: recipeModal.content || '' }} />
                )}
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
                    <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: swapModal.html || '<p>Recept se nepodařilo načíst.</p>' }} />
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
            const fullList = parsed.shoppingList?.length ? parsed.shoppingList : buildShoppingListFromRecipes(parsed.recipes);
            const dayIndex = shoppingFilter === 'week' ? null : Number(shoppingFilter);
            const selectedDay = dayIndex != null && !Number.isNaN(dayIndex) ? displayedDays.find((d) => (d.originalIndex ?? -1) === dayIndex) : null;
            const dayList = selectedDay ? buildDayShoppingListFromMeals(selectedDay.meals || [], mealOverrides, selectedDay.originalIndex ?? 0) : [];
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
                const res = await fetch('/api/send-shopping-list', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ items: list }),
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
            const hasAnyList = fullList.length > 0 || displayedDays.some((d) => {
              const texts = (d.meals || []).map((m) => `${m.type || ''} ${m.text || ''}`.trim());
              return buildShoppingListFromRecipes(getRecipesForDay(parsed?.recipes || [], texts)).length > 0;
            });
            if (!hasAnyList) return null;
            return (
              <div className="plan-block plan-shopping-block">
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
                        {displayedDays.map((d) => (
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
                        <div className="plan-order-ingredients">
                          <div className="plan-shopping-actions">
                            <button type="button" className="plan-btn-order" onClick={copyAndOpen}>
                              🛒 Objednat suroviny
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
                        {shoppingFilter === 'week' ? 'Nákupní seznam zatím není k dispozici.' : 'Pro vybraný den nejsou v plánu vypsané suroviny (závorky u jídel).'}
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
    gap: 12px;
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
  .plan-training-content img { display: none; }
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
    background: rgba(0,0,0,0.15);
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.05);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .plan-meal-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  }
  .plan-meal-image-wrap {
    position: relative;
    height: 140px;
    overflow: hidden;
    display: block;
    width: 100%;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .plan-meal-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .plan-meal-type {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0,0,0,0.7);
    color: #e9d5ff;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }
  .plan-meal-recept-badge {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: rgba(139, 92, 255, 0.9);
    color: #fff;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .plan-trust-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.3;
    pointer-events: none;
  }
  .plan-trust-badge-meal { top: 38px; }
  .plan-trust-badge-exact {
    background: rgba(34, 197, 94, 0.9);
    color: #fff;
  }
  .plan-trust-badge-illustrative, .plan-trust-badge-fallback {
    background: rgba(148, 163, 184, 0.9);
    color: #0f172a;
  }
  .plan-trust-badge-none {
    background: rgba(71, 85, 105, 0.85);
    color: #e2e8f0;
  }
  .plan-trust-sublabel { opacity: 0.9; font-size: 9px; font-weight: 500; }
  .plan-meal-no-image, .plan-exercise-no-media {
    width: 100%;
    height: 100%;
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(30, 41, 59, 0.6);
    border: 1px dashed rgba(148, 163, 184, 0.4);
    border-radius: 10px;
  }
  .plan-meal-no-image { height: 140px; min-height: 140px; }
  .plan-meal-no-image-text, .plan-exercise-no-media-text {
    font-size: 12px;
    color: #94a3b8;
    padding: 0 12px;
    text-align: center;
  }
  .plan-trust-badge-exercise { position: relative; top: 0; margin-top: 4px; display: inline-block; }
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
  .plan-meal-body {
    padding: 14px;
    position: relative;
  }
  .plan-meal-text {
    margin: 0 0 8px;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.5;
  }
  .plan-meal-text :global(b) {
    color: #e9d5ff;
  }
  .plan-meal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
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

  .plan-recipe-links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plan-recipe-links li { margin: 0; }
  .plan-recipe-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    color: #c4b5fd;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .plan-recipe-link:hover {
    background: rgba(139, 92, 255, 0.15);
    border-color: rgba(139, 92, 255, 0.3);
  }
  .plan-recipe-link span:last-child {
    opacity: 0.7;
    font-size: 18px;
  }

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
    .plan-meal-card { border-radius: 12px; }
    .plan-meal-image-wrap { height: 140px; min-height: 120px; }
    .plan-meal-no-image { height: 140px; min-height: 140px; }
    .plan-meal-body { padding: 14px 16px; }
    .plan-meal-text { font-size: 14px; line-height: 1.5; }
    .plan-meal-actions { gap: 12px; flex-wrap: wrap; }
    .plan-meal-swap, .plan-meal-pin {
      min-height: 48px;
      padding: 12px 16px;
      font-size: 14px;
      touch-action: manipulation;
    }
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
