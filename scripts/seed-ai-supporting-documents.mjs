/**
 * Vloží výchozí dokumenty pro trainera do ai_supporting_documents.
 * Používá .env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Tabulka musí už existovat
 * (spusť nejdřív migraci 20260323 nebo SQL z Dashboard).
 *
 * Usage: node scripts/seed-ai-supporting-documents.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const SEED_ROWS = [
  {
    agent_slug: 'trainer',
    title: 'Zásady výživy Body & Mind ON',
    summary: 'Při sestavování jídelníčku: respektuj diet_type (standard/vegetarian/vegan), denní kalorický cíl a bílkoviny (cca 1,4–1,8 g/kg podle cíle). Preferuj běžná, dobře mapovatelná jídla pro Spoonacular (např. kuřecí prsa s rýží, ovesná kaše, losos s bramborami, čočka, tofu stir-fry, zeleninový salát s vejcem, tvaroh s ovocem). Vyhni se exotickým názvům bez match v databázi.',
    key_facts: ['Respektuj diet_type a preferences uživatele.', 'Bílkoviny podle cíle: udržování 1,4 g/kg, růst svalů 1,6–1,8 g/kg.', 'Pouze jídla vhodná pro Spoonacular lookup – krátké, běžné názvy.', 'Nevymýšlej kreativní exotiku bez ověření v API.'],
    source_id: 'seed-nutrition-1',
    enabled: true,
    sort_order: 0,
  },
  {
    agent_slug: 'trainer',
    title: 'Povolené cviky a struktura tréninku',
    summary: 'Používej pouze cviky z povoleného seznamu: Dřepy, Kliky, Přítahy v předklonu, Výpady, Prkno, Superman, Mrtvý tah, Rumunský mrtvý tah, Tlaky na hrudník, Tlaky nad hlavu, Rozcvička, Závěr, Strečink, Mobilita, Lehká procházka, Odpočinek, Shyby, Přítahy, Boční prkno, Mountain climber, Rozpažky, Bicepsový zdvih, Tricepsové tlaky, Tlaky nohama. U každého tréninkového dne uveď konkrétní cviky a délky; u odpočinkových dnů „Odpočinek“ nebo „Lehká procházka 20–30 min“. Žádné názvy mimo seznam (např. Bulgarian split squat nahraď výpady nebo dřepy).',
    key_facts: ['Pouze cviky z oficiálního povoleného seznamu.', 'Strukturní položky: Rozcvička, Závěr, Odpočinek, Lehká procházka – vždy povolené.', 'U neznámého cviku použij bezpečný fallback ze seznamu.', 'Trénink tento den: konkrétní cviky + délky u tréninkových dnů.'],
    source_id: 'seed-training-1',
    enabled: true,
    sort_order: 1,
  },
  {
    agent_slug: 'trainer',
    title: 'Struktura týdenního plánu a výstup',
    summary: 'Plán musí obsahovat: sekci Jídelníček (h3), sekci Trénink (h3), pro každý ze 7 dní Snídaně / Oběd / Večeře a blok „Trénink tento den“ (u tréninkových dnů konkrétní cviky, u odpočinku např. Odpočinek nebo Lehká procházka). Dále sekce Regenerace, Suplementace, Nákupní seznam, Mindset. Vždy vracej kompletní plán – nikdy jen Regeneraci/Suplementaci/Mindset bez jídelníčku a tréninku. Výstup pouze platný JSON: ok, metrics (bmr, tdee, calories, protein_g, carbs_g, fat_g), html; volitelně mindset_tip, shopping_list.',
    key_facts: ['Povinné: Jídelníček + Trénink + 7 dní s jídly a „Trénink tento den“.', 'Zakázáno: vrátit jen Regeneraci/Suplementaci/Mindset bez kompletního plánu.', 'JSON: ok, metrics, html; volitelně mindset_tip, shopping_list.', 'HTML struktura musí odpovídat zobrazení v aplikaci.'],
    source_id: 'seed-structure-1',
    enabled: true,
    sort_order: 2,
  },
];

async function main() {
  const { data: existing } = await supabase
    .from('ai_supporting_documents')
    .select('source_id')
    .eq('agent_slug', 'trainer')
    .in('source_id', SEED_ROWS.map((r) => r.source_id));

  const existingIds = new Set((existing || []).map((r) => r.source_id));
  const toInsert = SEED_ROWS.filter((r) => !existingIds.has(r.source_id));

  if (toInsert.length === 0) {
    console.log('Všechny seed dokumenty už v tabulce jsou. Nic se nevkládá.');
    return;
  }

  const { error } = await supabase.from('ai_supporting_documents').insert(toInsert);

  if (error) {
    console.error('Chyba při vkládání:', error.message);
    if (error.code === '42P01') {
      console.error('Tabulka ai_supporting_documents neexistuje. Nejprve spusť migraci 20260323 (nebo SQL z Dashboard).');
    }
    process.exit(1);
  }

  console.log('Vloženo dokumentů:', toInsert.length);
  toInsert.forEach((r) => console.log('  -', r.source_id, r.title));
}

main();
