/**
 * Load agent configuration from code (jedna zdrojová pravda).
 * Agenti vždy berou instrukce z kódu – assistantInstructions.js, agentPromptsForSync.js.
 * DB (ai_agents) se nepoužívá pro prompty – pouze pro volitelný enabled flag.
 */
import { supabaseServer } from './supabaseServer';
import { AGENT_PROMPTS, CONTEXT_PROFILE_SLUG, PROMPT_VERSION } from './agentPromptsForSync';
import { getModelForAgentSlug } from './openaiModels';

function resolveContextProfileSlug(agentSlug) {
  const s = String(agentSlug || 'trainer').toLowerCase().trim();
  return CONTEXT_PROFILE_SLUG[s] ?? (s === 'trainer' || s === 'coach' ? 'trainer_coach' : null);
}

/**
 * Vždy vrací konfiguraci z kódu – instrukce agentů jsou v kódu, ne v DB.
 * Default slug 'trainer' je historický; produkční generování plánu nevolá runAgent(trainer).
 */
function buildConfigFromCode(agentSlug = 'trainer') {
  const slug = String(agentSlug || 'trainer').trim().toLowerCase();
  const system_prompt = AGENT_PROMPTS[slug] || AGENT_PROMPTS.trainer || 'Jsi Body & Mind ON asistent. Piš česky a vracej pouze platný JSON.';
  const model = getModelForAgentSlug(slug);

  return {
    slug,
    name: slug,
    model,
    system_prompt,
    temperature: slug.includes('validator') ? 0.1 : 0.2,
    enabled: true,
    version: 1,
    prompt_version: PROMPT_VERSION,
    context_profile_slug: resolveContextProfileSlug(slug),
    default_output_contract: null,
    executor_group: null,
    artifact_type: null,
    is_published: true,
    prompt_source: 'code',
  };
}

export async function getAgentConfig(agentSlug) {
  if (!agentSlug || typeof agentSlug !== 'string') {
    return buildConfigFromCode('trainer');
  }

  const config = buildConfigFromCode(agentSlug);

  try {
    const { data: row } = await supabaseServer
      .from('ai_agents')
      .select('enabled')
      .eq('slug', agentSlug.trim())
      .maybeSingle();

    if (row && row.enabled === false) {
      return { ...config, enabled: false };
    }
  } catch {
    // DB chyba – používáme config z kódu, enabled zůstává true
  }

  return config;
}
