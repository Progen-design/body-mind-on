#!/usr/bin/env node
/**
 * Vygeneruje 10 anonymních plánů pro manuální QA (bez persist, bez PII).
 *   npm run audit:plan-quality-samples
 *
 * Výstup: audits/plan-quality-samples/
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { register } from 'node:module';
import { loadLocalEnv, sanitizeOutput } from './audit-utils.mjs';

register('./plan-quality-import-hook.mjs', import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'audits', 'plan-quality-samples');

loadLocalEnv();

/** @type {Array<{ id: string, label: string, bm: object }>} */
const PROFILES = [
  {
    id: '01-zena-redukce-doma',
    label: 'Žena, redukce, doma bez vybavení',
    bm: {
      gender: 'female', age: 34, height_cm: 168, weight_kg: 72, goal: 'redukce',
      activity: 'light', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '3-4', workout_days: '1,3,5', training_environment: 'home_bodyweight',
      available_equipment: [], diet_type: 'standard', meals_per_day: 3,
    },
  },
  {
    id: '02-muz-nabirani-gym',
    label: 'Muž, nabírání, gym',
    bm: {
      gender: 'male', age: 28, height_cm: 185, weight_kg: 78, goal: 'nabirani_svaly',
      activity: 'high', stress: 'low', worktype: 'active', program: 'START',
      freq_choice: '4-5', workout_days: '1,2,4,5', training_environment: 'gym',
      available_equipment: [], diet_type: 'standard', meals_per_day: 4,
    },
  },
  {
    id: '03-zacatecnik-2x',
    label: 'Začátečník, 2× týdně',
    bm: {
      gender: 'male', age: 42, height_cm: 176, weight_kg: 88, goal: 'udrzovani',
      activity: 'low', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '1-2', workout_days: '2,5', training_environment: 'home_bodyweight',
      available_equipment: [], diet_type: 'standard', meals_per_day: 3,
    },
  },
  {
    id: '04-pokrocily-4x',
    label: 'Pokročilý, 4× týdně',
    bm: {
      gender: 'male', age: 31, height_cm: 180, weight_kg: 82, goal: 'nabirani_svaly',
      activity: 'high', stress: 'low', worktype: 'active', program: 'ON_CLUB',
      freq_choice: '4-5', workout_days: '1,2,4,5', training_environment: 'gym',
      available_equipment: [], diet_type: 'standard', meals_per_day: 4,
    },
  },
  {
    id: '05-vegetarian',
    label: 'Vegetarián',
    bm: {
      gender: 'female', age: 29, height_cm: 165, weight_kg: 60, goal: 'udrzovani',
      activity: 'moderate', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '3-4', workout_days: '1,3,5', training_environment: 'home_equipment',
      available_equipment: ['resistance_bands', 'dumbbells'], diet_type: 'vegetarian', meals_per_day: 3,
    },
  },
  {
    id: '06-bez-laktozy',
    label: 'Bez laktózy',
    bm: {
      gender: 'female', age: 36, height_cm: 170, weight_kg: 65, goal: 'redukce',
      activity: 'moderate', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '3-4', workout_days: '1,3,5', training_environment: 'gym',
      available_equipment: [], diet_type: 'standard', meals_per_day: 3,
      dietary_restrictions: 'bez laktózy', foods_to_avoid: 'mléko, sýr, tvaroh',
    },
  },
  {
    id: '07-vysoky-stres',
    label: 'Vysoký stres',
    bm: {
      gender: 'male', age: 39, height_cm: 178, weight_kg: 90, goal: 'redukce',
      activity: 'low', stress: 'high', worktype: 'sedentary', program: 'START',
      freq_choice: '2-3', workout_days: '2,4,6', training_environment: 'home_bodyweight',
      available_equipment: [], diet_type: 'standard', meals_per_day: 3,
    },
  },
  {
    id: '08-sedava-prace',
    label: 'Sedavá práce',
    bm: {
      gender: 'female', age: 33, height_cm: 162, weight_kg: 58, goal: 'udrzovani',
      activity: 'low', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '3-4', workout_days: '1,3,5', training_environment: 'home_equipment',
      available_equipment: ['dumbbells'], diet_type: 'standard', meals_per_day: 3,
    },
  },
  {
    id: '09-starsi-50plus',
    label: 'Starší uživatel 50+',
    bm: {
      gender: 'male', age: 56, height_cm: 174, weight_kg: 86, goal: 'udrzovani',
      activity: 'light', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '2-3', workout_days: '2,4', training_environment: 'home_bodyweight',
      available_equipment: [], diet_type: 'standard', meals_per_day: 3,
    },
  },
  {
    id: '10-koleno-bezpecnost',
    label: 'Omezení: bolí mě koleno',
    bm: {
      gender: 'female', age: 45, height_cm: 167, weight_kg: 70, goal: 'udrzovani',
      activity: 'light', stress: 'medium', worktype: 'sedentary', program: 'START',
      freq_choice: '2-3', workout_days: '2,5', training_environment: 'home_bodyweight',
      available_equipment: [], diet_type: 'standard', meals_per_day: 3,
      health_notes: 'bolí mě koleno — bez skoků a hlubokých dřepů',
      injuries: 'koleno',
    },
  },
];

function summarizePlan(structured) {
  const days = structured?.days || [];
  const targets = structured?.targets || {};
  const daySummaries = days.slice(0, 7).map((d) => {
    const meals = (d.meals || []).map((m) => ({
      type: m.type,
      name: m.display_name_cs || m.name,
      kcal: m.kcal,
      source: m.catalog_source || m.verification_source || null,
    }));
    const exercises = (d.workout?.exercises || []).map((e) => ({
      name: e.name || e.display_name_cs,
      sets: e.sets,
      reps: e.reps,
      canonical_key: e.canonical_key,
    }));
    return {
      day: d.day_name || d.date,
      daily_kcal: d.daily_kcal ?? d.total_kcal,
      meals,
      workout_minutes: d.workout?.duration_minutes,
      exercises,
    };
  });
  return { targets, days: daySummaries };
}

function buildChecklistMd(profile, technical) {
  return `# QA checklist — ${profile.label}

**Profil ID:** \`${profile.id}\` (syntetický, bez PII)

## Technické náznaky (auto)
${technical.map((t) => `- ${t}`).join('\n')}

## Hodnocení trenéra / výživáře (vyplnit ručně)

| Otázka | Ano/Ne/Poznámka |
|--------|-----------------|
| Je plán pochopitelný? | |
| Je bezpečný? | |
| Odpovídá cíli? | |
| Odpovídá vybavení / prostředí? | |
| Je jídelníček realistický? | |
| Jsou kalorie a makra rozumné? | |
| Co by uživatel nepochopil? | |

**Celkové skóre (1–5):** ___

---
`;
}

function technicalHints(structured, profile) {
  const hints = [];
  const days = structured?.days || [];
  const targetKcal = Number(structured?.targets?.calories_per_day);
  for (const d of days) {
    const sum = (d.meals || []).reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    const dayKcal = Number(d.daily_kcal ?? d.total_kcal ?? sum);
    if (targetKcal > 0 && dayKcal > 0) {
      const delta = Math.abs(dayKcal - targetKcal) / targetKcal;
      if (delta > 0.05) hints.push(`Den ${d.day_name || d.date}: kcal odchylka ${(delta * 100).toFixed(1)} %`);
    }
    for (const e of d.workout?.exercises || []) {
      const sets = Number(e.sets);
      if (sets > 4) hints.push(`Cvík ${e.name}: sets=${sets} (>4)`);
    }
  }
  if (profile.bm.health_notes) {
    hints.push('Profil obsahuje zdravotní poznámku — ověřit bezpečnost cviků ručně.');
  }
  if (!hints.length) hints.push('Žádné automatické varování z heuristik.');
  return hints;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { runUnifiedPlanPipeline } = await import('../lib/unifiedPlanPipeline.js');

  const summary = {
    profiles: [],
    generated_at: new Date().toISOString(),
    note: 'Syntetické profily, bez persist do DB, bez PII.',
  };

  for (const profile of PROFILES) {
    process.stdout.write(`Generating ${profile.id}…\n`);
    const pipeline = await runUnifiedPlanPipeline({
      bm: { ...profile.bm, name: 'Anonymní profil' },
      useOpenAI: false,
    });

    if (!pipeline?.ok || !pipeline?.planJson) {
      summary.profiles.push({ id: profile.id, ok: false, error: pipeline?.error || 'pipeline failed' });
      continue;
    }

    const structured = pipeline.planJson;
    const technical = technicalHints(structured, profile);
    const payload = {
      profile_id: profile.id,
      profile_label: profile.label,
      input_summary: {
        goal: profile.bm.goal,
        training_environment: profile.bm.training_environment,
        diet_type: profile.bm.diet_type,
        freq_choice: profile.bm.freq_choice,
        has_health_notes: Boolean(profile.bm.health_notes || profile.bm.injuries),
      },
      plan_summary: summarizePlan(structured),
      technical_hints: technical,
    };

    const jsonPath = join(OUT_DIR, `${profile.id}.json`);
    const mdPath = join(OUT_DIR, `${profile.id}-checklist.md`);
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    writeFileSync(mdPath, buildChecklistMd(profile, technical), 'utf8');

    summary.profiles.push({
      id: profile.id,
      ok: true,
      days: structured?.days?.length ?? 0,
      technical_warnings: technical.filter((t) => !t.startsWith('Žádné')).length,
    });
  }

  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(sanitizeOutput(JSON.stringify(summary, null, 2)));
}

main().catch((err) => {
  console.error('FAIL', sanitizeOutput(err?.message || String(err)));
  process.exit(1);
});
