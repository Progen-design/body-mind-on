/**
 * Lifecycle e-maily řízené stavem členství.
 *
 * DVĚ SEKVENCE, DVA RŮZNÉ CÍLE:
 *
 *   pending_payment → člověk se zaregistroval, plán má, ale NEAKTIVOVAL.
 *                     Stripe o něm neví. Cíl: dostat ho do checkoutu.
 *
 *   trial          → kartu dal, 7 dní běží ve Stripu, 8. den se strhne samo.
 *                     Cíl NENÍ prodat — to je hotové. Cíl je, aby produkt
 *                     používal a předplatné nezrušil.
 *
 * Míchat je do jedné sekvence by znamenalo posílat lidem výzvy k platbě,
 * kteří už zaplatili. To je nejrychlejší způsob, jak si vysloužit odhlášení.
 */

export const LIFECYCLE_TRIGGERS = Object.freeze([
  // Neaktivoval — plán je zamčený
  'activate_1h',
  'activate_24h',
  'activate_72h',
  // Trial běží ve Stripu
  'trial_welcome',
  'trial_day3',
  'trial_day5',
  'trial_ends_tomorrow',
  // Za flagem LIFECYCLE_TRIAL_ENDED_ENABLED (viz lifecycleEmailRules.js)
  'trial_ends_tomorrow_card', // trial s kartou: zítra strhneme první platbu
  'trial_ended',              // trial bez karty skončil, plán je pozastavený
  'trial_winback_d3',         // 3 dny po konci, poslední e-mail k trialu
]);

/** Pořadí důležitosti — když je splněno víc podmínek, pošle se jen ta první. */
export const LIFECYCLE_PRIORITY = Object.freeze([
  'trial_ends_tomorrow', // nejvyšší: zítra strhneme peníze, člověk to musí vědět
  'trial_ends_tomorrow_card',
  'trial_ended',
  'trial_winback_d3',
  'activate_1h',
  'activate_24h',
  'activate_72h',
  'trial_welcome',
  'trial_day3',
  'trial_day5',
]);

/** Triggery, které jdou i v rámci odstupu — varování před stržením peněz. */
export const LIFECYCLE_BYPASS_MIN_GAP = Object.freeze(['trial_ends_tomorrow', 'trial_ends_tomorrow_card']);

/** Po kolika dnech od konce trialu už e-maily k trialu neposíláme. */
export const TRIAL_ENDED_MAX_DAYS = 14;

/** Nejvýš jeden lifecycle e-mail na uživatele za 24 hodin. */
export const LIFECYCLE_MIN_HOURS_BETWEEN = 24;

/** Kolik e-mailů se odešle v jednom běhu cronu. */
export const LIFECYCLE_DISPATCH_BATCH = 25;

/** Po kolika neúspěších to vzdáme. */
export const LIFECYCLE_MAX_ATTEMPTS = 3;

export const MS_HOUR = 60 * 60 * 1000;
export const MS_DAY = 24 * MS_HOUR;
