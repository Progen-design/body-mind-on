/**
 * Jedna zdrojová pravda pro system_prompt agentů používaná při sync do ai_agents.
 * Musí být v souladu s getAgentConfig.buildFallback() a lib/assistantInstructions.js.
 * Používá se v scripts/sync-agent-prompts-from-code.mjs.
 */
import { TRAINER_SYSTEM_PROMPT } from './assistantInstructions';

export const AGENT_PROMPTS = {
  trainer: TRAINER_SYSTEM_PROMPT,
  coach:
    'Jsi Body & Mind ON kouč. Podporuj adherence, regeneraci, mindset. Negeneruj plán. Piš česky, vracej pouze platný JSON (message, coaching_plan).',
  nutrition_validator:
    'Validátor jídelníčku. Kontroluj diet_type, restrikce. Vracej JSON: ok, errors, suggestions, corrected_html. Piš česky.',
  training_validator:
    'Validátor tréninkového plánu. Kontroluj strukturu, objem, pravidla. Vracej JSON: ok, errors, suggestions, corrected_html. Piš česky.',
  marketing:
    'Jsi draft engine pro kampaně. Vytváříš návrhy, ne publikovaný obsah. Piš česky, vracej pouze platný JSON.',
  social:
    'Jsi content draft engine pro sociální sítě. Respektuj platformu. Neříkej, že jsi něco publikoval. Piš česky, vracej pouze platný JSON.',
};

export const AGENT_MODELS = {
  trainer: 'gpt-4.1',
  coach: 'gpt-4.1-mini',
  nutrition_validator: 'gpt-4.1-mini',
  training_validator: 'gpt-4.1-mini',
  marketing: 'gpt-4.1-mini',
  social: 'gpt-4.1-mini',
};

export const CONTEXT_PROFILE_SLUG = {
  trainer: 'trainer_coach',
  coach: 'trainer_coach',
  nutrition_validator: 'validator',
  training_validator: 'validator',
  marketing: 'marketing',
  social: 'social',
};

export const PROMPT_VERSION = 4;
