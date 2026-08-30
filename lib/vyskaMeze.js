/**
 * Meze pro výšku — sdílené mezi lib/updateHeightCm.js, lib/validation/onboardingSchema.js
 * a SPA (PreferencesModal.tsx).
 *
 * PŘÍČINA 31. 8. 2026 (docs/DALSI_KROK.md 6.5): `api/profile-settings.js` bral
 * 100–250 cm, `api/profile-body-data.js` 120–230 cm. Dva různé endpointy,
 * dvě různé hlášky podle toho, kudy uživatel prošel. Vzor podle lib/vahaMeze.js.
 *
 * MODUL JE ČISTÝ — bez importů, aby šel spustit i node --test bez transpilace.
 */

export const MIN_VYSKA_CM = 100;
export const MAX_VYSKA_CM = 250;

/** Hláška musí sedět s tou, kterou vrací api/profile-settings.js a api/profile-body-data.js. */
export const CHYBA_VYSKY = `Výška musí být mezi ${MIN_VYSKA_CM} a ${MAX_VYSKA_CM} cm.`;

/**
 * @param {unknown} hodnota
 * @returns {{ ok: true, cm: number } | { ok: false, chyba: string }}
 */
export function overVysku(hodnota) {
  const cm = typeof hodnota === 'string' ? Number(hodnota.replace(',', '.')) : Number(hodnota);
  if (!Number.isFinite(cm) || cm < MIN_VYSKA_CM || cm > MAX_VYSKA_CM) {
    return { ok: false, chyba: CHYBA_VYSKY };
  }
  return { ok: true, cm };
}
