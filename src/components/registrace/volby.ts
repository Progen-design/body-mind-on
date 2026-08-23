// Hodnoty musi presne odpovidat tomu, co ceka POST /api/body-metrics.
// Popisky pro cloveka, value pro API. Nemenit bez zmeny na API a v generatoru.
import type { Volba } from './prvky';

export const POHLAVI: readonly Volba[] = [
  { value: 'male', label: 'Muž' },
  { value: 'female', label: 'Žena' }
];

export const AKTIVITA: readonly Volba[] = [
  { value: 'sedavy', label: 'Nízká' },
  { value: 'stredne', label: 'Střední' },
  { value: 'velmi', label: 'Vysoká' }
];

export const STRES: readonly Volba[] = [
  { value: 'low', label: 'Nízká' },
  { value: 'medium', label: 'Střední' },
  { value: 'high', label: 'Vysoká' }
];

export const TYP_PRACE: readonly Volba[] = [
  { value: 'office_it', label: 'Sedavé zaměstnání' },
  { value: 'manual', label: 'Aktivní zaměstnání' },
  { value: 'teacher_sales', label: 'Kombinované' }
];

export const CIL: readonly Volba[] = [
  { value: 'redukce', label: 'Redukce hmotnosti' },
  { value: 'nabirani_svaly', label: 'Nárůst svalů' },
  { value: 'udrzovani', label: 'Zdravý životní styl' }
];

export const FREKVENCE: readonly Volba[] = [
  { value: '1-2x týdně', label: '1–2× týdně' },
  { value: '2-3x týdně', label: '2–3× týdně' },
  { value: '4-5x týdně', label: '4–5× týdně' }
];

export const DNY: readonly { hodnota: number; label: string }[] = [
  { hodnota: 1, label: 'Po' },
  { hodnota: 2, label: 'Út' },
  { hodnota: 3, label: 'St' },
  { hodnota: 4, label: 'Čt' },
  { hodnota: 5, label: 'Pá' },
  { hodnota: 6, label: 'So' },
  { hodnota: 0, label: 'Ne' }
];

/**
 * Vegan a paleo jsou v registraci vypnute zamerne - katalog na ne zatim nema
 * dost receptu a plan by se opakoval. Zapnout az bude 7+ receptu na slot.
 */
export const DIETA: readonly Volba[] = [
  { value: '', label: 'Žádná preference' },
  { value: 'vegetarian', label: 'Vegetarián' },
  { value: 'gluten_free', label: 'Bez lepku' },
  { value: 'lactose_free', label: 'Bez laktózy' },
  { value: 'low_carb', label: 'Nízkosacharidová' },
  { value: 'other', label: 'Jiné (popiš níže)' }
];

export const CHYTRA_VAHA: readonly Volba[] = [
  { value: 'none', label: 'Zatím nemám' },
  { value: 'withings', label: 'Withings' },
  { value: 'other', label: 'Jinou značku' }
];

export const KROKY = ['Účet', 'Tělo', 'Trénink', 'Strava', 'Návyky'] as const;
