/**
 * lib/validatePlanHtml.js
 * Sdílená validace HTML plánu – core sekce + strukturální (7 dní, jídla, Trénink tento den).
 * Používá se v taskExecutors, profile API i profil.js (client).
 *
 * Plán je validní pouze když:
 * 1) projde core validací: Jídelníček, Trénink, alespoň jedna meal sekce, délka >= 1000
 * 2) projde strukturální validací: 7 rozpoznatelných dnů, u každého Snídaně/Oběd/Večeře + blok „Trénink tento den“
 */

const CORE_SECTIONS = {
  JIDELNICEK: /jídelníček|jidelníček|jidelnicek/i,
  TRENINK: /trénink|trenink/i,
  SNIDANE: /snídaně|snidane/i,
  OBED: /oběd|obed/i,
  VECERE: /večeře|vecere/i,
};

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/** Regex: nadpis dne (h3/h4) s názvem dne. */
function buildDayHeadingPattern() {
  const escaped = CZECH_DAYS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`<h[34][^>]*>\\s*(${escaped})\\s*</h[34]>`, 'gi');
}

/** Vrátí pole { dayName, content } pro každý nalezený den v pořadí (obsah od konce nadpisu do začátku dalšího). */
function findDayBlocks(html) {
  if (!html || typeof html !== 'string') return [];
  const pattern = buildDayHeadingPattern();
  const matches = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    matches.push({ dayName: m[1], start: m.index, end: m.index + m[0].length });
  }
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const from = matches[i].end;
    const to = i + 1 < matches.length ? matches[i + 1].start : html.length;
    blocks.push({ dayName: matches[i].dayName, content: html.slice(from, to) });
  }
  return blocks;
}

/** V daném bloku (text) hledá Snídaně, Oběd, Večeře (jako nadpisy nebo silné označení). */
function dayHasMeals(content) {
  if (!content || typeof content !== 'string') return false;
  const lower = content.toLowerCase().replace(/\s+/g, ' ');
  const hasSnidane = /snídaně|snidane|sniď/i.test(lower) || /<h[34][^>]*>[\s\S]*?snídaně/i.test(content);
  const hasObed = /oběd|obed/i.test(lower) || /<h[34][^>]*>[\s\S]*?oběd/i.test(content);
  const hasVecere = /večeře|vecere|večeř/i.test(lower) || /<h[34][^>]*>[\s\S]*?večeře/i.test(content);
  return hasSnidane && hasObed && hasVecere;
}

/** V daném bloku hledá „Trénink tento den“ (p + b + ul nebo ekvivalent). */
function dayHasTrainingBlock(content) {
  if (!content || typeof content !== 'string') return false;
  return /Trénink tento den|trenink tento den/i.test(content) && /<ul[^>]*>[\s\S]*?<\/ul>/i.test(content);
}

/**
 * Strukturální validace: 7 dní, u každého jídla + Trénink tento den.
 * @returns {{ dayCount: number, daysMissingMeals: string[], daysMissingTrainingBlock: string[], reason: string|null }}
 */
function validateStructure(html) {
  const daysMissingMeals = [];
  const daysMissingTrainingBlock = [];
  if (!html || typeof html !== 'string') {
    return { dayCount: 0, daysMissingMeals: [], daysMissingTrainingBlock: [], reason: 'html_missing' };
  }
  const dayBlocks = findDayBlocks(html);
  const count = dayBlocks.length;
  for (const { dayName, content } of dayBlocks) {
    if (!dayHasMeals(content)) daysMissingMeals.push(dayName);
    if (!dayHasTrainingBlock(content)) daysMissingTrainingBlock.push(dayName);
  }
  let reason = null;
  if (count < 7) reason = 'missing_days_structure';
  else if (daysMissingTrainingBlock.length > 0) reason = 'missing_training_blocks';
  else if (daysMissingMeals.length > 0) reason = 'missing_meal_blocks_per_day';
  return {
    dayCount: count,
    daysMissingMeals,
    daysMissingTrainingBlock,
    reason,
  };
}

/**
 * @returns {{
 *   ok: boolean,
 *   length: number,
 *   matchedSections: string[],
 *   missingCoreSections: string[],
 *   reason: string|null,
 *   structure: { dayCount: number, daysMissingMeals: string[], daysMissingTrainingBlock: string[] }
 * }}
 */
export function validatePublishedPlanHtml(html) {
  const emptyStructure = { dayCount: 0, daysMissingMeals: [], daysMissingTrainingBlock: [] };
  if (!html || typeof html !== 'string') {
    return {
      ok: false,
      length: 0,
      matchedSections: [],
      missingCoreSections: ['Jídelníček', 'Trénink', 'meal_sections'],
      reason: 'html_missing_or_not_string',
      structure: emptyStructure,
    };
  }
  const trimmed = html.trim();
  if (!trimmed.length) {
    return {
      ok: false,
      length: 0,
      matchedSections: [],
      missingCoreSections: ['Jídelníček', 'Trénink', 'meal_sections'],
      reason: 'html_missing_or_not_string',
      structure: emptyStructure,
    };
  }
  const len = trimmed.length;

  const hasJidelnicek = CORE_SECTIONS.JIDELNICEK.test(trimmed);
  const hasTrenink = CORE_SECTIONS.TRENINK.test(trimmed);
  const hasSnidane = CORE_SECTIONS.SNIDANE.test(trimmed);
  const hasObed = CORE_SECTIONS.OBED.test(trimmed);
  const hasVecere = CORE_SECTIONS.VECERE.test(trimmed);
  const hasMealSection = hasSnidane || hasObed || hasVecere;

  const matchedSections = [];
  if (hasJidelnicek) matchedSections.push('Jídelníček');
  if (hasTrenink) matchedSections.push('Trénink');
  if (hasSnidane) matchedSections.push('Snídaně');
  if (hasObed) matchedSections.push('Oběd');
  if (hasVecere) matchedSections.push('Večeře');

  const missingCoreSections = [];
  if (!hasJidelnicek) missingCoreSections.push('Jídelníček');
  if (!hasTrenink) missingCoreSections.push('Trénink');
  if (!hasMealSection) missingCoreSections.push('Snídaně/Oběd/Večeře');

  const MIN_PLAN_HTML_LENGTH = 3500;
  if (len < MIN_PLAN_HTML_LENGTH) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: `html_too_short_${len}`, structure: emptyStructure };
  }
  if (!hasJidelnicek) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_jidelnicek', structure: emptyStructure };
  }
  if (!hasTrenink) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_trenink', structure: emptyStructure };
  }
  if (!hasMealSection) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_meal_sections', structure: emptyStructure };
  }

  const structure = validateStructure(trimmed);
  if (structure.reason) {
    return {
      ok: false,
      length: len,
      matchedSections,
      missingCoreSections,
      reason: structure.reason,
      structure: {
        dayCount: structure.dayCount,
        daysMissingMeals: structure.daysMissingMeals,
        daysMissingTrainingBlock: structure.daysMissingTrainingBlock,
      },
    };
  }

  return {
    ok: true,
    length: len,
    matchedSections,
    missingCoreSections: [],
    reason: null,
    structure: {
      dayCount: structure.dayCount,
      daysMissingMeals: structure.daysMissingMeals,
      daysMissingTrainingBlock: structure.daysMissingTrainingBlock,
    },
  };
}
