// Hodnoty musi presne odpovidat tomu, co ceka POST /api/body-metrics.
// Popisky pro cloveka, value pro API. Nemenit bez zmeny na API a v generatoru.
import type { Volba } from './prvky';
// Autorita pro seznam diet je server. Explicitní `.js` schválně — lib/ je
// čisté JS bez transpilace a bez přípony by ho Vite ani node --test nenašly.
import { DIET_OPTIONS } from '../../../lib/dietOptions.js';

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
 * Popisky, kde se formulář schválně liší od autority.
 *
 * `other` má pod výběrem volný text, na který popisek odkazuje. Jinde by
 * „Jiné (popiš níže)" nedávalo smysl, proto se to neřeší v `lib/`.
 */
const POPISKY_FORMULARE: Readonly<Record<string, string>> = {
  other: 'Jiné (popiš níže)'
};

/**
 * Nabídka diet. ODVOZENÁ z `lib/dietOptions.js`, ne psaná znovu.
 *
 * PROČ. Tenhle seznam tu byl ručně a o `enabled` nevěděl. Shodoval se
 * s autoritou náhodou. Jakmile by se na serveru dieta vypnula, registrace by
 * ji dál nabízela a `dietTypeRejectionReason` by ji odmítl až při odeslání —
 * tedy po vyplnění všech pěti kroků, s chybou na konci formuláře.
 *
 * Vypnuté diety (dnes vegan a paleo — katalog na ně nemá dost receptů)
 * z nabídky vypadnou samy. Zapnout je stačí na jednom místě.
 *
 * Prázdná volba je navíc: „žádná preference" není dieta, `isDietTypeSupported`
 * ji propouští jako prázdnou hodnotu.
 */
export const DIETA: readonly Volba[] = [
  { value: '', label: 'Žádná preference' },
  ...DIET_OPTIONS.filter((o) => o.enabled).map((o) => ({
    value: o.value,
    label: POPISKY_FORMULARE[o.value] ?? o.label
  }))
];

export const CHYTRA_VAHA: readonly Volba[] = [
  { value: 'none', label: 'Zatím nemám' },
  { value: 'withings', label: 'Withings' },
  { value: 'other', label: 'Jinou značku' }
];

export const KROKY = ['Účet', 'Tělo', 'Trénink', 'Strava', 'Návyky'] as const;
