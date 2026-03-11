/**
 * lib/validatePlanHtml.js
 * Sdílená validace HTML plánu – core sekce produktu.
 * Používá se v taskExecutors, profile API i profil.js (client).
 *
 * Plán je validní pouze když obsahuje:
 * 1) sekci Jídelníček
 * 2) sekci Trénink
 * 3) alespoň jednu z: Snídaně, Oběd, Večeře
 * 4) délku >= 1000
 */

const CORE_SECTIONS = {
  JIDELNICEK: /jídelníček|jidelníček|jidelnicek/i,
  TRENINK: /trénink|trenink/i,
  SNIDANE: /snídaně|snidane/i,
  OBED: /oběd|obed/i,
  VECERE: /večeře|vecere/i,
};

/** @returns {{ ok: boolean, length: number, matchedSections: string[], missingCoreSections: string[], reason: string|null }} */
export function validatePublishedPlanHtml(html) {
  if (!html || typeof html !== 'string') {
    return { ok: false, length: 0, matchedSections: [], missingCoreSections: ['Jídelníček', 'Trénink', 'meal_sections'], reason: 'html_missing_or_not_string' };
  }
  const trimmed = html.trim();
  if (!trimmed.length) {
    return { ok: false, length: 0, matchedSections: [], missingCoreSections: ['Jídelníček', 'Trénink', 'meal_sections'], reason: 'html_missing_or_not_string' };
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

  if (len < 1000) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: `html_too_short_${len}` };
  }
  if (missingCoreSections.length > 1) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_core_sections_multiple' };
  }
  if (!hasJidelnicek) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_jidelnicek' };
  }
  if (!hasTrenink) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_trenink' };
  }
  if (!hasMealSection) {
    return { ok: false, length: len, matchedSections, missingCoreSections, reason: 'missing_meal_sections' };
  }

  return { ok: true, length: len, matchedSections, missingCoreSections: [], reason: null };
}
