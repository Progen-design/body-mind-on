#!/usr/bin/env node
/**
 * Ověření sdílených AI instruction standardů.
 *   node scripts/verify-ai-instruction-standards.mjs
 */
import {
  BM_ON_CORE_AI_PRINCIPLES,
  BM_ON_SIMPLE_NUTRITION_RULES,
  BM_ON_TRAINING_RULES,
  BM_ON_HABIT_RULES,
  BM_ON_COACH_TONE,
  BM_ON_OUTPUT_SAFETY_RULES,
  BM_ON_GPT_START_MEAL_GUARD,
  BM_ON_PLAN_ENHANCEMENT_RULES,
  BM_ON_MARKETING_SAFETY_RULES,
  BM_ON_FORBIDDEN_START_MEALS,
  BM_ON_ALLOWED_START_MEALS,
} from '../lib/aiInstructionBlocks.js';
import { AGENT_PROMPTS, PROMPT_VERSION } from '../lib/agentPromptsForSync.js';
import { TRAINER_SYSTEM_PROMPT } from '../lib/assistantInstructions.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const orchestratorSrc = readFileSync(join(root, 'lib/services/planOrchestrator.js'), 'utf8');
const enhancementSrc = readFileSync(join(root, 'lib/services/planEnhancementAsync.js'), 'utf8');

function lineEndorsesForbiddenClaim(text, claim) {
  for (const line of text.split('\n')) {
    if (!line.includes(claim)) continue;
    if (/žádné|nepoužívej|neprohlašuj|nereáln|nepřijatel|ne motivační|ne:/i.test(line)) continue;
    if (/typu „|ne „|bez „/i.test(line)) continue;
    return true;
  }
  return false;
}

let failed = 0;
function ok(msg) {
  console.log(`OK ${msg}`);
}
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}

const FORBIDDEN_CLAIMS = [
  'zaručeně zhubneš',
  'změň svůj život hned',
  'jídelníček jako restaurace',
];

console.log('--- PROMPT_VERSION ---');
if (PROMPT_VERSION === 9) ok('PROMPT_VERSION = 9');
else fail(`PROMPT_VERSION = ${PROMPT_VERSION} (expected 9)`);

console.log('\n--- Shared instruction blocks ---');
const requiredExports = {
  BM_ON_CORE_AI_PRINCIPLES,
  BM_ON_SIMPLE_NUTRITION_RULES,
  BM_ON_TRAINING_RULES,
  BM_ON_HABIT_RULES,
  BM_ON_COACH_TONE,
  BM_ON_OUTPUT_SAFETY_RULES,
  BM_ON_GPT_START_MEAL_GUARD,
  BM_ON_PLAN_ENHANCEMENT_RULES,
  BM_ON_MARKETING_SAFETY_RULES,
  BM_ON_FORBIDDEN_START_MEALS,
  BM_ON_ALLOWED_START_MEALS,
};
for (const [name, val] of Object.entries(requiredExports)) {
  if (typeof val === 'string' && val.length > 40) ok(`export ${name}`);
  else fail(`export ${name} missing or too short`);
}

console.log('\n--- Coach prompt ---');
const coach = AGENT_PROMPTS.coach || '';
if (/první malý krok|první krok/i.test(coach)) ok('coach: první malý krok');
else fail('coach: missing první malý krok');
if (/diagnóz|medicínsk/i.test(coach) && /Žádné medicínské diagnózy/i.test(coach)) ok('coach: bez diagnóz');
else if (/Žádné medicínské diagnósy/i.test(coach)) ok('coach: bez diagnóz');
else fail('coach: missing diagnóza guard');
if (/JSON objekt|pouze JSON/i.test(coach)) ok('coach: JSON výstup');
else fail('coach: missing JSON contract');
if (/dokonalost/i.test(coach)) ok('coach: normalizace dokonalosti');
else fail('coach: missing dokonalost guard');
if (/Negeneruj HTML plán|Negeneruj nový jídelníček|ne generuj nový jídelníček/i.test(coach)) ok('coach: ne generuje plán');
else fail('coach: missing plan boundary');

console.log('\n--- Simple nutrition rules ---');
if (/Jednoduchost > originalita/i.test(BM_ON_SIMPLE_NUTRITION_RULES)) ok('nutrition: jednoduchost > originalita');
else fail('nutrition: missing jednoduchost > originalita');
if (/food blog|food-blog/i.test(BM_ON_SIMPLE_NUTRITION_RULES)) ok('nutrition: no food blog');
else fail('nutrition: missing food blog ban');
if (/burrito/i.test(BM_ON_FORBIDDEN_START_MEALS)) ok('nutrition: forbidden burrito');
else fail('nutrition: missing forbidden meals');

console.log('\n--- Trainer legacy prompt ---');
if (/SimpleMealPlannerAgent/i.test(TRAINER_SYSTEM_PROMPT)) ok('trainer: SimpleMealPlannerAgent note');
else fail('trainer: missing SimpleMealPlannerAgent note');
if (/Jednoduchost > originalita|BM_ON_SIMPLE|food-blog/i.test(TRAINER_SYSTEM_PROMPT)) ok('trainer: simple nutrition aligned');
else fail('trainer: missing simple nutrition');
if (/POUZE platný JSON|pouze platný JSON/i.test(TRAINER_SYSTEM_PROMPT)) ok('trainer: JSON contract');
else fail('trainer: missing JSON contract');
if (/burrito|frittata|lasagne/i.test(TRAINER_SYSTEM_PROMPT)) ok('trainer: forbidden START meals listed');
else fail('trainer: missing forbidden meals');

console.log('\n--- Plan orchestrator ---');
if (orchestratorSrc.includes('BM_ON_SIMPLE_NUTRITION_RULES')) ok('orchestrator: uses BM_ON_SIMPLE_NUTRITION_RULES');
else fail('orchestrator: missing BM_ON_SIMPLE_NUTRITION_RULES');
if (orchestratorSrc.includes('BM_ON_GPT_START_MEAL_GUARD')) ok('orchestrator: simpleStartMode guard');
else fail('orchestrator: missing BM_ON_GPT_START_MEAL_GUARD');

console.log('\n--- Plan enhancement ---');
if (enhancementSrc.includes('BM_ON_PLAN_ENHANCEMENT_RULES')) ok('enhancement: uses shared rules');
else fail('enhancement: missing BM_ON_PLAN_ENHANCEMENT_RULES');
if (/nesmí přepsat jednoduchá jídla|Enhancement nesmí přepsat/i.test(enhancementSrc)) ok('enhancement: blocks complex rewrite');
else fail('enhancement: missing rewrite guard');

console.log('\n--- Marketing / social ---');
for (const claim of FORBIDDEN_CLAIMS) {
  const mBad = lineEndorsesForbiddenClaim(AGENT_PROMPTS.marketing || '', claim);
  const sBad = lineEndorsesForbiddenClaim(AGENT_PROMPTS.social || '', claim);
  if (mBad || sBad) fail(`marketing/social endorses forbidden claim: ${claim}`);
  else ok(`marketing/social does not endorse: ${claim}`);
}
if (/draft|schválení|nepublikoval/i.test(AGENT_PROMPTS.marketing || '')) ok('marketing: draft safety');
else fail('marketing: missing draft safety');
if (/zaručeně|fiktivní/i.test(AGENT_PROMPTS.social || '')) ok('social: no unrealistic promises');
else fail('social: missing promise guard');

console.log('\n--- Global forbidden claims scan ---');
const allPrompts = [
  coach,
  TRAINER_SYSTEM_PROMPT,
  AGENT_PROMPTS.nutrition_validator,
  AGENT_PROMPTS.training_validator,
  AGENT_PROMPTS.marketing,
  AGENT_PROMPTS.social,
  orchestratorSrc,
  enhancementSrc,
].join('\n');
for (const claim of FORBIDDEN_CLAIMS) {
  if (lineEndorsesForbiddenClaim(allPrompts, claim)) fail(`prompt endorses forbidden claim: ${claim}`);
  else ok(`no endorsement: ${claim}`);
}

console.log('\n--- START default food-blog ban ---');
const startDefaultBad = ['burrito jako', 'kari jako default', 'frittata jako'];
for (const bad of startDefaultBad) {
  if (allPrompts.toLowerCase().includes(bad)) fail(`found problematic phrase: ${bad}`);
}
ok('no explicit START default for burrito/kari/frittata phrases');

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
