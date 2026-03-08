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

function buildFallback(agentSlug = 'trainer') {
  const slug = String(agentSlug || 'trainer').trim().toLowerCase();
  const preset = FALLBACK_BY_SLUG[slug] || FALLBACK_BY_SLUG.default;
  return {
    slug,
    model: preset.model,
    system_prompt: preset.system_prompt,
    temperature: 0.2,
    enabled: true,
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
      .eq('enabled', true)
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
    };
  } catch (err) {
    return buildFallback(agentSlug);
  }
}
