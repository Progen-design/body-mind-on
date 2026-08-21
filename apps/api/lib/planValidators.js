/**
 * lib/planValidators.js
 * Nutrition and training validators – run as part of plan pipeline.
 * Returns structured result: htmlToPublish, nutritionOk, trainingOk, validationWarning.
 * Used by taskExecutors and (optionally) aiOrchestrator.
 */
import { validatePublishedPlanHtml } from './validatePlanHtml';
import { getAgentConfig } from './getAgentConfig';
import { getTaskSchemaHintAsync } from './aiTaskRegistry';
import { runAgent } from './runAgent';

function toJsonObject(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return null;
  const trimmed = rawContent.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Run nutrition_validator and training_validator on plan HTML.
 * HARD FAIL: validator returns ok === false (diet conflict, unpublishable, broken structure).
 * SOFT FAIL: validator returns ok === false with quality suggestions (repetitive, weak).
 * @param {string} planHtml
 * @param {object} bm - body_metrics
 * @param {string|null} userId
 * @returns {Promise<{
 *   nutritionOk: boolean,
 *   trainingOk: boolean,
 *   htmlToPublish: string,
 *   validationWarning: string|null,
 *   originalValidation: object,
 *   correctedValidation: object,
 *   validatorReplacementApplied: boolean,
 *   validatorReplacementReason: string|null,
 *   nutritionErrors: string[],
 *   trainingErrors: string[],
 * }>}
 */
export async function runPlanValidators(planHtml, bm, userId) {
  const originalHtml = planHtml || '';
  let htmlToPublish = originalHtml;
  const originalValidation = validatePublishedPlanHtml(originalHtml);
  let nutritionOk = true;
  let trainingOk = true;
  const nutritionErrors = [];
  const trainingErrors = [];

  const [nutConfig, trainConfig] = await Promise.all([
    getAgentConfig('nutrition_validator'),
    getAgentConfig('training_validator'),
  ]);

  if (nutConfig.enabled && planHtml) {
    try {
      const schemaHint = await getTaskSchemaHintAsync('nutrition_validator', 'validate_plan');
      const result = await runAgent('nutrition_validator', {
        userId: userId ?? null,
        input: {
          plan_html: planHtml,
          body_metrics: bm
            ? {
                diet_type: bm.diet_type,
                dietary_restrictions: bm.dietary_restrictions,
                foods_to_avoid: bm.foods_to_avoid,
              }
            : null,
          task_contract: schemaHint,
          task_type: 'validate_plan',
        },
        taskType: 'validate_plan',
      });
      const parsed = result.parsedContent || toJsonObject(result.rawContent) || {};
      nutritionOk = parsed.ok === true;
      if (!nutritionOk && Array.isArray(parsed.errors)) {
        nutritionErrors.push(...parsed.errors.map((e) => String(e)));
      }
      if (parsed.corrected_html && typeof parsed.corrected_html === 'string') {
        const correctedValid = validatePublishedPlanHtml(parsed.corrected_html);
        const originalValid = validatePublishedPlanHtml(htmlToPublish || '');
        const mayReplace =
          correctedValid.ok &&
          (!originalValid.ok || (originalValid.ok && correctedValid.length > originalValid.length));
        if (mayReplace) htmlToPublish = parsed.corrected_html;
      }
    } catch (e) {
      nutritionOk = false;
      nutritionErrors.push(e?.message || 'Validator error');
    }
  }

  if (trainConfig.enabled && planHtml) {
    try {
      const schemaHint = await getTaskSchemaHintAsync('training_validator', 'validate_plan');
      const result = await runAgent('training_validator', {
        userId: userId ?? null,
        input: {
          plan_html: htmlToPublish,
          body_metrics: bm ? { goal: bm.goal, workout_days: bm.workout_days } : null,
          task_contract: schemaHint,
          task_type: 'validate_plan',
        },
        taskType: 'validate_plan',
      });
      const parsed = result.parsedContent || toJsonObject(result.rawContent) || {};
      trainingOk = parsed.ok === true;
      if (!trainingOk && Array.isArray(parsed.errors)) {
        trainingErrors.push(...parsed.errors.map((e) => String(e)));
      }
      if (parsed.corrected_html && typeof parsed.corrected_html === 'string') {
        const correctedValid = validatePublishedPlanHtml(parsed.corrected_html);
        const originalValid = validatePublishedPlanHtml(htmlToPublish || '');
        const mayReplace =
          correctedValid.ok &&
          (!originalValid.ok || (originalValid.ok && correctedValid.length > originalValid.length));
        if (mayReplace) htmlToPublish = parsed.corrected_html;
      }
    } catch (e) {
      trainingOk = false;
      trainingErrors.push(e?.message || 'Validator error');
    }
  }

  const errors = [
    ...nutritionErrors.map((e) => `[nutrition] ${e}`),
    ...trainingErrors.map((e) => `[training] ${e}`),
  ];
  const validationWarning =
    (!nutritionOk || !trainingOk) && (nutConfig.enabled || trainConfig.enabled)
      ? errors.length
        ? errors.join('; ')
        : 'Validation did not pass'
      : null;

  const correctedValidation = validatePublishedPlanHtml(htmlToPublish);
  const validatorReplacementApplied = htmlToPublish !== originalHtml;
  let validatorReplacementReason = null;
  if (validatorReplacementApplied) {
    if (!originalValidation.ok && correctedValidation.ok)
      validatorReplacementReason = 'corrected_valid_origin_invalid';
    else if (
      originalValidation.ok &&
      correctedValidation.ok &&
      correctedValidation.length > originalValidation.length
    )
      validatorReplacementReason = 'both_valid_corrected_longer';
    else validatorReplacementReason = 'corrected_applied';
  } else {
    if (!nutritionOk || !trainingOk) validatorReplacementReason = 'no_corrected_html';
    else if (originalValidation.ok && correctedValidation.ok)
      validatorReplacementReason = 'no_replacement_origin_preferred';
    else if (!correctedValidation.ok && originalValidation.ok)
      validatorReplacementReason = 'no_replacement_corrected_invalid_kept_origin';
    else validatorReplacementReason = 'no_replacement';
  }

  return {
    nutritionOk,
    trainingOk,
    htmlToPublish,
    validationWarning,
    originalValidation,
    correctedValidation,
    validatorReplacementApplied,
    validatorReplacementReason,
    nutritionErrors,
    trainingErrors,
  };
}
