/**
 * Load agent configuration from Supabase (ai_agents).
 * DB is the control plane: in production, agent without valid DB config is disabled.
 * The loader prefers the full governance schema, but gracefully falls back to the
 * minimal schema while migrations are rolling out.
 */
import { supabaseServer } from './supabaseServer';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function resolveContextProfileSlug(agentSlug) {
  const s = String(agentSlug || '').toLowerCase().trim();
  if (s === 'trainer' || s === 'coach') return 'trainer_coach';
  if (s === 'marketing') return 'marketing';
  if (s === 'social') return 'social';
  if (s === 'nutrition_validator' || s === 'training_validator') return 'validator';
  return null;
}

function buildFallback(agentSlug = 'trainer', forProduction = false) {
  const slug = String(agentSlug || 'trainer').trim().toLowerCase();
  const fallbackPresets = {
    trainer: { model: 'gpt-4.1', system_prompt: 'Jsi Body & Mind ON - AI trener. Pis cesky a vracej pouze JSON.' },
    coach: { model: 'gpt-4.1-mini', system_prompt: 'Jsi Body & Mind ON - AI kouc. Pis cesky a vracej pouze JSON.' },
    marketing: { model: 'gpt-4.1-mini', system_prompt: 'Jsi Body & Mind ON - AI marketing. Pis cesky a vracej pouze JSON.' },
    social: { model: 'gpt-4.1-mini', system_prompt: 'Jsi Body & Mind ON - AI social. Pis cesky a vracej pouze JSON.' },
    nutrition_validator: { model: 'gpt-4.1-mini', system_prompt: 'Validator jidelnicku. Vrat JSON s ok, errors, suggestions.' },
    training_validator: { model: 'gpt-4.1-mini', system_prompt: 'Validator treningoveho planu. Vrat JSON s ok, errors, suggestions.' },
  };
  const preset =
    fallbackPresets[slug] || {
      model: 'gpt-4.1-mini',
      system_prompt: 'Jsi Body & Mind ON AI asistent. Pis cesky a vracej pouze JSON.',
    };

  return {
    slug,
    name: slug,
    model: preset.model,
    system_prompt: preset.system_prompt,
    temperature: 0.2,
    enabled: !forProduction,
    version: 1,
    prompt_version: 1,
    context_profile_slug: resolveContextProfileSlug(slug),
    default_output_contract: null,
    executor_group: null,
    artifact_type: null,
    is_published: true,
  };
}

function normalizeAgentConfig(agentSlug, row) {
  const slug = row?.slug ?? String(agentSlug || 'trainer').trim().toLowerCase();
  return {
    slug,
    name: row?.name ?? slug,
    model: row?.model ?? 'gpt-4.1-mini',
    system_prompt: row?.system_prompt ?? '',
    temperature: row?.temperature ?? 0.2,
    enabled: row?.enabled !== false,
    version: row?.version ?? 1,
    prompt_version: row?.prompt_version ?? 1,
    context_profile_slug: row?.context_profile_slug ?? resolveContextProfileSlug(slug),
    default_output_contract: row?.default_output_contract ?? null,
    executor_group: row?.executor_group ?? null,
    artifact_type: row?.artifact_type ?? null,
    is_published: row?.is_published !== false,
  };
}

async function loadExtendedConfig(agentSlug) {
  return supabaseServer
    .from('ai_agents')
    .select('slug, name, model, system_prompt, temperature, enabled, version, prompt_version, context_profile_slug, default_output_contract, executor_group, artifact_type, is_published')
    .eq('slug', agentSlug.trim())
    .maybeSingle();
}

async function loadBasicConfig(agentSlug) {
  return supabaseServer
    .from('ai_agents')
    .select('slug, name, model, system_prompt, temperature, enabled')
    .eq('slug', agentSlug.trim())
    .maybeSingle();
}

export async function getAgentConfig(agentSlug) {
  if (!agentSlug || typeof agentSlug !== 'string') {
    return IS_PRODUCTION ? buildFallback('trainer', true) : buildFallback('trainer', false);
  }

  try {
    let result = await loadExtendedConfig(agentSlug);

    if (result.error && /version|prompt_version|context_profile_slug|default_output_contract|executor_group|artifact_type|is_published|does not exist|neexistuje/i.test(result.error.message || '')) {
      result = await loadBasicConfig(agentSlug);
    }

    if (result.error || !result.data) {
      return IS_PRODUCTION ? buildFallback(agentSlug, true) : buildFallback(agentSlug, false);
    }

    return normalizeAgentConfig(agentSlug, result.data);
  } catch {
    return IS_PRODUCTION ? buildFallback(agentSlug, true) : buildFallback(agentSlug, false);
  }
}
