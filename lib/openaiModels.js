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
