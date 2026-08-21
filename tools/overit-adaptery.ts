// Prozene adaptery skutecnym planem z produkce. Klice se ctou z .env.local,
// nikam se nevypisuji.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { naJidla, naTreninky, naNavyky, naZlozvyky, vyberPlan } from '../src/data/adaptery.ts';

for (const radek of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = radek.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data: plany, error: chybaDotazu } = await db
  .from('ai_generated_plans')
  .select('*')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(5);

if (chybaDotazu) console.log('CHYBA DOTAZU: ' + chybaDotazu.message);
console.log('planu z DB: ' + (plany?.length ?? 0));

const plan = vyberPlan(plany || []);
if (!plan) { console.log('ZADNY AKTIVNI PLAN'); process.exit(1); }

const jidla = naJidla(plan);
const treninky = naTreninky(plan);

console.log('plan_id            ' + String(plan.id).slice(0, 8));
console.log('jidel dnes         ' + jidla.length);
console.log('  typy             ' + jidla.map((j) => j.type).join(' | '));
console.log('  kcal celkem      ' + jidla.reduce((a, j) => a + j.calories, 0));
console.log('  bez nazvu        ' + jidla.filter((j) => !j.title || j.title === 'Jídlo').length);
console.log('  bez surovin      ' + jidla.filter((j) => j.ingredients.length === 0).length);
console.log('  ukazka           ' + (jidla[0] ? `${jidla[0].title} (${jidla[0].calories} kcal, ${jidla[0].ingredients.length} surovin)` : '-'));
console.log('treninku v tydnu   ' + treninky.length);
console.log('  cviku celkem     ' + treninky.reduce((a, t) => a + t.exercises.length, 0));
console.log('  bez nazvu cviku  ' + treninky.flatMap((t) => t.exercises).filter((e) => !e.name || e.name === 'Cvik').length);
console.log('  dnesni trenink   ' + (treninky.find((t) => t.isToday)?.title || 'zadny'));

const { data: navyky } = await db.from('user_habits').select('habit_id,is_positive,sort_order').limit(50);
console.log('navyku pozitivnich ' + naNavyky(navyky as any).length);
console.log('navyku negativnich ' + naZlozvyky(navyky as any).length);
console.log('  bez popisku      ' + naNavyky(navyky as any).filter((h) => h.title === h.id).length);
