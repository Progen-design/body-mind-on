/**
 * Projde přesně tu cestu, kterou dělá WorkoutLogSection: reálný uživatelský
 * token → GET předpisů → PATCH výsledků. Nic neobchází přes service_role.
 */
import { loadLocalEnv } from './audit-utils.mjs';
loadLocalEnv();
const { createClient } = await import('@supabase/supabase-js');

const BASE = 'https://app.bodyandmindon.cz';
const EMAIL = 'bm-smoke-1786369614630@example.com';
const USER = 'fd99a26c-9123-4599-977a-2c89298858cb';
const HESLO = `Workout-${Date.now()}-Aa!`;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
await admin.auth.admin.updateUserById(USER, { password: HESLO });

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: HESLO });
if (!signIn?.session?.access_token) { console.error('login selhal:', signErr?.message); process.exit(1); }
const token = signIn.session.access_token;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const den = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

// ── 1) GET, jak ho dělá komponenta ───────────────────────────────────────────
const gRes = await fetch(`${BASE}/api/workout/progression?from=${den(13)}&to=${den(0)}`, { headers: H });
const gJson = await gRes.json();
console.log(`GET /api/workout/progression → HTTP ${gRes.status}, položek ${gJson.items?.length ?? 0}\n`);

const kDopsani = (gJson.items || []).filter((i) => i.status === 'prescribed');
const cilovyDen = kDopsani.map((i) => i.performed_on).sort().slice(-1)[0];
const cviky = kDopsani.filter((i) => i.performed_on === cilovyDen);
console.log(`Nejnovější nevyplněný den: ${cilovyDen} (${cviky.length} cviků)`);
for (const c of cviky) {
  console.log(`   ${c.canonical_key.padEnd(18)} kind=${String(c.progression_kind).padEnd(15)}`
    + ` ${c.target_sets}× ${c.target_reps_min ?? c.target_duration_sec}${c.target_duration_sec ? 's' : ''}`
    + ` kg=${c.prescribed_weight_kg ?? '—'}`);
}

// ── 2) PATCH — payload staví stejně jako komponenta ──────────────────────────
console.log('\nZÁPIS (splněno, u zatížených 40 kg):');
for (const c of cviky) {
  const telo = { canonical_key: c.canonical_key, performed_on: c.performed_on };
  if (c.progression_kind === 'timed') {
    telo.duration_sec = [Number(c.target_duration_sec) || 30];
  } else {
    const sets = Math.max(1, Number(c.target_sets) || 1);
    const reps = Number(c.target_reps_max ?? c.target_reps_min) || 10;
    telo.reps_done = Array(sets).fill(reps);
    if (['barbell', 'dumbbell', 'machine'].includes(c.progression_kind)) telo.weight_kg = 40;
  }
  const r = await fetch(`${BASE}/api/workout/progression`, { method: 'PATCH', headers: H, body: JSON.stringify(telo) });
  const j = await r.json();
  console.log(`   ${c.canonical_key.padEnd(18)} HTTP ${r.status}  status=${j.row?.status ?? '—'}  splneno=${j.met}`);
}

// ── 3) Ověření v DB ─────────────────────────────────────────────────────────
const { data: po } = await admin
  .from('start_workout_progression')
  .select('canonical_key, status, reps_done, weight_done_kg, duration_done_sec')
  .eq('user_id', USER).eq('performed_on', cilovyDen).order('canonical_key');
console.log('\nV DB po zápisu:');
for (const r of po || []) {
  console.log(`   ${r.canonical_key.padEnd(18)} ${r.status.padEnd(10)}`
    + ` reps=${JSON.stringify(r.reps_done)} kg=${r.weight_done_kg ?? '—'} sec=${JSON.stringify(r.duration_done_sec)}`);
}
console.log('\ncilovy_den=' + cilovyDen);
