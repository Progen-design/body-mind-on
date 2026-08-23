/**
 * KATEGORIE A JEDNOTKY METRIK Z APPLE HEALTH.
 *
 * PROČ. `apple_health_metrics_daily` už nese `label_cs`, `category`, `unit`,
 * `agg` a `is_key` — sloupce jsou naplněné od importu a do 22. 8. 2026 je
 * nečetl nikdo. Profil zobrazoval 7 metrik z 31, které hodinky posílají,
 * bez ladu a skladu pod sebou. Tenhle modul dodává jen to, co v databázi
 * není: české názvy kategorií, pořadí sekcí a překlad jednotek.
 *
 * CO TENHLE MODUL NEDĚLÁ. Neurčuje, které metriky se zobrazí — to řídí
 * `is_key` z databáze a přítomnost naměřené hodnoty. Natvrdo psaný seznam
 * metrik by se rozešel s importem při první nové metrice.
 *
 * MODUL JE ČISTÝ — bez importů, kvůli `node --test` bez transpilace.
 */

/** Pořadí sekcí v UI. Klíč = `category` z databáze. */
export const KATEGORIE = [
  { klic: 'srdce', nazev: 'Srdce' },
  { klic: 'spanek', nazev: 'Spánek' },
  { klic: 'aktivita', nazev: 'Aktivita' },
  { klic: 'pohyb', nazev: 'Pohyb' },
  { klic: 'dychani', nazev: 'Dýchání' },
  { klic: 'telo', nazev: 'Tělo' },
  { klic: 'prostredi', nazev: 'Prostředí' },
];

/** Kategorie, kterou import nezná. Nikdy nepadáme, jen zařadíme na konec. */
export const NEZNAMA_KATEGORIE = { klic: 'ostatni', nazev: 'Ostatní' };

export function nazevKategorie(klic) {
  const nalezena = KATEGORIE.find((k) => k.klic === klic);
  return nalezena ? nalezena.nazev : NEZNAMA_KATEGORIE.nazev;
}

export function poradiKategorie(klic) {
  const index = KATEGORIE.findIndex((k) => k.klic === klic);
  return index === -1 ? KATEGORIE.length : index;
}

/**
 * Jednotka pro člověka.
 *
 * `count/min` znamená u tepu něco jiného než u dechu a `count` u kroků nic —
 * číslo mluví samo. Surové jednotky z HealthKitu do UI nepatří.
 */
export function jednotkaProUzivatele(metricName, unit) {
  if (unit === 'count/min') {
    return metricName === 'respiratory_rate' ? 'dech/min' : 'tep/min';
  }
  if (unit === 'count') {
    if (metricName === 'apple_stand_hour') return 'h';
    // Kroky, patra, BMI, tempa — holé číslo.
    return '';
  }
  if (unit === 'degC') return '°C';
  return unit || '';
}
