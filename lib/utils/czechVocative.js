/**
 * Czech vocative case formatter for first names.
 * Returns a vocative form when possible, otherwise falls back to the original
 * nominative form. Never throws – always returns a printable string.
 *
 *   Jan    -> Jane
 *   Eva    -> Evo
 *   Tomáš  -> Tomáši
 *   Petr   -> Petře
 *   Adam   -> Adame
 *   Lukáš  -> Lukáši
 *   Marie  -> Marie       (unchanged: -ie / foreign)
 *   Mike   -> Mike        (foreign – returned as-is)
 */

const EXPLICIT_VOCATIVE = {
  jan: 'Jane',
  petr: 'Petře',
  pavel: 'Pavle',
  pavla: 'Pavlo',
  martin: 'Martine',
  michal: 'Michale',
  marek: 'Marku',
  david: 'Davide',
  jakub: 'Jakube',
  ondřej: 'Ondřeji',
  matěj: 'Matěji',
  tomáš: 'Tomáši',
  lukáš: 'Lukáši',
  vojtěch: 'Vojtěchu',
  filip: 'Filipe',
  karel: 'Karle',
  jiří: 'Jiří',
  josef: 'Josefe',
  miroslav: 'Miroslave',
  vladimír: 'Vladimíre',
  zdeněk: 'Zdeňku',
  radek: 'Radku',
  daniel: 'Danieli',
  michaela: 'Michaelo',
  tereza: 'Terezo',
  kateřina: 'Kateřino',
  veronika: 'Veroniko',
  eliška: 'Eliško',
  anna: 'Anno',
  hana: 'Hano',
  jana: 'Jano',
  eva: 'Evo',
  lucie: 'Lucie',
  klára: 'Kláro',
  barbora: 'Barboro',
  petra: 'Petro',
  martina: 'Martino',
  monika: 'Moniko',
  zuzana: 'Zuzano',
  marie: 'Marie',
  alena: 'Aleno',
  iveta: 'Iveto',
  dana: 'Dano',
  ivana: 'Ivano',
  helena: 'Heleno',
};

function isLowerVowel(ch) {
  return /[aeiouyáéíóúýě]/.test(ch);
}

function looksCzech(name) {
  return /^[A-Za-zÁ-Žá-ž]+$/.test(name);
}

function capitalizeFirst(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function vocativeMale(lower) {
  const last = lower.slice(-1);
  const lastTwo = lower.slice(-2);

  if (last === 'í') return lower;
  if (last === 'a') return lower.slice(0, -1) + 'o';
  if (last === 'e') return lower;
  if (last === 'š' || last === 'č' || last === 'ž' || last === 'ř' || last === 'j' || last === 'ť') {
    return lower + 'i';
  }
  if (last === 'k') return lower + 'u';
  if (last === 'h' || last === 'g' || last === 'ch') {
    return lower + 'u';
  }
  if (lastTwo === 'el' || lastTwo === 'er') {
    return lower.slice(0, -2) + (lastTwo === 'el' ? 'le' : 're');
  }
  if (last === 'r' && lower.length >= 2 && !isLowerVowel(lower.slice(-2, -1))) {
    return lower + 'e';
  }
  if (last === 'l' && lower.length >= 2 && !isLowerVowel(lower.slice(-2, -1))) {
    return lower + 'e';
  }
  if (last === 'c') return lower + 'i';
  if (isLowerVowel(last)) return lower;
  return lower + 'e';
}

function vocativeFemale(lower) {
  const last = lower.slice(-1);
  if (last === 'a') return lower.slice(0, -1) + 'o';
  if (last === 'e') return lower;
  if (last === 'ě') return lower;
  if (last === 'í') return lower;
  return lower;
}

function guessGender(lower) {
  if (/(a|e)$/.test(lower) && !/(slav|sláv|ša)a$/.test(lower)) return 'female';
  if (/(ie)$/.test(lower)) return 'female';
  return 'male';
}

/**
 * @param {string|null|undefined} firstName Nominative-case first name.
 * @returns {string} Vocative form, or original first name as a fallback.
 */
export function toCzechVocative(firstName) {
  const raw = String(firstName || '').trim();
  if (!raw) return '';
  const head = raw.split(/\s+/)[0];
  if (!looksCzech(head)) return head;

  const lower = head.toLowerCase();
  const explicit = EXPLICIT_VOCATIVE[lower];
  if (explicit) return explicit;

  const gender = guessGender(lower);
  const result = gender === 'female' ? vocativeFemale(lower) : vocativeMale(lower);
  return capitalizeFirst(result);
}

export default toCzechVocative;
