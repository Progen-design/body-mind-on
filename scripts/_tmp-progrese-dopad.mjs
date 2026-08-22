/**
 * Co udělá příští týden se zapsaným tréninkem. Volá TYTÉŽ funkce, které
 * používá generátor plánu (lib/workoutStartProgram.js:332).
 */
import { loadLocalEnv } from './audit-utils.mjs';
loadLocalEnv();
const { createClient } = await import('@supabase/supabase-js');
const { pickPreviousPerExercise } = await import('../lib/workoutProgressionStore.js');
const { nextPrescription, prescriptionMet } = await import('../lib/workoutProgression.js');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const USER = 'fd99a26c-9123-4599-977a-2c89298858cb';

const { data: rows } = await db
  .from('start_workout_progression')
  .select('*')
  .eq('user_id', USER)
  .order('performed_on', { ascending: false });

const previousByKey = pickPreviousPerExercise(rows || []);

console.log('CVIK                PŘEDCHOZÍ TÝDEN                  →  PŘÍŠTÍ TÝDEN');
console.log('─'.repeat(96));
for (const [key, prev] of Object.entries(previousByKey)) {
  const baseline = {
    canonical_key: key,
    target_sets: prev.target_sets,
    target_reps_min: prev.target_reps_min,
    target_reps_max: prev.target_reps_max,
    target_duration_sec: prev.target_duration_sec,
    prescribed_weight_kg: prev.prescribed_weight_kg,
  };
  const next = nextPrescription(prev, baseline);

  const predchozi = prev.status === 'done'
    ? `${prev.status} ${JSON.stringify(prev.reps_done ?? prev.duration_done_sec)} ${prev.weight_done_kg ?? '—'}kg splneno=${prescriptionMet(prev)}`
    : `${prev.status} (nic nezadano)`;
  const pristi = next.target_duration_sec
    ? `${next.target_sets}× ${next.target_duration_sec}s`
    : `${next.target_sets}× ${next.target_reps_min}–${next.target_reps_max}, ${next.prescribed_weight_kg ?? '—'} kg`;

  console.log(`${key.padEnd(19)} ${predchozi.padEnd(48)} ${pristi}`);
  console.log(`${''.padEnd(19)} ${''.padEnd(48)} rozhodnuti: ${next.decision}`);
}
