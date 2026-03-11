/**
 * Load agent configuration from Supabase (ai_agents).
 * DB is the control plane: in production, agent without valid DB config is disabled.
 * Fallbacks align with docs/AI_AGENT_GOVERNANCE.md: trainer = gpt-4.1 (hero), others = gpt-4.1-mini.
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

/** Governance-aligned fallbacks when DB row missing or load fails. Trainer = hero (gpt-4.1). */
function buildFallback(agentSlug = 'trainer', forProduction = false) {
  const slug = String(agentSlug || 'trainer').trim().toLowerCase();
  const fallbackPresets = {
    trainer: {
      model: 'gpt-4.1',
      system_prompt: 'Jsi hlavní AI planner Body & Mind ON. Zodpovědný za jídelníček a trénink. Priorita: přesnost, proveditelnost, návaznost, důvěryhodnost. Respektuj diet_type, preferences, workout_days, pinned meals, progress_analysis, shared_memory. Negeneruj volné povídání ani marketing/coach text. Vrať pouze platný JSON: ok, metrics, html.',
    },
    coach: {
      model: 'gpt-4.1-mini',
      system_prompt: 'Jsi Body & Mind ON kouč. Podporuj adherence, regeneraci, mindset. Negeneruj plán. Piš česky, vracej pouze platný JSON (message, coaching_plan).',
    },
    marketing: {
      model: 'gpt-4.1-mini',
      system_prompt: 'Jsi draft engine pro kampaně. Vytváříš návrhy, ne publikovaný obsah. Piš česky, vracej pouze platný JSON.',
    },
    social: {
      model: 'gpt-4.1-mini',
      system_prompt: 'Jsi content draft engine pro sociální sítě. Respektuj platformu. Neříkej, že jsi něco publikoval. Piš česky, vracej pouze platný JSON.',
    },
    nutrition_validator: {
      model: 'gpt-4.1-mini',
      system_prompt: 'Validátor jídelníčku. Kontroluj diet_type, restrikce. Vracej JSON: ok, errors, suggestions, corrected_html. Piš česky.',
    },
    training_validator: {
      model: 'gpt-4.1-mini',
      system_prompt: 'Validátor tréninkového plánu. Kontroluj strukturu, objem, pravidla. Vracej JSON: ok, errors, suggestions, corrected_html. Piš česky.',
    },
  };
  const preset =
    fallbackPresets[slug] || {
      model: 'gpt-4.1-mini',
      system_prompt: 'Jsi Body & Mind ON asistent. Piš česky a vracej pouze platný JSON.',
    };

  return {
    slug,
    name: slug,
    model: preset.model,
    system_prompt: preset.system_prompt,
    temperature: slug.includes('validator') ? 0.1 : 0.2,
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
  const defaultModel = slug === 'trainer' ? 'gpt-4.1' : 'gpt-4.1-mini';
  const defaultTemp = slug.includes('validator') ? 0.1 : 0.2;
  const rawPrompt = row?.system_prompt;
  const hasPrompt = rawPrompt != null && String(rawPrompt).trim() !== '';
  const system_prompt = hasPrompt ? String(rawPrompt).trim() : (buildFallback(slug, false).system_prompt || '');
  return {
    slug,
    name: row?.name ?? slug,
    model: row?.model ?? defaultModel,
    system_prompt,
    temperature: row?.temperature ?? defaultTemp,
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
