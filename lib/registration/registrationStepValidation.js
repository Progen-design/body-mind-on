/**
 * Per-step registration field validation (START / ON Club / VIP).
 * Errors belong on the step where the field is entered — never deferred to final submit.
 */

import { validateBirthDate } from '../bodyMetricsBirthDate.js';
import {
  validateHeightCm,
  validateWeightKg,
  validatePassword,
} from '../registrationRules.js';

export const REQUIRED_FIELD_MESSAGE_CS = 'Toto pole je povinné.';
export const EMAIL_FORMAT_MESSAGE_CS = 'Zadej platnou e-mailovou adresu.';
export const PASSWORDS_MISMATCH_MESSAGE_CS = 'Hesla se neshodují.';

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email) {
  return EMAIL_FORMAT_RE.test(String(email || '').trim());
}

/**
 * @param {object} formData
 * @returns {Record<string, string>}
 */
export function getStep1FieldErrors(formData) {
  const errors = {};
  if (!String(formData?.name || '').trim()) {
    errors.name = REQUIRED_FIELD_MESSAGE_CS;
  }
  const email = String(formData?.email || '').trim();
  if (!email) {
    errors.email = REQUIRED_FIELD_MESSAGE_CS;
  } else if (!isValidEmailFormat(email)) {
    errors.email = EMAIL_FORMAT_MESSAGE_CS;
  }
  const passwordCheck = validatePassword(formData?.password);
  if (!passwordCheck.valid) {
    errors.password = passwordCheck.error;
  }
  if (!String(formData?.passwordConfirm || '')) {
    errors.passwordConfirm = REQUIRED_FIELD_MESSAGE_CS;
  } else if (String(formData.password || '') !== String(formData.passwordConfirm || '')) {
    errors.passwordConfirm = PASSWORDS_MISMATCH_MESSAGE_CS;
  }
  return errors;
}

/**
 * @param {object} formData
 * @returns {Record<string, string>}
 */
export function getStep2FieldErrors(formData) {
  const errors = {};
  if (!formData?.gender) {
    errors.gender = REQUIRED_FIELD_MESSAGE_CS;
  }
  const birthCheck = validateBirthDate(formData?.birth_date);
  if (!birthCheck.valid) {
    errors.birth_date = birthCheck.error;
  }
  if (formData?.height === '' || formData?.height == null) {
    errors.height = REQUIRED_FIELD_MESSAGE_CS;
  } else {
    const heightCheck = validateHeightCm(formData.height);
    if (!heightCheck.valid) errors.height = heightCheck.error;
  }
  if (formData?.weight === '' || formData?.weight == null) {
    errors.weight = REQUIRED_FIELD_MESSAGE_CS;
  } else {
    const weightCheck = validateWeightKg(formData.weight);
    if (!weightCheck.valid) errors.weight = weightCheck.error;
  }
  return errors;
}

/**
 * Validate a single step-2 field on blur (skip empty → no spam until leave/continue).
 * @param {string} name
 * @param {unknown} value
 * @returns {string|null} error message or null
 */
export function getStep2FieldBlurError(name, value) {
  if (name === 'gender') {
    if (!value) return REQUIRED_FIELD_MESSAGE_CS;
    return null;
  }
  if (name === 'birth_date') {
    if (!String(value || '').trim()) return null;
    const birthCheck = validateBirthDate(value);
    return birthCheck.valid ? null : birthCheck.error;
  }
  if (name === 'height') {
    if (value === '' || value == null) return null;
    const heightCheck = validateHeightCm(value);
    return heightCheck.valid ? null : heightCheck.error;
  }
  if (name === 'weight') {
    if (value === '' || value == null) return null;
    const weightCheck = validateWeightKg(value);
    return weightCheck.valid ? null : weightCheck.error;
  }
  return null;
}

/**
 * @param {object} formData
 * @param {Record<string, string>} [fieldErrors] — e.g. email taken from async check
 */
export function canProceedStep1(formData, fieldErrors = {}) {
  if (fieldErrors.email) return false;
  return Object.keys(getStep1FieldErrors(formData)).length === 0;
}

export function canProceedStep2(formData) {
  return Object.keys(getStep2FieldErrors(formData)).length === 0;
}
