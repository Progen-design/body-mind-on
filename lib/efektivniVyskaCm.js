// lib/efektivniVyskaCm.js
//
// Která výška je „ta pravá" pro api/profile.js: body_metrics (zdroj pravdy,
// lib/updateHeightCm.js) má přednost, metadata jsou jen fallback.
//
// Do 31. 8. 2026 to bylo obráceně (meta.height_cm mělo přednost). Zápis do
// metadat je v lib/updateHeightCm.js záměrně best-effort zrcadlo — může
// selhat, aniž by selhal request — takže se metadata mohla kdykoli rozejít
// s body_metrics. PreferencesModal pak nezměněnou (ale rozjetou) hodnotu
// vůbec neodeslal, protože ji srovnával se stejným rozjetým zrcadlem, ne se
// zdrojem pravdy. Viz docs/DALSI_KROK.md 6.7(b).
//
// MODUL JE ČISTÝ, aby šel testovat bez DB — stejný vzor jako lib/vyskaMeze.js.

/**
 * @param {{ height_cm?: unknown }|null|undefined} latestBodyMetrics — nejnovější řádek body_metrics
 * @param {{ height_cm?: unknown }|null|undefined} metadata — user_metadata (zrcadlo)
 * @returns {number|null}
 */
export function efektivniVyskaCm(latestBodyMetrics, metadata) {
  const zBodyMetrics = latestBodyMetrics?.height_cm;
  if (zBodyMetrics != null) return Number(zBodyMetrics);
  const zMetadat = metadata?.height_cm;
  return zMetadat != null ? Number(zMetadat) : null;
}
