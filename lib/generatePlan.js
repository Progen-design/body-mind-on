// /lib/generatePlan.js
import { supabaseServer } from './supabaseServer';
import { openai } from './openai';
import { sendPlanEmail } from './mail';

const SYS = `
Jsi Body & Mind ON – empatický AI trenér výživy, cvičení a mindsetu.
Piš česky, přirozeně a přehledně. Používej profesionální HTML styl.

DŮLEŽITÉ: Vrať pouze čistý HTML kód (tagy <h2>, <h3>, <h4>, <section>, <ul>, <li>, <p>, <b> atd.). Nepoužívej markdown ani bloky \`\`\`html – výstup má být přímo HTML bez obalování do kódu.

💪 Struktura výstupu (vše vyplň konkrétně podle dat klienta):

<h2>Tvůj osobní AI plán Body & Mind ON</h2>
<section>
<h3>Osobní údaje & cíle</h3>
<ul>
<li><b>Věk:</b> ...</li>
<li><b>Výška:</b> ... cm</li>
<li><b>Váha:</b> ... kg</li>
<li><b>Aktivita:</b> ...</li>
<li><b>Stres:</b> ...</li>
<li><b>Typ práce:</b> ...</li>
<li><b>Cíl:</b> ...</li>
<li><b>Frekvence cvičení:</b> ...</li>
</ul>

<h3>Denní cíle (makroživiny)</h3>
<ul>
<li><b>Kalorie:</b> ... kcal</li>
<li><b>Bílkoviny:</b> ... g</li>
<li><b>Sacharidy:</b> ... g</li>
<li><b>Tuky:</b> ... g</li>
</ul>

<h3>Jídelníček na celý týden (7 dní)</h3>
Pro každý den (Pondělí–Neděle) uveď konkrétní jídla:
- Snídaně (název, přibližně kcal / bílkoviny / sacharidy / tuky)
- Svačina (volitelně)
- Oběd (název + stručně hlavní suroviny)
- Svačina (volitelně)
- Večeře (název + stručně hlavní suroviny)
Formát např.: <h4>Pondělí</h4> <p><b>Snídaně:</b> Ovesná kaše s banánem a ořechy (cca 450 kcal, 15 g B, 60 g S, 15 g T).</p> <p><b>Oběd:</b> ...</p> atd. Pro všech 7 dní.

<h3>Recepty na týden</h3>
U 5–7 vybraných jídel (hlavně obědy a večeře) uveď kompletní recept v HTML:
- Název jídla
- Suroviny (seznam s množstvími)
- Postup (číslovaný nebo odrážkový, stručně)
Recepty piš tak, aby byly proveditelné doma; uživatel si je pak může upravit nebo doplnit s AI asistentem v aplikaci Body & Mind ON. Používej např. <h4>Název receptu</h4> <p><b>Suroviny:</b> ...</p> <p><b>Postup:</b> ...</p>.

<h3>Nákupní seznam na týden</h3>
<p>Jeden sloučený seznam surovin pro všechny recepty na tento týden. Každá položka jako <li>...</li>, s množstvím pokud dává smysl (např. 200 g rýže, 1 cibule). Formát: <ul><li>položka 1</li><li>položka 2</li></ul>. Bez zbytečných duplicit, běžné věci (sůl, olej) na konci.</p>

<h3>Mindset na tento týden</h3>
<p>Jedna krátká motivační nebo zklidňující věta pro klienta (1–2 věty). Téma: odpočinek, trpělivost, malé kroky, tělo a mysl. Piš do jednoho odstavce <p>...</p>.</p>

<h3>Tréninkový plán</h3>
<p>3–5 tréninkových dnů týdně (45–60 min), konkrétní dny a typy jednotek podle cíle a frekvence.</p>

<h3>Regenerace & Mindset</h3>
<ul>
<li>Spánek: 7–9 h</li>
<li>Hydratace: 2–3 l vody denně</li>
<li>Meditace: 10 min denně</li>
<li>Protahování po cvičení</li>
</ul>
</section>
`;

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/** Pro GPT: pouze standard | vegetarian | vegan (dle instrukcí asistenta). */
function normalizeDietTypeForGpt(raw) {
  if (!raw || typeof raw !== 'string') return 'standard';
  const t = raw.toLowerCase().trim();
  if (t === 'vegetarian' || t === 'vegetarián') return 'vegetarian';
  if (t === 'vegan') return 'vegan';
  return 'standard';
}

/** Z poznámek (když v DB chybí diet_type/dietary_restrictions) odvodí diet_type a preferences. */
function parseDietFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return { diet_type: null, preferences: '' };
  const s = notes.trim();
  let diet_type = null;
  if (/Vegetarián|vegetarian/i.test(s)) diet_type = 'vegetarian';
  else if (/Vegan|vegan/i.test(s)) diet_type = 'vegan';
  return { diet_type, preferences: s };
}

/** Sestaví řetězec preferences pro GPT: dietní typ (pokud není veg/vegan) + co nejí + poznámky. */
function buildPreferencesForGpt(dietTypeRaw, dietaryRestrictions, notes) {
  const parts = [];
  const t = (dietTypeRaw || '').toLowerCase().trim();
  const dietLabels = {
    gluten_free: 'Bez lepku',
    lactose_free: 'Bez laktózy',
    paleo: 'Paleo',
    low_carb: 'Nízkosacharidová',
    other: 'Jiné',
  };
  if (t && t !== 'vegetarian' && t !== 'vegan' && dietLabels[t]) parts.push(dietLabels[t]);
  if (dietaryRestrictions && dietaryRestrictions.trim()) parts.push(dietaryRestrictions.trim());
  if (notes && notes.trim()) parts.push(notes.trim());
  return parts.length ? parts.join('. ') : '';
}

function extractHtmlFromAiOutput(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';
  let s = raw.trim();

  s = s.replace(/^```\s*html\s*\n?/i, '').replace(/\n?```\s*$/g, '').trim();
  s = s.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/g, '').trim();
  s = s.replace(/^(html|HTML)(\s*\n|\s+)/i, '$2').trim();

  if (/^html\n/i.test(s)) s = s.replace(/^html\n/i, '');
  if (/^html\s*/i.test(s)) s = s.replace(/^html\s*/i, '').trim();

  return s.trim();
}

/** Vrací true, pokud v textu (HTML) jsou slova zakázaná pro daný diet_type. */
function planViolatesDiet(html, dietType) {
  if (!html || typeof html !== 'string') return false;
  const diet = (dietType || '').toLowerCase().trim();
  if (diet !== 'vegetarian' && diet !== 'vegan') return false;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const has = (...words) => words.some((w) => normalize(text).includes(normalize(w)));
  // Maso, ryby, drůbež – zakázáno pro vegetarian i vegan
  if (has('kuřecí', 'kuře', 'chicken', 'losos', 'salmon', 'ryb', 'fish', 'maso', 'hovězí', 'vepř', 'drůbež', 'drubez', 'krůt', 'kruta', 'treska', 'tuna', 'steak', 'biftek')) return true;
  // Pro vegan navíc vejce a mléčné
  if (diet === 'vegan' && has('vejce', 'vajec', 'egg', 'sýr', 'syr', 'cheese', 'mléko', 'mleko', 'milk', 'jogurt', 'smetan', 'šlehač', 'slehac', 'tvaroh', 'syrovátk', 'whey')) return true;
  return false;
}

function buildUserPrompt(bm) {
  const hasDietColumns = bm.diet_type != null || bm.dietary_restrictions != null;
  let diet_type = 'standard';
  let preferences = '';
  if (hasDietColumns) {
    diet_type = normalizeDietTypeForGpt(bm.diet_type);
    preferences = buildPreferencesForGpt(bm.diet_type, bm.dietary_restrictions, bm.notes);
  } else if (bm.notes) {
    const parsed = parseDietFromNotes(bm.notes);
    diet_type = parsed.diet_type ? normalizeDietTypeForGpt(parsed.diet_type) : 'standard';
    preferences = parsed.preferences;
  }

  return `
Klient:
- Jméno: ${bm.name ?? '—'}
- Pohlaví: ${bm.gender ?? '—'}
- Věk: ${bm.age ?? '—'}
- Výška: ${bm.height_cm ?? '—'} cm
- Váha: ${bm.weight_kg ?? '—'} kg
- Aktivita: ${bm.activity ?? '—'}
- Stres: ${bm.stress_level ?? bm.stress ?? '—'}
- Typ práce: ${bm.occupation ?? '—'}
- Cíl: ${bm.goal ?? '—'}
- Frekvence: ${bm.freq_choice ?? bm.frequency ?? bm.weekly_sessions ?? '—'}
- diet_type (pouze standard | vegetarian | vegan): ${diet_type}
- preferences (co nemůže/nechce jíst, další omezení – volitelné): ${preferences || '—'}

Připrav kompletní HTML výstup podle systémového promptu. Respektuj diet_type a preferences: nikdy nedoporučuj potraviny, které porušují diet_type nebo preferences. Makra neměň podle stravy, měň pouze zdroje potravin v jídelníčku a receptech. Nezapomeň na jídelníček na celý týden (každý den konkrétní jídla), na 5–7 receptů s ingrediencemi a postupem, na sekci Nákupní seznam na týden (sloučené suroviny z receptů) a na sekci Mindset na tento týden (jedna motivační věta).`;
}

async function generatePlan(params = {}) {
  const bm = {
    name: params.name ?? null,
    gender: params.gender ?? null,
    age: params.age ?? null,
    height_cm: params.height_cm ?? null,
    weight_kg: params.weight_kg ?? null,
    activity: params.activity ?? null,
    stress_level: params.stress ?? params.stress_level ?? null,
    occupation: params.occupation ?? null,
    goal: params.goal ?? null,
    freq_choice: params.freq_choice ?? null,
    frequency: params.weekly_sessions ?? null,
    weekly_sessions: params.weekly_sessions ?? null,
    diet_type: params.diet_type ?? null,
    dietary_restrictions: params.dietary_restrictions ?? null,
    notes: params.notes ?? null,
  };

  const userPrompt = buildUserPrompt(bm);
  const dietTypeForCheck = normalizeDietTypeForGpt(bm.diet_type);
  let messages = [
    { role: 'system', content: SYS },
    { role: 'user', content: userPrompt },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 8192,
    messages,
  });

  let html = completion.choices?.[0]?.message?.content?.trim();
  if (!html) throw new Error('OpenAI nevrátil žádný plán.');
  html = extractHtmlFromAiOutput(html);

  if (dietTypeForCheck === 'vegetarian' || dietTypeForCheck === 'vegan') {
    if (planViolatesDiet(html, dietTypeForCheck)) {
      messages.push({ role: 'assistant', content: completion.choices?.[0]?.message?.content || '' });
      messages.push({
        role: 'user',
        content: `Kontrola: V předchozím výstupu byl v jídelníčku maso, ryby nebo drůbež${dietTypeForCheck === 'vegan' ? ', vejce nebo mléčné' : ''}. Klient má diet_type: ${dietTypeForCheck}. Přegeneruj CELÝ plán bez masa, ryb a drůbeže${dietTypeForCheck === 'vegan' ? ' a bez vajec a mléčných výrobků' : ''}. Pouze HTML.`,
      });
      const retryCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        max_tokens: 8192,
        messages,
      });
      const retryHtml = retryCompletion.choices?.[0]?.message?.content?.trim();
      if (retryHtml && !planViolatesDiet(extractHtmlFromAiOutput(retryHtml), dietTypeForCheck)) {
        html = extractHtmlFromAiOutput(retryHtml);
      }
    }
  }

  return { html, metrics: bm };
}

/**
 * Vygeneruje AI plán pro daný e-mail a odešle ho.
 * @param {string} email - E-mail uživatele (musí mít záznam v body_metrics)
 * @param {object} [options] - Volby pro e-mail (loginPassword, loginUrl, existingAccount, loginUnavailable)
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function generatePlanForEmail(email, options = {}) {
  try {
    console.log('🧩 Spouštím generatePlanForEmail pro:', email);

    const { data: rows, error } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!rows?.length) throw new Error('Žádné metriky pro tento e-mail.');

    const bm = rows[0];
    console.log('📊 Načtené metriky:', bm);

    const userPrompt = buildUserPrompt(bm);
    const dietTypeForCheck = normalizeDietTypeForGpt(bm.diet_type);

    let messages = [
      { role: 'system', content: SYS },
      { role: 'user', content: userPrompt },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 8192,
      messages,
    });

    let planHtml = completion.choices?.[0]?.message?.content?.trim();
    if (!planHtml) throw new Error('OpenAI nevrátil žádný plán.');
    planHtml = extractHtmlFromAiOutput(planHtml);

    if (dietTypeForCheck === 'vegetarian' || dietTypeForCheck === 'vegan') {
      if (planViolatesDiet(planHtml, dietTypeForCheck)) {
        console.warn('⚠️ Plán obsahuje maso/ryby (nebo pro vegan vejce/mléčné). Přegenerovávám jednou.');
        messages.push({ role: 'assistant', content: completion.choices?.[0]?.message?.content || '' });
        messages.push({
          role: 'user',
          content: `Kontrola: V předchozím výstupu byl v jídelníčku nebo receptech maso, ryby nebo drůbež${dietTypeForCheck === 'vegan' ? ', případně vejce nebo mléčné výrobky' : ''}. Klient má diet_type: ${dietTypeForCheck}. Přegeneruj CELÝ plán tak, aby v něm nebylo žádné maso, ryby ani drůbež${dietTypeForCheck === 'vegan' ? ' a žádné vejce ani mléčné výrobky' : ''}. Pouze platný HTML výstup.`,
        });
        const retryCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.5,
          max_tokens: 8192,
          messages,
        });
        const retryHtml = retryCompletion.choices?.[0]?.message?.content?.trim();
        if (retryHtml && !planViolatesDiet(extractHtmlFromAiOutput(retryHtml), dietTypeForCheck)) {
          planHtml = extractHtmlFromAiOutput(retryHtml);
          console.log('✅ Plán po kontrole diet_type přegenerován.');
        }
      }
    }

    console.log('✅ AI plán vygenerován.');

    const opts = typeof options === 'object' ? options : {};
    const planType = bm.goal === 'redukce' ? 'redukce' : bm.goal === 'nabirani_svaly' ? 'nabirani' : 'udrzovani';
    const protein = Math.round((asNum(bm.weight_kg) || 70) * 1.8);
    const kc = asNum(bm.calories_target) || 2200;
    const fat = Math.round(kc * 0.25 / 9);
    const carbs = Math.round((kc - protein * 4 - fat * 9) / 4);

    const { error: insErr } = await supabaseServer
      .from('ai_generated_plans')
      .insert({
        user_id: bm.user_id || null,
        email,
        plan_type: planType,
        plan_html: planHtml,
        plan_markdown: null,
        daily_calories: bm.calories_target || kc,
        macros: { protein_g: protein, fat_g: fat, carbs_g: carbs },
        workout_plan: {},
        exercises_data: {},
        meal_plan: {},
        generated_by: 'gpt-4o-mini',
        generation_prompt: SYS,
        user_context: bm,
        valid_from: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_active: true,
        created_at: new Date().toISOString(),
        email_sent: false,
      });

    if (insErr) throw new Error('Chyba při ukládání plánu: ' + insErr.message);

    const sendOpts = {
      loginPassword: opts.loginPassword ?? null,
      loginUrl: opts.loginUrl || 'https://app.bodyandmindon.cz/login',
      existingAccount: opts.existingAccount === true,
      loginUnavailable: opts.loginUnavailable === true,
      userChosePassword: opts.userChosePassword === true,
    };
    await sendPlanEmail(email, planHtml, sendOpts);

    console.log('📧 E-mail s plánem odeslán na:', email);

    return { ok: true, message: 'Plán vygenerován a odeslán.' };
  } catch (err) {
    console.error('❌ generatePlanForEmail ERROR:', err);
    return { ok: false, message: err.message };
  }
}

export { generatePlan, generatePlanForEmail };
