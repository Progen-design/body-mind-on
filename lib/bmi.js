/**
 * BMI. Modul bez závislostí.
 *
 * Vyčleněno z `lib/withingsProfileImport.js`, protože ten importuje
 * `supabaseServer.js` a `lib/telesneSlozeni.js` ho proto naimportovat nesmí —
 * musí zůstat spustitelný v holém `node --test` bez env proměnných
 * (viz komentář nahoře v tom souboru). `lib/withingsProfileImport.js` odsud
 * `calculateBmi` zpětně re-exportuje, ať zůstane jediná implementace.
 */
export function calculateBmi(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm);
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null;
  const meters = height / 100;
  return Math.round((weight / (meters * meters)) * 10) / 10;
}
