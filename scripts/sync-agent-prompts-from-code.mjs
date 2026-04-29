/**
 * Idempotentní sync system_prompt (a souvisejících sloupců) z kódu do ai_agents.
 * Aktualizuje: trainer, coach, nutrition_validator, training_validator, marketing, social.
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
import { AGENT_PROMPTS, CONTEXT_PROFILE_SLUG, PROMPT_VERSION } from '../lib/agentPromptsForSync.js';
import { getModelForAgentSlug } from '../lib/openaiModels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
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
  'marketing',
  'social',
];

const NAMES = {
  trainer: 'Body & Mind ON Trenér',
  coach: 'Body & Mind ON Kouč',
  nutrition_validator: 'Body & Mind ON Nutrition Validator',
  training_validator: 'Body & Mind ON Training Validator',
  marketing: 'Body & Mind ON Marketing',
  social: 'Body & Mind ON Social',
};

async function main() {
  const rows = SCOPE_SLUGS.map((slug) => ({
    slug,
    name: NAMES[slug] || slug,
    model: getModelForAgentSlug(slug),
    system_prompt: AGENT_PROMPTS[slug] || '',
    temperature: slug.includes('validator') ? 0.1 : 0.2,
    enabled: true,
    context_profile_slug: CONTEXT_PROFILE_SLUG[slug] || null,
    prompt_version: PROMPT_VERSION,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('ai_agents').upsert(rows, { onConflict: 'slug' });

  if (error) {
    console.error('Sync selhal:', error.message);
    process.exit(1);
  }

  console.log('Sync dokončen. Aktualizováni agenti:', SCOPE_SLUGS.join(', '), `prompt_version=${PROMPT_VERSION}`);
}

main();
