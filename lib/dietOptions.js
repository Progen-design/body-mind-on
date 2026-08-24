/**
 * Jediný zdroj pravdy o tom, které typy stravy smí uživatel zvolit.
 *
 * PROČ TENHLE MODUL EXISTUJE
 * Nabídka diet byla natvrdo v pěti JSX souborech (start.js, ProgramForm.js,
 * PreferencesOverlay.jsx, chci-vip.js, on-club.js) a rozešla se: vegan byl
 * `disabled` jen ve třech z nich, takže přes zbylé dvě stránky si ho šlo
 * vybrat, přestože katalog na něj nestačí.
 *
 * Druhá půlka problému je, že `disabled` v UI je jen kosmetika. Server
 * `diet_type` nevaliduje vůbec (na rozdíl od `training_environment`, který
 * proti seznamu kontrolovaný je), takže POST s vypnutou dietou prošel.
 * U paleo to znamenalo nefiltrovaný jídelníček — viz `paleo` níž.
 *
 * Tenhle seznam je proto autorita pro SERVER. UI ho zatím nekonzumuje
 * (JSX se nepřepisovalo), ale server odmítne cokoli, co tu není povolené,
 * takže se rozejít můžou nanejvýš popisky, ne bezpečnost jídelníčku.
 */

/**
 * @typedef {{ value: string, label: string, enabled: boolean, reason?: string }} DietOption
 */

/**
 * Kolik aktivních receptů potřebuje jeden slot, aby šla dieta dodat.
 *
 * PROČ SEDM. Tolik si objednává `objednejZNevyresenehoSlotu`, když se slot
 * nevyřeší — je to počet, pod kterým se jídelníček začne opakovat, protože
 * týden má sedm dní. Do 24. 8. 2026 to číslo žilo dvakrát: jako `pozadovano: 7`
 * ve frontě a jako věta v komentáři u `DIETA`. Watchdog na něj potřeboval
 * sáhnout taky, takže má konečně jméno.
 *
 * Zrcadlí ho i pohled `system_health_alerts` (větev `dieta_pod_kritickym_poctem`).
 * Že se nerozešly, hlídá test v lib/__tests__/dietaWatchdog.test.mjs.
 */
export const MIN_RECEPTU_NA_SLOT = 7;

/** @type {readonly DietOption[]} */
export const DIET_OPTIONS = Object.freeze([
  Object.freeze({ value: 'vegetarian', label: 'Vegetarián', enabled: true }),
  Object.freeze({
    value: 'vegan',
    label: 'Vegan',
    enabled: false,
    reason: 'Veganský jídelníček zatím nedokážeme sestavit — v katalogu je '
      + 'málo veganských receptů. Pracujeme na tom.',
  }),
  Object.freeze({ value: 'gluten_free', label: 'Bez lepku', enabled: true }),
  // lactose_free se neřeší přes diet_tags, ale přes vyloučení mléčných výrobků
  // v dietaryPublishGate.js. Proto je povolené i s nulovým počtem tagů.
  Object.freeze({ value: 'lactose_free', label: 'Bez laktózy', enabled: true }),
  Object.freeze({
    value: 'paleo',
    label: 'Paleo',
    enabled: false,
    reason: 'Paleo jídelníček zatím nedokážeme sestavit — v katalogu je '
      + 'málo paleo receptů. Pracujeme na tom.',
  }),
  Object.freeze({ value: 'low_carb', label: 'Nízkosacharidová', enabled: true }),
  Object.freeze({ value: 'other', label: 'Jiné', enabled: true }),
]);

/** @type {Readonly<Record<string, DietOption>>} */
const PODLE_HODNOTY = Object.freeze(
  Object.fromEntries(DIET_OPTIONS.map((o) => [o.value, o]))
);

/**
 * Prázdná hodnota = „žádná preference“ a je vždycky v pořádku.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isDietTypeSupported(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return true;
  return PODLE_HODNOTY[v]?.enabled === true;
}

/**
 * Důvod k odmítnutí, nebo null když je hodnota v pořádku.
 *
 * Neznámou hodnotu (překlep, stará verze formuláře, ruční POST) odmítáme
 * taky — tiše ji přepsat na „žádná preference“ by znamenalo poslat člověku
 * jídelníček, o který nežádal.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
export function dietTypeRejectionReason(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const o = PODLE_HODNOTY[v];
  if (!o) return 'Neznámý typ stravy.';
  if (!o.enabled) return o.reason ?? `${o.label} zatím není k dispozici.`;
  return null;
}
