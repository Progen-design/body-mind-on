/**
 * Formats Czech dates in words: "11. května" -> "jedenáctého května".
 * Day as ordinal in genitive ("prvního", "jedenáctého", "dvacátého prvního").
 * Month name as already supplied in genitive (ledna, února, ...).
 */

const MONTHS_GENITIVE = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
];

const DAY_ORDINAL_GENITIVE = [
  '',
  'prvního',
  'druhého',
  'třetího',
  'čtvrtého',
  'pátého',
  'šestého',
  'sedmého',
  'osmého',
  'devátého',
  'desátého',
  'jedenáctého',
  'dvanáctého',
  'třináctého',
  'čtrnáctého',
  'patnáctého',
  'šestnáctého',
  'sedmnáctého',
  'osmnáctého',
  'devatenáctého',
  'dvacátého',
  'dvacátého prvního',
  'dvacátého druhého',
  'dvacátého třetího',
  'dvacátého čtvrtého',
  'dvacátého pátého',
  'dvacátého šestého',
  'dvacátého sedmého',
  'dvacátého osmého',
  'dvacátého devátého',
  'třicátého',
  'třicátého prvního',
];

const ORDINAL_NOMINATIVE = [
  '',
  'První',
  'Druhý',
  'Třetí',
  'Čtvrtý',
  'Pátý',
  'Šestý',
  'Sedmý',
  'Osmý',
  'Devátý',
  'Desátý',
  'Jedenáctý',
  'Dvanáctý',
  'Třináctý',
  'Čtrnáctý',
];

function parseIsoYmd(value) {
  const iso = String(value || '').replace(/T.*/, '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return { year: y, month: m, day: d };
}

/**
 * Returns the date written in Czech words ("jedenáctého května").
 * Returns empty string when the input cannot be parsed.
 *
 * @param {string} isoDateYmd ISO date (YYYY-MM-DD)
 * @returns {string}
 */
export function formatDayDateWords(isoDateYmd) {
  const parsed = parseIsoYmd(isoDateYmd);
  if (!parsed) return '';
  const dayWord = DAY_ORDINAL_GENITIVE[parsed.day];
  const monthWord = MONTHS_GENITIVE[parsed.month - 1];
  if (!dayWord || !monthWord) return '';
  return `${dayWord} ${monthWord}`;
}

/**
 * Returns short numeric Czech date "11. května".
 */
export function formatDayDateNumeric(isoDateYmd) {
  const parsed = parseIsoYmd(isoDateYmd);
  if (!parsed) return '';
  const monthWord = MONTHS_GENITIVE[parsed.month - 1];
  return `${parsed.day}. ${monthWord}`;
}

/**
 * Returns Czech ordinal in nominative ("První", "Druhý", ..., "Sedmý").
 * Index is 1-based.
 */
export function ordinalNominative(index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 1) return '';
  return ORDINAL_NOMINATIVE[i] || `${i}.`;
}

/**
 * "První den", "Druhý den", ..., "Sedmý den".
 */
export function dayOrdinalCs(index) {
  const word = ordinalNominative(index);
  if (!word) return `${index}. den`;
  return `${word} den`;
}

export default formatDayDateWords;
