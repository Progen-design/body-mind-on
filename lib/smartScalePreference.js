/**
 * Preference chytré váhy — user_metadata: wants_body_tracking, smart_scale_provider.
 */

export const SMART_SCALE_CHOICE_NONE = 'none';
export const SMART_SCALE_CHOICE_WITHINGS = 'withings';
export const SMART_SCALE_CHOICE_OTHER = 'other';

export const SMART_SCALE_CHOICES = [
  { value: SMART_SCALE_CHOICE_NONE, label: 'Ne' },
  { value: SMART_SCALE_CHOICE_WITHINGS, label: 'Ano, Withings' },
  { value: SMART_SCALE_CHOICE_OTHER, label: 'Ano, jinou' },
];

export const SMART_SCALE_SETTINGS_CHOICES = [
  { value: SMART_SCALE_CHOICE_NONE, label: 'Nepoužívám chytrou váhu' },
  { value: SMART_SCALE_CHOICE_WITHINGS, label: 'Používám Withings' },
  { value: SMART_SCALE_CHOICE_OTHER, label: 'Používám jinou chytrou váhu' },
];

/**
 * @param {unknown} raw — smart_scale_choice z formuláře
 * @returns {'none'|'withings'|'other'}
 */
export function normalizeSmartScaleChoice(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'withings' || v === 'yes_withings' || v === 'ano_withings') return SMART_SCALE_CHOICE_WITHINGS;
  if (v === 'other' || v === 'yes_other' || v === 'ano_jinou' || v === 'jinou') return SMART_SCALE_CHOICE_OTHER;
  return SMART_SCALE_CHOICE_NONE;
}

/**
 * @param {'none'|'withings'|'other'} choice
 * @returns {{ wants_body_tracking: boolean, smart_scale_provider: string|null }}
 */
export function smartScaleChoiceToMetadata(choice) {
  const normalized = normalizeSmartScaleChoice(choice);
  if (normalized === SMART_SCALE_CHOICE_WITHINGS) {
    return { wants_body_tracking: true, smart_scale_provider: 'withings' };
  }
  if (normalized === SMART_SCALE_CHOICE_OTHER) {
    return { wants_body_tracking: true, smart_scale_provider: 'other' };
  }
  return { wants_body_tracking: false, smart_scale_provider: null };
}

/**
 * @param {object} [meta] — user_metadata nebo user objekt z profilu
 * @returns {'none'|'withings'|'other'}
 */
export function metadataToSmartScaleChoice(meta) {
  if (!meta || typeof meta !== 'object') return SMART_SCALE_CHOICE_NONE;
  if (meta.smart_scale_provider === 'withings') return SMART_SCALE_CHOICE_WITHINGS;
  if (meta.smart_scale_provider === 'other') return SMART_SCALE_CHOICE_OTHER;
  if (meta.wants_body_tracking === true) return SMART_SCALE_CHOICE_OTHER;
  return SMART_SCALE_CHOICE_NONE;
}

/**
 * @param {object} body — request body (registrace / settings)
 * @returns {{ wants_body_tracking: boolean, smart_scale_provider: string|null }}
 */
export function parseSmartScalePreference(body) {
  if (body?.wants_body_tracking !== undefined || body?.smart_scale_provider !== undefined) {
    const wants = body.wants_body_tracking === true;
    const providerRaw = body.smart_scale_provider;
    const provider =
      providerRaw === 'withings' || providerRaw === 'other' ? providerRaw : null;
    if (!wants) return { wants_body_tracking: false, smart_scale_provider: null };
    return {
      wants_body_tracking: true,
      smart_scale_provider: provider,
    };
  }
  const choice = body?.smart_scale_choice ?? body?.smart_scale ?? SMART_SCALE_CHOICE_NONE;
  return smartScaleChoiceToMetadata(choice);
}
