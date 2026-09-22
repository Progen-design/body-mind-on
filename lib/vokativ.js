// 5. pád českých křestních jmen — JEDEN zdroj pro appku i server.
// PROMPT_DNES_WOW.md; od PROMPT_DOLADENI_DNES.md (22. 9. 2026) sdílený:
// `src/lib/vokativ.ts` ho jen re-exportuje, `lib/inactivityReminder.js` ho
// používá pro e-maily. Čisté JS + JSDoc, bez TS syntaxe.
//
// PRAVIDLO: RADĚJI ŽÁDNÉ JMÉNO NEŽ ŠPATNÝ TVAR. Když si funkce není jistá
// (neznámá koncovka, jméno s číslem, cizí zápis), vrací `null` a pozdrav
// zůstane bez jména. „Dobrý večer, Jan" i „Dobrý večer, Denise" jsou horší
// než „Dobrý večer.".
//
// Pravidla jsou záměrně jen ta, která platí spolehlivě pro běžná jména:
//   -a → -o (Honza → Honzo, Jana → Jano)      -e, -ie, -o, -i, -y, -u, -í, -ý → beze změny
//   -ek → -ku (Marek → Marku)                 -el po souhlásce → -le (Pavel → Pavle)
//   -ec → -ci                                  -k, -h, -g, -ch → +u (Jindřich → Jindřichu)
//   -š, -ž, -č, -ř, -c, -j → +i (Tomáš → Tomáši)
//   souhláska + r → -ře (Petr → Petře)         jiná souhláska → +e (Jan → Jane)
// Výjimky (a jména, kde je jistější neříkat nic) jsou v tabulce níž.

/** `null` = „neskloňuj, radši pozdrav bez jména". */
/** @type {Record<string, string | null>} */
const VYJIMKY = {
  // Pravidlo by dalo správný tvar i tady, ale jsou to nejčastější jména — ať je to vidět.
  pavel: 'Pavle',
  karel: 'Karle',
  michal: 'Michale',
  jiří: 'Jiří',
  // -el po samohlásce: Daniel → Danieli, ne „Danile".
  daniel: 'Danieli',
  samuel: 'Samueli',
  // Měkčení ě → ň.
  zdeněk: 'Zdeňku',
  zbyněk: 'Zbyňku',
  čeněk: 'Čeňku',
  // Ženská jména na souhlásku — 5. pád je stejný jako 1. pád.
  ester: 'Ester',
  miriam: 'Miriam',
  ingrid: 'Ingrid',
  dagmar: 'Dagmar',
  karin: 'Karin',
  ruth: 'Ruth',
  nikol: 'Nikol',
  ivet: 'Ivet',
  tomas: 'Tomáši',
  // Nejasný rod nebo nejasný tvar — radši nic.
  alex: null,
  denis: null,
  felix: null,
  alois: null,
  max: null,
};

const SOUHLASKY = 'bcčdfghjklmnpqrřsštvwxzž';
const SAMOHLASKY = 'aáeéěiíoóuúůyý';

/** @param {string} z */
const jeSouhlaska = (z) => z !== '' && SOUHLASKY.includes(z);
/** @param {string} z */
const jeSamohlaska = (z) => z !== '' && SAMOHLASKY.includes(z);

/** Jen písmena (vč. diakritiky), 2–20 znaků — cokoli jiného není jméno k skloňování. */
/** @param {string} text */
function jeCistyKrestniJmeno(text) {
  return /^[\p{L}]{2,20}$/u.test(text);
}

/** @param {string} text */
function velkyZacatek(text) {
  const male = text.toLocaleLowerCase('cs-CZ');
  return male.charAt(0).toLocaleUpperCase('cs-CZ') + male.slice(1);
}

/**
 * @param {string|null|undefined} krestniJmeno jen první slovo z jména (`prvniSlovo` ho ustřihne)
 * @returns {string|null} 5. pád, nebo `null`, když si nejsme jistí
 */
export function vokativ(krestniJmeno) {
  const vstup = String(krestniJmeno ?? '').trim();
  if (!jeCistyKrestniJmeno(vstup)) return null;

  const jmeno = velkyZacatek(vstup);
  const male = jmeno.toLocaleLowerCase('cs-CZ');

  if (Object.prototype.hasOwnProperty.call(VYJIMKY, male)) return VYJIMKY[male];

  const posledni = male.slice(-1);
  const predposledni = male.slice(-2, -1);
  const zaklad = jmeno.slice(0, -1);

  // -ia, -ea po samohlásce: Julia, Sofia — Julie? Julio? Neuhodneme.
  if (posledni === 'a' && predposledni === 'i') return null;
  if (posledni === 'a') return `${zaklad}o`;

  if (['e', 'é', 'o', 'i', 'y', 'u', 'í', 'ý'].includes(posledni)) return jmeno;

  if (!jeSouhlaska(posledni)) return null;

  if (male.endsWith('ek')) return `${jmeno.slice(0, -2)}ku`;
  if (male.endsWith('ec')) return `${jmeno.slice(0, -2)}ci`;
  if (male.endsWith('el')) {
    // Pavel, Karel: souhláska + el → -le. Po samohlásce (Daniel) je to jinak.
    return jeSouhlaska(male.slice(-3, -2)) ? `${jmeno.slice(0, -2)}le` : null;
  }

  if (male.endsWith('ch')) return `${jmeno}u`;
  if (['k', 'h', 'g'].includes(posledni)) return `${jmeno}u`;
  if (['š', 'ž', 'č', 'ř', 'c', 'j'].includes(posledni)) return `${jmeno}i`;

  // s, x, z, q, w a měkké ď/ť/ň mají vlastní pravidla — neuhodneme.
  if (['s', 'x', 'z', 'q', 'w', 'ď', 'ť', 'ň'].includes(posledni)) return null;

  if (posledni === 'r') {
    // Petr, Alexandr: souhláska + r → -ře. Viktor, Igor, Peter: samohláska + r → +e.
    return jeSouhlaska(predposledni) ? `${jmeno.slice(0, -1)}ře` : `${jmeno}e`;
  }

  // Jan, Martin, David, Filip, Michal, Jakub, Kryštof, Miroslav…
  if (jeSamohlaska(predposledni) || jeSouhlaska(predposledni)) return `${jmeno}e`;
  return null;
}

/**
 * První slovo z celého jména („Jan Novák" → „Jan"), nebo `null`.
 * @param {string|null|undefined} jmeno
 * @returns {string|null}
 */
export function prvniSlovo(jmeno) {
  const slovo = String(jmeno ?? '').trim().split(/\s+/)[0] ?? '';
  return slovo || null;
}

/**
 * Oslovení pro pozdrav. Priorita:
 *   1. `profiles.preferred_address` — co si člověk napsal sám (už v 5. pádu),
 *   2. vokativ z křestního jména (`body_metrics.name`),
 *   3. `null` — pozdrav bez jména.
 *
 * @param {string|null|undefined} preferredAddress
 * @param {string|null|undefined} jmeno
 * @returns {string|null}
 */
export function urciOsloveni(preferredAddress, jmeno) {
  const vlastni = String(preferredAddress ?? '').trim();
  if (vlastni) return vlastni;
  return vokativ(prvniSlovo(jmeno));
}
