/**
 * lib/registration/bodyMetricsRegistration.js
 * Parsování a persist registrace — odděleno od sync plan orchestrace v API route.
 */

import { supabaseServer } from '../supabaseServer';
import {
  PROGRAMS,
  validateHeightCm,
  validateWeightKg,
  validateAge,
  validatePassword,
} from '../registrationRules';
import { createAuthUserIfNew } from '../authHelpers';
import { trainingEnvironmentNotesSuffix } from '../trainingEnvironment.js';
import { validateBirthDate } from '../bodyMetricsBirthDate.js';
import { calculateNutritionTargets } from '../nutritionTargets.js';
import { parseSmartScalePreference } from '../smartScalePreference.js';
import {
  devicesToSmartScaleMetadata,
  normalizeDevices,
} from '../registrationDevices.js';
import {
  normalizeOccupation,
  normalizeActivity,
  normalizeStress,
  normalizeGoal,
  normalizeFrequency,
  getWeeklySessions,
} from '../preferenceConstants';

export function toRegistrationNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeRegistrationGender(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'male' || t === 'female') return t;
  if (t.includes('muž') || t === 'm') return 'male';
  if (t.includes('žena') || t === 'f') return 'female';
  return null;
}

/**
 * @param {object} b — req.body
 * @returns {{ ok: true, payload: object, password: string, birthDateRaw: string, smartScaleBody: object } | { ok: false, status: number, error: string }}
 */
export function parseAndValidateRegistrationBody(b = {}) {
  const dietType = b.diet_type?.trim() || null;
  const dietaryRestrictions = b.dietary_restrictions?.trim() || null;
  const foodsToAvoid = b.foods_to_avoid?.trim() || null;
  const dietLabels = {
    vegetarian: 'Vegetarián',
    vegan: 'Vegan',
    gluten_free: 'Bez lepku',
    lactose_free: 'Bez laktózy',
    paleo: 'Paleo',
    low_carb: 'Nízkosacharidová',
    other: 'Jiné',
  };
  const dietLabel = dietType && dietLabels[dietType] ? dietLabels[dietType] : '';
  const notesParts = [];
  if (dietLabel) notesParts.push('Typ stravy: ' + dietLabel);
  if (dietaryRestrictions) notesParts.push('Co nejí: ' + dietaryRestrictions);
  if (foodsToAvoid) notesParts.push('Potraviny k vynechání: ' + foodsToAvoid);
  const trainingEnvironment = ['gym', 'home_bodyweight', 'home_equipment', 'other'].includes(String(b.training_environment || '').trim())
    ? String(b.training_environment).trim()
    : null;
  const availableEquipment = trainingEnvironment === 'home_equipment' && Array.isArray(b.available_equipment)
    ? b.available_equipment.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const trainingEnvironmentDetail = trainingEnvironment === 'other'
    ? String(b.training_environment_detail || '').trim().slice(0, 280)
    : '';
  if (trainingEnvironment === 'other' && !trainingEnvironmentDetail) {
    return { ok: false, status: 400, error: 'Napiš, kde a s čím budeš cvičit.' };
  }
  if (trainingEnvironment) {
    notesParts.push(trainingEnvironmentNotesSuffix(trainingEnvironment, availableEquipment, trainingEnvironmentDetail || null));
  }
  const notesFinal = notesParts.length ? notesParts.join('. ') : (b.notes?.trim() || null);

  const wd = b.workout_days;
  const workoutDaysStr = Array.isArray(wd) && wd.length > 0
    ? wd.filter((n) => Number.isFinite(Number(n)) && n >= 0 && n <= 6).join(',')
    : null;
  const birthDateRaw = typeof b.birth_date === 'string' ? b.birth_date.trim() : '';
  let calculatedAge = null;
  if (birthDateRaw) {
    const birthValidation = validateBirthDate(birthDateRaw);
    if (!birthValidation.valid) {
      return { ok: false, status: 400, error: birthValidation.error || 'Neplatné datum narození.' };
    }
    calculatedAge = birthValidation.age;
  } else if (b.age != null && b.age !== '') {
    const ageFallback = toRegistrationNum(b.age);
    const ageCheck = validateAge(ageFallback);
    if (!ageCheck.valid) return { ok: false, status: 400, error: ageCheck.error };
    calculatedAge = ageFallback;
  }

  const devices = normalizeDevices(b.devices);

  const payload = {
    email: b.email?.trim()?.toLowerCase() || null,
    name: b.name?.trim() || null,
    gender: normalizeRegistrationGender(b.gender),
    age: calculatedAge,
    birth_date: birthDateRaw || null,
    height_cm: toRegistrationNum(b.height || b.height_cm),
    weight_kg: toRegistrationNum(b.weight || b.weight_kg),
    activity: normalizeActivity(b.activity),
    stress_level: normalizeStress(b.stress || b.stress_level),
    occupation: normalizeOccupation(b.worktype || b.occupation),
    goal: normalizeGoal(b.goal),
    freq_choice: normalizeFrequency(b.frequency || b.freq_choice),
    weekly_sessions_user: getWeeklySessions(b.frequency || b.freq_choice),
    workout_days: workoutDaysStr,
    diet_type: dietType || null,
    dietary_restrictions: dietaryRestrictions || null,
    foods_to_avoid: foodsToAvoid || null,
    notes: notesFinal,
    program: PROGRAMS.includes(b.program) ? b.program : 'START',
    created_at: new Date().toISOString(),
    user_id: null,
    training_environment: trainingEnvironment,
    available_equipment: availableEquipment,
    devices,
  };

  const nutritionTargets = calculateNutritionTargets({
    bodyMetrics: payload,
    goal: payload.goal,
    activity: payload.activity,
    workoutDays: payload.workout_days ? String(payload.workout_days).split(',') : null,
    planAdjustmentSignal: null,
  });
  payload.calories_target = nutritionTargets.calories_target;

  if (!payload.email) {
    return { ok: false, status: 400, error: 'E-mail je povinný.' };
  }
  const password = typeof b.password === 'string' ? b.password.trim() : '';
  const passwordValidation = validatePassword(password);
  if (password && !passwordValidation.valid) {
    return { ok: false, status: 400, error: passwordValidation.error || 'Heslo musí mít alespoň 6 znaků.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(payload.email)) {
    return { ok: false, status: 400, error: 'Zadej platnou e-mailovou adresu.' };
  }
  if (!payload.height_cm || !payload.weight_kg) {
    return { ok: false, status: 400, error: 'Chybí výška nebo váha.' };
  }
  const heightCheck = validateHeightCm(payload.height_cm);
  if (!heightCheck.valid) return { ok: false, status: 400, error: heightCheck.error };
  const weightCheck = validateWeightKg(payload.weight_kg);
  if (!weightCheck.valid) return { ok: false, status: 400, error: weightCheck.error };
  if (payload.age == null) {
    return { ok: false, status: 400, error: 'Datum narození je povinné.' };
  }

  return {
    ok: true,
    payload,
    password,
    birthDateRaw,
    smartScaleBody: b,
  };
}

/**
 * @param {object} payload
 * @returns {Promise<{ userId: string|null, loginPassword: string|null, existingAccount: boolean, userChosePassword: boolean, authError: string|null, createdNewUser: boolean }>}
 */
export async function createRegistrationAuthUser(payload, password) {
  const authResult = await createAuthUserIfNew(payload.email, payload.name, password || undefined);
  if (authResult.error) {
    if (authResult.existing === true) {
      return {
        authError: 'existing_account',
        userId: null,
        loginPassword: null,
        existingAccount: true,
        userChosePassword: false,
        createdNewUser: false,
      };
    }
    const isAlready = authResult.error.toLowerCase().includes('already')
      || authResult.error.toLowerCase().includes('registered');
    if (isAlready) {
      return {
        authError: 'existing_account',
        userId: null,
        loginPassword: null,
        existingAccount: true,
        userChosePassword: false,
        createdNewUser: false,
      };
    }
    return {
      authError: authResult.error,
      userId: null,
      loginPassword: null,
      existingAccount: false,
      userChosePassword: false,
      createdNewUser: false,
    };
  }
  return {
    authError: null,
    userId: authResult.userId,
    loginPassword: authResult.password ?? null,
    existingAccount: authResult.existing === true,
    userChosePassword: authResult.userChosePassword === true,
    createdNewUser: authResult.existing !== true,
  };
}

/**
 * @param {object} payload — musí mít user_id
 * @param {{ birthDateRaw?: string, smartScaleBody?: object, name?: string }} meta
 */
export async function applyRegistrationUserMetadata(payload, meta = {}) {
  if (!payload?.user_id || meta.existingAccount === true) return;
  try {
    const { data: freshUser } = await supabaseServer.auth.admin.getUserById(payload.user_id);
    const currentMeta = freshUser?.user?.user_metadata || {};
    const body = meta.smartScaleBody || {};
    const devicesMeta = normalizeDevices(payload.devices ?? body.devices);
    const smartScaleMeta = devicesMeta
      ? devicesToSmartScaleMetadata(devicesMeta)
      : parseSmartScalePreference(body);
    await supabaseServer.auth.admin.updateUserById(payload.user_id, {
      user_metadata: {
        ...currentMeta,
        ...smartScaleMeta,
        ...(meta.birthDateRaw ? { birth_date: meta.birthDateRaw } : {}),
        ...(payload.name ? { name: currentMeta.name || payload.name } : {}),
      },
    });
  } catch (metaErr) {
    console.warn('[body-metrics] registration user_metadata update failed:', metaErr?.message);
  }
}

/**
 * @param {object} payload
 * @returns {Promise<{ bodyMetricsId: string|null, error: string|null }>}
 */
export async function persistBodyMetricsRow(payload) {
  let insertPayload = { ...payload };
  delete insertPayload.training_environment;
  delete insertPayload.available_equipment;

  let insertedRows = null;
  let dbErr = null;
  ({ data: insertedRows, error: dbErr } = await supabaseServer
    .from('body_metrics')
    .insert([insertPayload])
    .select('id'));

  if (dbErr && /birth_date|does not exist|column/i.test(dbErr.message || '')) {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.birth_date;
    ({ data: insertedRows, error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([fallbackPayload])
      .select('id'));
  }

  if (dbErr && /devices|does not exist|column/i.test(dbErr.message || '')) {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.devices;
    ({ data: insertedRows, error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([fallbackPayload])
      .select('id'));
  }

  if (dbErr) {
    return { bodyMetricsId: null, error: dbErr.message };
  }

  // Best-effort mirror into legacy registrations table (interest only).
  // Only after auth user exists — never leave orphan interest rows without an account.
  if (payload.user_id) {
    const { error: regErr } = await supabaseServer.from('registrations').insert([{
      name: payload.name || null,
      email: payload.email,
      gender: payload.gender || null,
      age: payload.age != null ? String(payload.age) : null,
      height: payload.height_cm != null ? String(payload.height_cm) : null,
      weight: payload.weight_kg != null ? String(payload.weight_kg) : null,
      activity: payload.activity || null,
      stress: payload.stress_level || null,
      worktype: payload.occupation || null,
      goal: payload.goal || null,
      frequency: payload.freq_choice || null,
      notes: payload.notes || null,
      program: payload.program || 'START',
      devices: payload.devices ?? null,
    }]);
    if (regErr) {
      console.warn('[body-metrics] registrations insert skipped:', regErr.message);
    }
  }

  return { bodyMetricsId: insertedRows?.[0]?.id ?? null, error: null };
}

/**
 * Sestaví JSON odpověď registrace (stejný tvar jako dosud).
 * @param {object} ctx
 */
export function buildRegistrationApiResponse(ctx) {
  const {
    accountCreated,
    plan_state,
    planSent,
    planPending,
    message,
    initialPlanTaskStatus,
    initialPlanSummary,
    initialPlanValidationWarning,
    initialPlanTaskId,
    initialPlanTaskCreatedAt,
    initialPlanTaskCompletedAt,
    finalResponseReason,
    onboardingResult,
    savedPlanId,
    savedPlanExists,
    generationSource,
    trainerResult,
    lastResortRan,
    lastResortFailed,
    lastResortError,
  } = ctx;

  const response = {
    ok: accountCreated && (plan_state === 'ready' || plan_state === 'processing'),
    planSent,
    planPending,
    plan_state,
    loginUnavailable: !accountCreated,
    message,
  };

  if (accountCreated) {
    response.hasUserId = true;
    response.initialPlanTaskStatus = initialPlanTaskStatus;
    response.initialPlanSummary = initialPlanSummary ?? undefined;
    response.initialPlanValidationWarning = initialPlanValidationWarning ?? undefined;
    response._diagnostics = {
      task_created: accountCreated,
      initial_plan_task_status: initialPlanTaskStatus ?? undefined,
      initial_plan_task_id: initialPlanTaskId ?? undefined,
      initial_plan_task_created_at: initialPlanTaskCreatedAt ?? undefined,
      initial_plan_task_completed_at: initialPlanTaskCompletedAt ?? undefined,
      plan_state,
      plan_sent: planSent,
      plan_pending: planPending,
      final_response_reason: finalResponseReason,
      onboarding_result: onboardingResult,
      saved_plan_id: savedPlanId ?? undefined,
      saved_plan_exists: savedPlanExists ?? undefined,
      generation_source: generationSource ?? undefined,
      trainer_task_created: !!initialPlanTaskId,
      trainer_task_completed: initialPlanTaskStatus === 'completed',
      trainer_task_failed: initialPlanTaskStatus === 'failed',
      trainer_generation_source: trainerResult?.generation_source ?? trainerResult?.final_publish_source ?? undefined,
      trainer_output_exists: !!(trainerResult?.plan_id),
      email_error: trainerResult?.email_error ?? undefined,
      email_sent: planSent,
      plan_saved: savedPlanExists,
      plan_saved_id: savedPlanId ?? undefined,
      last_resort_ran: lastResortRan,
      last_resort_failed: lastResortFailed,
      last_resort_error: lastResortError ?? undefined,
      required_modules: trainerResult?.required_modules ?? ['nutrition', 'training', 'habits'],
      completed_modules: trainerResult?.completed_modules ?? undefined,
      plan_scope: trainerResult?.plan_scope ?? 'initial_7_day_trial',
      missing_modules: trainerResult?.missing_modules ?? undefined,
    };
  } else {
    response.hasUserId = false;
  }

  return response;
}
