/**
 * KTERÁ METRIKA Z HODINEK MÁ VYSVĚTLIVKU.
 *
 * Dlaždice metrik se vykreslují ve smyčce podle toho, co pošle databáze, takže
 * `<Vysvetlivka pojem="…" />` u nich nemůže stát natvrdo v JSX. Otazník se
 * připojí přes tuhle mapu.
 *
 * DŮSLEDEK PRO TESTY: `src/lib/glosar.test.ts` hlídá obousměrně, že každý
 * pojem v glosáři je někde v UI zakotvený a naopak. Pojmy z téhle mapy do UI
 * vedou, i když je grep po `pojem="…"` v .tsx nenajde — test je proto čte
 * odsud. Kdo sem přidá pojem a nezobrazí ho, test to nechytí; kdo sem přidá
 * pojem, který v glosáři není, spadne.
 *
 * CO TU ZÁMĚRNĚ NENÍ: kroky, váha, vzdálenost chůze a podíl tělesného tuku.
 * Vysvětlovat „kroky jsou počet kroků" je šum. Vysvětlivka patří jen tam, kde
 * si člověk bez ní udělá chybný závěr.
 *
 * MODUL JE ČISTÝ — bez importů, kvůli `node --test` bez transpilace.
 */

/** @type {Record<string, string>} metric_name → id pojmu v glosáři */
export const POJEM_PRO_METRIKU = {
  active_energy: 'aktivni_energie',
  basal_energy_burned: 'bazalni_energie',
  apple_exercise_time: 'cas_cviceni',
  apple_stand_hour: 'hodiny_ve_stoje',
  heart_rate: 'tepova_frekvence',
  resting_heart_rate: 'klidovy_tep',
  heart_rate_variability: 'hrv',
  blood_oxygen_saturation: 'spo2',
  respiratory_rate: 'dechova_frekvence',
  body_mass_index: 'bmi',
  lean_body_mass: 'cista_telesna_hmota',
};
