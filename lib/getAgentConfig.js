/**
 * Load agent configuration from Supabase (ai_agents).
 * Used by runAgent() so model, system_prompt, and temperature are dynamic per agent.
 * Add new agents in ai_agents table; no code change in this loader needed.
 */
import { supabaseServer } from './supabaseServer';

const FALLBACK = {
  slug: 'trainer',
  model: 'gpt-4.1',
  system_prompt:
    'Jsi Body & Mind ON – AI trenér výživy, tréninku a suplementace. Piš česky a vracej pouze JSON.',
  temperature: 0.2,
  enabled: true,
};

export async function getAgentConfig(agentSlug) {
  if (!agentSlug || typeof agentSlug !== 'string') {
    return FALLBACK;
  }

  try {
    const { data, error } = await supabaseServer
      .from('ai_agents')
      .select('slug, name, model, system_prompt, temperature, enabled')
      .eq('slug', agentSlug.trim())
      .eq('enabled', true)
      .maybeSingle();

    if (error || !data) {
      return FALLBACK;
    }

    return {
      slug: data.slug ?? FALLBACK.slug,
      name: data.name ?? agentSlug,
      model: data.model ?? FALLBACK.model,
      system_prompt: data.system_prompt ?? FALLBACK.system_prompt,
      temperature: data.temperature ?? FALLBACK.temperature,
      enabled: data.enabled !== false,
    };
  } catch (err) {
    return FALLBACK;
  }
}
