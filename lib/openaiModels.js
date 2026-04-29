/**
 * Centrální názvy modelů OpenAI (bez nových závislostí).
 * Ceny / výběr se řídí env, výchozí jsou levné modely vhodné k dané úloze.
 */

export const DEFAULT_CHEAP_CHAT_MODEL = 'gpt-4o-mini';

/** Model pro strukturovaný týdenní plán (Chat Completions + json_object). */
export function getOpenAiPlanModel() {
  const m = String(process.env.OPENAI_PLAN_MODEL || DEFAULT_CHEAP_CHAT_MODEL).trim();
  return m || DEFAULT_CHEAP_CHAT_MODEL;
}

/**
 * Výchozí model pro runAgent (Responses API, json_object).
 * Jednotlivé role lze přebít env bez změny kódu.
 */
export function getOpenAiDefaultAgentModel() {
  const m = String(process.env.OPENAI_AGENT_MODEL || DEFAULT_CHEAP_CHAT_MODEL).trim();
  return m || DEFAULT_CHEAP_CHAT_MODEL;
}

/**
 * Model podle slug agenta — používá getAgentConfig / runAgent.
 * @param {string} agentSlug
 */
export function getModelForAgentSlug(agentSlug) {
  const slug = String(agentSlug || '')
    .trim()
    .toLowerCase();
  const base = getOpenAiDefaultAgentModel();
  const coach = String(process.env.OPENAI_COACH_MODEL || base).trim() || base;
  const trainerResponses = String(process.env.OPENAI_TRAINER_RESPONSES_MODEL || base).trim() || base;

  const map = {
    trainer: trainerResponses,
    coach,
    nutrition_validator: base,
    training_validator: base,
    marketing: base,
    social: base,
  };
  return map[slug] || base;
}
