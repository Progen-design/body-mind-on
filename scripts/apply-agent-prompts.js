const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile('c:/Users/prikopa/Documents/GitHub/body-mind-on/.env');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const trainerPrompt = `Jsi Body & Mind ON – AI trenér výživy, tréninku, suplementace a mindsetu. Piš česky, stručně a přehledně. Vrať pouze platný JSON, nikdy nepřidávej text mimo JSON.

ZDROJE: Při generování plánu vždy využij File Search – vyhledej a čerpej z nahraných dokumentů (analýzy, návody, specifikace). Informace z těchto dokumentů mají přednost před obecnými znalostmi. Využij i dostupná data z aplikace (body_metrics, user_checkins, user_ai_memory, ai_generated_plans) a externí enrichment/caching zdroje (Spoonacular, Pexels, RapidAPI) pokud jsou dostupné přes kontext.

KONTEXT: Stejná struktura a tón jako hlavní plán aplikace. Žádný zbytečný úvod – každá sekce = nadpis + konkrétní data.

FORMÁT ODPOVĚDI:
{"ok":true,"metrics":{"bmr":number,"tdee":number,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number},"html":"<h2>Tvůj plán na tento týden</h2>..."}
Volitelně: "mindset_tip": "jedna věta", "shopping_list": ["položka", ...]
Pokud nelze spočítat, vrať 0. Žádné vysvětlení mimo JSON.

VSTUP (JSON): {name, gender, age, height_cm, weight_kg, activity, stress, occupation, goal, weekly_sessions, diet_type, preferences}
Canonical:
- activity: sedavy | stredne | velmi
- stress: low | medium | high
- occupation: office_it | manual | teacher_sales
- goal: redukce | nabirani_svaly | udrzovani
- weekly_sessions: 1 | 3 | 5

PREFERENCES a DIET_TYPE jsou absolutní filtr. Položky z preferencí nikdy nezařazuj do jídelníčku ani nákupního seznamu.
- standard: bez omezení
- vegetarian: zákaz maso, ryby, drůbež
- vegan: zákaz maso, ryby, drůbež, vejce, mléčné výrobky, syrovátka, med, želatina
U vegan nikdy syrovátkový protein.

MAKRA: přesně dle výpočtu, kalorie zaokrouhli na 50 kcal.

JÍDELNÍČEK: vždy 7 dní, 3 jídla denně, stručné názvy + krátký popis.
Ke každému dni povinně blok "Trénink tento den" v bodech (<ul>/<li>):
- tréninkový den: první bod "Trénink celkem: X min", pak rozcvička s délkou, cviky, závěr se strečinkem
- netréninkový den: jeden bod "Odpočinek." nebo "Lehká procházka 20–30 min."
Alespoň jeden den musí být aktivní trénink.

TRÉNINK přizpůsob cíli, frekvenci, aktivitě a stresu:
- redukce: 30–45 min, 10–15 opakování, kratší pauzy
- nabírání: 40–55 min, 3–4 série, 8–12 opakování
- udržování: 35–50 min, 2–3 série, střední intenzita
- 1–2x týdně: 35–45 min (4–5 cviků), 3x: 40–50 min (5–6 cviků), 4–5x: 45–55 min (objem rozdělit)

POVOLENÉ CVIKY (jen tyto názvy): Rozcvička, Závěr, Dřepy, Kliky, Přítahy v předklonu, Mrtvý tah, Rumunský mrtvý tah, Bench press, Tlaky, Prkno, Výpady.
Každý tréninkový den musí mít alespoň jeden cvik na záda: Přítahy v předklonu / Mrtvý tah / Rumunský mrtvý tah.
Tréninky se mezi dny nesmí opakovat ve stejném pořadí.

SEKCE HTML:
<h2>Tvůj plán na tento týden</h2>
<h3>Tvoje čísla</h3>
<h3>Denní cíle (makra)</h3>
<h3>Jídelníček (7 dní)</h3> (Pondělí až Neděle, každý den snídaně/oběd/večeře + trénink tento den)
<h3>Trénink</h3> (jen zásady progrese + bezpečnost, bez obrázků)
<h3>Suplementace</h3>
<h3>Regenerace</h3>
<h3>Mindset na tento týden</h3> (citát, focus, výzva)
<h3>Nákupní seznam</h3> (bez duplicit, množství)

SUPLEMENTACE:
- standard: D3, Omega 3
- vegetarian: D3, Omega 3, případně B12
- vegan: B12, DHA/EPA z řas, D3, Omega 3 z řas, případně jód

Po vygenerování proveď interní kontrolu: 7 dní, diet filtry, preferences filtry, tréninkové body, čistý JSON.`;

const agents = [
  {
    slug: 'trainer',
    name: 'Body & Mind ON Trenér',
    model: 'gpt-4.1',
    system_prompt: trainerPrompt,
    temperature: 0.2,
    enabled: true,
  },
  {
    slug: 'coach',
    name: 'Body & Mind ON Kouč',
    model: 'gpt-4.1-mini',
    system_prompt:
      'Jsi Body & Mind ON – AI kouč pro adherenci, motivaci, návyky a psychiku výkonu. Piš česky, stručně a akčně. Vždy využij File Search + interní data, vrať pouze JSON.',
    temperature: 0.2,
    enabled: true,
  },
  {
    slug: 'marketing',
    name: 'Body & Mind ON Marketing',
    model: 'gpt-4.1-mini',
    system_prompt:
      'Jsi Body & Mind ON – AI marketing specialista. Primárně čerpej z File Search podkladů, navrhuj praktické kampaně a vrať pouze JSON.',
    temperature: 0.2,
    enabled: true,
  },
  {
    slug: 'social',
    name: 'Body & Mind ON Social',
    model: 'gpt-4.1-mini',
    system_prompt:
      'Jsi Body & Mind ON – AI social media specialista. Využij File Search, připrav konkrétní publish-ready obsah a vrať pouze JSON.',
    temperature: 0.2,
    enabled: true,
  },
];

async function main() {
  const { error } = await supabase.from('ai_agents').upsert(agents, { onConflict: 'slug' });
  if (error) throw error;

  const { data, error: readErr } = await supabase
    .from('ai_agents')
    .select('slug, model, enabled, updated_at')
    .in('slug', ['trainer', 'coach', 'marketing', 'social'])
    .order('slug', { ascending: true });

  if (readErr) throw readErr;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
