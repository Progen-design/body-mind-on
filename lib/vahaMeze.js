/**
 * Meze pro rychlý zápis váhy — sdílené mezi api/quick-weight.js a SPA.
 *
 * Dřív žily jen v handleru, takže klient poslal cokoli a hranici zjistil až
 * z odpovědi 400. Validace na obou stranách musí říkat totéž, jinak uživatel
 * dostane jinou hlášku podle toho, kde ho co zastaví.
 *
 * POZOR: /api/body-measurements má jiný rozsah (20–400 kg, viz
 * lib/progressIntegrity.js). Jsou to dva různé endpointy s vlastní historií;
 * sjednotit je je samostatné rozhodnutí, ne vedlejší efekt téhle konstanty.
 *
 * MODUL JE ČISTÝ — bez importů, aby šel spustit i node --test bez transpilace.
 */

export const MIN_VAHA_KG = 30;
export const MAX_VAHA_KG = 300;

/** Hláška musí sedět s tou, kterou vrací api/quick-weight.js. */
export const CHYBA_VAHY = `Váha musí být mezi ${MIN_VAHA_KG} a ${MAX_VAHA_KG} kg.`;

/**
 * @param {unknown} hodnota
 * @returns {{ ok: true, kg: number } | { ok: false, chyba: string }}
 */
export function overVahu(hodnota) {
  const kg = typeof hodnota === 'string' ? Number(hodnota.replace(',', '.')) : Number(hodnota);
  if (!Number.isFinite(kg) || kg < MIN_VAHA_KG || kg > MAX_VAHA_KG) {
    return { ok: false, chyba: CHYBA_VAHY };
  }
  return { ok: true, kg };
}
