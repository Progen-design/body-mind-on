/**
 * Idempotentní sync system_prompt (a souvisejících sloupců) z kódu do ai_agents.
 * Aktualizuje pouze: trainer, coach, nutrition_validator, training_validator.
 * Ostatní agenty nepřepisuje.
 *
 * Použití:
 *   node scripts/sync-agent-prompts-from-code.mjs
 *
 * Vyžaduje: .env s SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) a SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Vyextrahuje TRAINER_SYSTEM_PROMPT z lib/assistantInstructions.js (jedna zdrojová pravda). */
function extractTrainerPrompt() {
  const path = join(root, 'lib', 'assistantInstructions.js');
  const content = readFileSync(path, 'utf8');
  const start = 'export const TRAINER_SYSTEM_PROMPT = `';
  const i = content.indexOf(start);
  if (i === -1) throw new Error('TRAINER_SYSTEM_PROMPT not found in assistantInstructions.js');
  let end = i + start.length;
  while (end < content.length) {
    if (content[end] === '`' && content[end - 1] !== '\\') break;
    end++;
  }
  return content.slice(i + start.length, end);
}

const PROMPT_VERSION = 4;
const AGENT_PROMPTS = {
  trainer: null, // filled from file below
  coach:
    'Jsi Body & Mind ON kouč. Podporuj adherence, regeneraci, mindset. Negeneruj plán. Piš česky, vracej pouze platný JSON (message, coaching_plan).',
  nutrition_validator:
    'Validátor jídelníčku. Kontroluj diet_type, restrikce. Vracej JSON: ok, errors, suggestions, corrected_html. Piš česky.',
  training_validator:
    'Validátor tréninkového plánu. Kontroluj strukturu, objem, pravidla. Vracej JSON: ok, errors, suggestions, corrected_html. Piš česky.',
};
const AGENT_MODELS = {
  trainer: 'gpt-4.1',
  coach: 'gpt-4.1-mini',
  nutrition_validator: 'gpt-4.1-mini',
  training_validator: 'gpt-4.1-mini',
};
const CONTEXT_PROFILE_SLUG = {
  trainer: 'trainer_coach',
  coach: 'trainer_coach',
  nutrition_validator: 'validator',
  training_validator: 'validator',
};

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Chybí SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) nebo SUPABASE_SERVICE_ROLE_KEY v .env'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const SCOPE_SLUGS = [
  'trainer',
  'coach',
  'nutrition_validator',
  'training_validator',
];

const NAMES = {
  trainer: 'Body & Mind ON Trenér',
  coach: 'Body & Mind ON Kouč',
  nutrition_validator: 'Body & Mind ON Nutrition Validator',
  training_validator: 'Body & Mind ON Training Validator',
};

async function main() {
  AGENT_PROMPTS.trainer = extractTrainerPrompt();

  const rows = SCOPE_SLUGS.map((slug) => ({
    slug,
    name: NAMES[slug] || slug,
    model: AGENT_MODELS[slug] || 'gpt-4.1-mini',
    system_prompt: AGENT_PROMPTS[slug] || '',
    temperature: slug.includes('validator') ? 0.1 : 0.2,
    enabled: true,
    context_profile_slug: CONTEXT_PROFILE_SLUG[slug] || null,
    prompt_version: PROMPT_VERSION,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('ai_agents')
    .upsert(rows, { onConflict: 'slug' });

  if (error) {
    console.error('Sync selhal:', error.message);
    process.exit(1);
  }

  console.log(
    'Sync dokončen. Aktualizováni agenti:',
    SCOPE_SLUGS.join(', ')
  );
  console.log('prompt_version:', PROMPT_VERSION);
}

main();
