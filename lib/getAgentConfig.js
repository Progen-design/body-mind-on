/**
 * Load agent configuration from Supabase (ai_agents).
 * Used by runAgent() so model, system_prompt, and temperature are dynamic per agent.
 * Add new agents in ai_agents table; no code change in this loader needed.
 */
import { supabaseServer } from './supabaseServer';

const FALLBACK_BY_SLUG = {
  trainer: {
    model: 'gpt-4.1',
    system_prompt:
      'Jsi Body & Mind ON – AI trenér výživy, tréninku a suplementace. Piš česky a vracej pouze JSON.',
  },
  coach: {
    model: 'gpt-4.1-mini',
    system_prompt:
      'Jsi Body & Mind ON – AI kouč. Podporuj návyky, adherenci a motivaci. Piš česky a vracej pouze JSON.',
  },
  marketing: {
    model: 'gpt-4.1-mini',
    system_prompt:
      'Jsi Body & Mind ON – AI marketing specialista. Piš česky, prakticky a vracej pouze JSON.',
  },
  social: {
    model: 'gpt-4.1-mini',
    system_prompt:
      'Jsi Body & Mind ON – AI social media specialista. Piš česky a vracej pouze JSON.',
  },
  default: {
    model: 'gpt-4.1-mini',
    system_prompt: 'Jsi Body & Mind ON AI asistent. Piš česky a vracej pouze JSON.',
  },
};

/**
 * Fallback config when DB row missing or error.
 * enabled: true so agents work when ai_agents table/row doesn't exist yet.
 * Pro striktní DB-only: spusť migraci ai_agents a nastav enabled: false.
 */
function buildFallback(agentSlug = 'trainer') {
  const slug = String(agentSlug || 'trainer').trim().toLowerCase();
  const preset = FALLBACK_BY_SLUG[slug] || FALLBACK_BY_SLUG.default;
  return {
    slug,
    model: preset.model,
    system_prompt: preset.system_prompt,
    temperature: 0.2,
    enabled: true,
    version: 1,
    prompt_version: 1,
  };
}

export async function getAgentConfig(agentSlug) {
  if (!agentSlug || typeof agentSlug !== 'string') {
    return buildFallback('trainer');
  }

  try {
    const { data, error } = await supabaseServer
      .from('ai_agents')
      .select('slug, name, model, system_prompt, temperature, enabled')
      .eq('slug', agentSlug.trim())
      .maybeSingle();

    if (error || !data) {
      return buildFallback(agentSlug);
    }

    return {
      slug: data.slug ?? String(agentSlug).trim().toLowerCase(),
      name: data.name ?? agentSlug,
      model: data.model ?? buildFallback(agentSlug).model,
      system_prompt: data.system_prompt ?? buildFallback(agentSlug).system_prompt,
      temperature: data.temperature ?? 0.2,
      enabled: data.enabled !== false,
      version: 1,
      prompt_version: 1,
    };
  } catch (err) {
    return buildFallback(agentSlug);
  }
}
