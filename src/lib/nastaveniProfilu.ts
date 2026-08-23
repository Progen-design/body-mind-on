// Rozdeleni zmen z nastaveni profilu mezi dva endpointy.
//
// /api/profile-preferences meni body_metrics a user_habits a PREGENERUJE PLAN
// vcetne e-mailu. /api/profile-settings uklada cilovou vahu a vysku do
// profiles a plan nechava byt. Poslat vsechno na prvni endpoint nejde — ta
// dve pole nepřijímá — a poslat prazdne telo znamena zbytecnou regeneraci.
import type { NastaveniProfilu } from '../data/adaptery';

/** Vychozi prazdny stav, nez dorazi profil ze serveru. */
export const PRAZDNE_NASTAVENI: NastaveniProfilu = {
  goal: '',
  activity: '',
  stress_level: '',
  occupation: '',
  frequency: '',
  workout_days: [],
  diet_type: '',
  dietary_restrictions: '',
  foods_to_avoid: '',
  training_environment: '',
  available_equipment: [],
  training_environment_detail: '',
  selected_habits: [],
  goal_weight_kg: '',
  height_cm: ''
};

/** Pole, ktera bere /api/profile-settings (profiles). */
const POLE_NASTAVENI = ['goal_weight_kg', 'height_cm'] as const;

export interface RozdeleneZmeny {
  /** Telo pro /api/profile-preferences; null = neni co menit. */
  preference: Record<string, unknown> | null;
  /** Telo pro /api/profile-settings; null = neni co menit. */
  nastaveni: Record<string, unknown> | null;
}

function cislo(v: unknown): number | null {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Rozdělí změny podle toho, kam patří.
 *
 * `selected_habits` se posílá JEN když se opravdu změnily. Endpoint na nich
 * dělá DELETE all + INSERT a když INSERT selže, uživatel o návyky přijde —
 * server to jen zaloguje a vrátí 200. Neposlat klíč vůbec ten blok přeskočí
 * (`if (Array.isArray(b.selected_habits))`), takže neměněné návyky se ani
 * nemažou, ani neriskují.
 */
export function rozdelZmenyNastaveni(zmeny: Partial<NastaveniProfilu>): RozdeleneZmeny {
  const preference: Record<string, unknown> = {};
  const nastaveni: Record<string, unknown> = {};

  for (const [klic, hodnota] of Object.entries(zmeny)) {
    if ((POLE_NASTAVENI as readonly string[]).includes(klic)) {
      const n = cislo(hodnota);
      // Prazdne pole neznamena "vynuluj" — takovou zmenu neposilame.
      if (n !== null) nastaveni[klic] = n;
      continue;
    }

    if (klic === 'frequency') {
      // Endpoint zna freq_choice; frequency je jen alias, posilame kanonicky nazev.
      preference.freq_choice = hodnota;
      continue;
    }

    preference[klic] = hodnota;
  }

  return {
    preference: Object.keys(preference).length > 0 ? preference : null,
    nastaveni: Object.keys(nastaveni).length > 0 ? nastaveni : null
  };
}
