// /lib/generatePlan.js
import { supabaseServer } from './supabaseServer';
import { openai } from './openai';
import { sendPlanEmail } from './mail';

const SYS = `Jsi Body & Mind ON – AI trenér výživy, tréninku, suplementace a mindsetu. Piš česky, stručně a přehledně. Vrať pouze platný JSON, nikdy nepřidávej text mimo JSON.

KONTEXT: Stejná struktura a tón jako hlavní plán (lib/generatePlan.js). Uživatel musí z obsahu hned vědět, co to je a co má dělat. Žádný zbytečný úvod – každá sekce = nadpis + konkrétní data.

FORMÁT ODPOVĚDI:
{"ok":true,"metrics":{"bmr":number,"tdee":number,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number},"html":"<h2>Tvůj plán na tento týden</h2>..."}

Volitelně (pro aplikaci): "mindset_tip": "jedna věta", "shopping_list": ["položka", ...]

Pokud nelze spočítat, vrať 0. Žádné vysvětlení mimo JSON.

VSTUP: {name, gender, age, height_cm, weight_kg, activity, stress, occupation, goal, weekly_sessions, diet_type, preferences}

DIET_TYPE: standard | vegetarian | vegan. Absolutní filtr.
- standard = bez omezení.
- vegetarian = zákaz maso, ryby, drůbež.
- vegan = zákaz maso, ryby, drůbež, vejce, mléčné výrobky, syrovátka, med, želatina.
Před odesláním zkontroluj: pokud html obsahuje zakázanou položku, přegeneruj.

PREFERENCES: konkrétní potraviny nebo omezení nikdy nezařazuj. Makra neměň, pouze nahraď alternativou.

Makra přesně dle výpočtů, kalorie zaokrouhli na 50 kcal.

JÍDELNÍČEK: 7 dní, 3 jídla denně. Stručné názvy + krátký popis v závorce, žádné receptové postupy ani dlouhé seznamy.

Vegan zdroje: tofu, tempeh, luštěniny, čočka, fazole, cizrna, quinoa, rostlinné proteiny, ořechy, semínka. Nikdy syrovátka ani živočišné proteiny.

SUPLEMENTACE (povinně): standard: D3, Omega 3. vegetarian: D3, Omega 3, případně B12. vegan: B12, DHA/EPA z řas, D3, Omega 3 z řas, případně jód. U vegan nikdy syrovátkový protein.

HTML struktura (navazuje na generatePlan.js – stejné názvy sekcí):
<h2>Tvůj plán na tento týden</h2>
<p><b>Na míru podle tvých údajů a cíle.</b> Níže: tvoje čísla, makra, jídelníček, trénink, suplementace, nákup a mindset.</p>
<h3>Tvoje čísla</h3> <ul><li>věk, výška, váha, cíl, aktivita, stres, frekvence</li></ul>
<h3>Denní cíle (makra)</h3> <ul><li>Kalorie: ... kcal</li><li>Bílkoviny / Sacharidy / Tuky v g</li></ul>
<h3>Jídelníček (7 dní)</h3> POVINNĚ všech 7 dní: <h4>Pondělí</h4> <h4>Úterý</h4> <h4>Středa</h4> <h4>Čtvrtek</h4> <h4>Pátek</h4> <h4>Sobota</h4> <h4>Neděle</h4>. U každého dne <p><b>Snídaně:</b> ...</p> <p><b>Oběd:</b> ...</p> <p><b>Večeře:</b> ...</p>
<h3>Trénink</h3> <p>Konkrétní dny a typy (Po–St–Pá: silový/kardio), 45–60 min.</p>
<h3>Suplementace</h3> <ul><li>dle diet_type</li></ul>
<h3>Regenerace</h3> <ul><li>Spánek 7–9 h</li><li>Voda 2–3 l</li><li>Protahování po tréninku</li></ul>
<h3>Nákupní seznam na týden</h3><ul><li>položka s množstvím</li><li>...</li></ul>  (sloučený seznam z jídel, bez duplicit, sůl/olej na konci)
<h3>Mindset na tento týden</h3><p>Jedna krátká motivační věta. Nic dlouhého.</p>

Použij pouze inline styly, bez <html>, <body>, skriptů ani externího CSS.

Před vrácením ověř: diet_type, preferences, zákaz potravin, všechny sekce včetně Nákupní seznam na týden a Mindset na tento týden, čistý JSON.`;

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

/** Extrahuje a parsuje JSON z výstupu AI (podporuje ```json ... ```). */
function extractJsonFromAiOutput(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  s = s.replace(/^```\s*json\s*\n?/i, '').replace(/\n?```\s*$/g, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
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
  // Pro vegan navíc vejce, mléčné, med, želatina
  if (diet === 'vegan' && has('vejce', 'vajec', 'egg', 'sýr', 'syr', 'cheese', 'mléko', 'mleko', 'milk', 'jogurt', 'smetan', 'šlehač', 'slehac', 'tvaroh', 'syrovátk', 'whey', 'med', 'želatina', 'zelatina')) return true;
  return false;
}

/** Vrací true, pokud plán obsahuje lepek při preferences „Bez lepku“. */
function planViolatesGlutenFree(html, preferences) {
  if (!html || !preferences || typeof preferences !== 'string') return false;
  const prefs = preferences.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!prefs.includes('lepk') && !prefs.includes('bez lepku') && !prefs.includes('gluten')) return false;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const glutenWords = ['psenice', 'psenic', 'zito', 'zitna', 'jecmen', 'spalda', 'spald', 'testovin', 'bulgur', 'kuskus', 'knedlik', 'chleb', 'hladka mouka', 'pšeničná mouka'];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return glutenWords.some((w) => text.includes(norm(w)));
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

  const input = {
    name: bm.name ?? '—',
    gender: bm.gender ?? '—',
    age: bm.age ?? '—',
    height_cm: bm.height_cm ?? bm.height ?? '—',
    weight_kg: bm.weight_kg ?? bm.weight ?? '—',
    activity: bm.activity ?? '—',
    stress: bm.stress_level ?? bm.stress ?? '—',
    occupation: bm.occupation ?? '—',
    goal: bm.goal ?? '—',
    weekly_sessions: bm.freq_choice ?? bm.frequency ?? bm.weekly_sessions ?? '—',
    diet_type: diet_type,
    preferences: preferences || '—',
  };
  return `VSTUP (JSON): ${JSON.stringify(input)}

Vygeneruj kompletní plán jako JSON podle struktury. Respektuj diet_type a preferences. Jídelníček: 7 dní, 3 jídla denně. Suplementace povinně dle diet_type. Nákupní seznam a Mindset na tento týden musí být v html.`;
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
  const preferencesForCheck = buildPreferencesForGpt(bm.diet_type, bm.dietary_restrictions, bm.notes);
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

  const rawContent = completion.choices?.[0]?.message?.content?.trim();
  if (!rawContent) throw new Error('OpenAI nevrátil žádný plán.');

  let html;
  let metricsOut = bm;

  const parsed = extractJsonFromAiOutput(rawContent);
  if (parsed && parsed.ok && typeof parsed.html === 'string') {
    html = sanitizeHtmlFromJson(parsed.html);
    if (parsed.metrics && typeof parsed.metrics === 'object') {
      const m = parsed.metrics;
      metricsOut = {
        ...bm,
        bmr: asNum(m.bmr),
        tdee: asNum(m.tdee),
        calories: asNum(m.calories) ? Math.round(asNum(m.calories) / 50) * 50 : undefined,
        protein_g: asNum(m.protein_g),
        carbs_g: asNum(m.carbs_g),
        fat_g: asNum(m.fat_g),
      };
    }
  } else {
    html = extractHtmlFromAiOutput(rawContent);
  }

  const needsRetryDiet = (dietTypeForCheck === 'vegetarian' || dietTypeForCheck === 'vegan') && planViolatesDiet(html, dietTypeForCheck);
  const needsRetryGluten = planViolatesGlutenFree(html, preferencesForCheck);

  if (needsRetryDiet || needsRetryGluten) {
    const reasons = [];
    if (needsRetryDiet) reasons.push(`diet_type ${dietTypeForCheck}`);
    if (needsRetryGluten) reasons.push('Bez lepku');
    messages.push({ role: 'assistant', content: rawContent });
    messages.push({
      role: 'user',
      content: `Kontrola: V předchozím výstupu byly zakázané položky. Přegeneruj CELÝ plán jako JSON. ${reasons.map((r) => `Respektuj: ${r}.`).join(' ')}`,
    });
    const retryCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 8192,
      messages,
    });
    const retryRaw = retryCompletion.choices?.[0]?.message?.content?.trim();
    if (retryRaw) {
      const retryParsed = extractJsonFromAiOutput(retryRaw);
      const retryHtml = retryParsed?.html ? sanitizeHtmlFromJson(retryParsed.html) : extractHtmlFromAiOutput(retryRaw);
      if (!planViolatesDiet(retryHtml, dietTypeForCheck) && !planViolatesGlutenFree(retryHtml, preferencesForCheck)) {
        html = retryHtml;
        if (retryParsed?.metrics) metricsOut = { ...metricsOut, ...retryParsed.metrics };
      }
    }
  }

  return { html, metrics: metricsOut };
}

/** Odstraní nebezpečné tagy z HTML z JSON (script, style, iframe). */
function sanitizeHtmlFromJson(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .trim();
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

    let bm;
    if (options.bmOverride) {
      bm = { ...options.bmOverride, email };
    } else {
      const { data: rows, error } = await supabaseServer
        .from('body_metrics')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!rows?.length) throw new Error('Žádné metriky pro tento e-mail.');
      bm = rows[0];
    }
    console.log('📊 Načtené metriky:', bm);

    const userPrompt = buildUserPrompt(bm);
    const dietFromNotes = bm.diet_type == null && bm.notes ? parseDietFromNotes(bm.notes).diet_type : null;
    const dietTypeForCheck = normalizeDietTypeForGpt(bm.diet_type ?? dietFromNotes);
    const preferencesForCheck = buildPreferencesForGpt(bm.diet_type, bm.dietary_restrictions, bm.notes);

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

    const rawContent = completion.choices?.[0]?.message?.content?.trim();
    if (!rawContent) throw new Error('OpenAI nevrátil žádný plán.');

    let planHtml;
    let finalParsed = extractJsonFromAiOutput(rawContent);
    if (finalParsed && finalParsed.ok && typeof finalParsed.html === 'string') {
      planHtml = sanitizeHtmlFromJson(finalParsed.html);
    } else {
      planHtml = extractHtmlFromAiOutput(rawContent);
    }

    const needsRetryDiet = (dietTypeForCheck === 'vegetarian' || dietTypeForCheck === 'vegan') && planViolatesDiet(planHtml, dietTypeForCheck);
    const needsRetryGluten = planViolatesGlutenFree(planHtml, preferencesForCheck);

    if (needsRetryDiet || needsRetryGluten) {
      const reasons = [];
      if (needsRetryDiet) reasons.push(`diet_type ${dietTypeForCheck} (bez masa, ryb, drůbeže${dietTypeForCheck === 'vegan' ? ', vajec, mléčných, medu a želatiny' : ''})`);
      if (needsRetryGluten) reasons.push('preferences Bez lepku (žádná pšenice, mouka, těstoviny, chléb, kuskus, bulgur – pouze rýže, quinoa, brambory, pohanka)');
      console.warn('⚠️ Plán obsahuje zakázané položky. Přegenerovávám jednou:', reasons.join('; '));
      messages.push({ role: 'assistant', content: rawContent });
      messages.push({
        role: 'user',
        content: `Kontrola: V předchozím výstupu byly zakázané položky. Přegeneruj CELÝ plán jako JSON. ${reasons.map((r) => `Respektuj: ${r}.`).join(' ')}`,
      });
      const retryCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        max_tokens: 8192,
        messages,
      });
      const retryRaw = retryCompletion.choices?.[0]?.message?.content?.trim();
      if (retryRaw) {
        const retryParsed = extractJsonFromAiOutput(retryRaw);
        const retryHtml = retryParsed?.html ? sanitizeHtmlFromJson(retryParsed.html) : extractHtmlFromAiOutput(retryRaw);
        if (!planViolatesDiet(retryHtml, dietTypeForCheck) && !planViolatesGlutenFree(retryHtml, preferencesForCheck)) {
          planHtml = retryHtml;
          finalParsed = retryParsed;
          console.log('✅ Plán po kontrole diet/preferences přegenerován.');
        }
      }
    }

    console.log('✅ AI plán vygenerován.');

    const opts = typeof options === 'object' ? options : {};
    const planType = bm.goal === 'redukce' ? 'redukce' : bm.goal === 'nabirani_svaly' ? 'nabirani' : 'udrzovani';
    const m = finalParsed?.metrics;
    const protein = asNum(m?.protein_g) ?? Math.round((asNum(bm.weight_kg) || 70) * 1.8);
    const kc = asNum(m?.calories) ?? asNum(bm.calories_target) ?? 2200;
    const fat = asNum(m?.fat_g) ?? Math.round(kc * 0.25 / 9);
    const carbs = asNum(m?.carbs_g) ?? Math.round((kc - protein * 4 - fat * 9) / 4);
    const caloriesRounded = Math.round(kc / 50) * 50;

    const { error: insErr } = await supabaseServer
      .from('ai_generated_plans')
      .insert({
        user_id: bm.user_id || null,
        email,
        plan_type: planType,
        plan_html: planHtml,
        plan_markdown: null,
        daily_calories: bm.calories_target ?? caloriesRounded,
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

/**
 * Vygeneruje plán z parametrů (např. z assistant-intake) a odešle e-mailem.
 * @param {object} params - { name, email, gender, age, height, weight, activity, stress, workType, goal, frequency, notes }
 * @param {object} [options] - Volby pro e-mail (loginUrl, existingAccount)
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function generatePlanAndSendFromParams(params, options = {}) {
  if (!params?.email) return { ok: false, message: 'Chybí e-mail.' };
  const bm = {
    name: params.name ?? null,
    gender: params.gender ?? null,
    age: params.age ?? null,
    height_cm: params.height_cm ?? params.height ?? null,
    weight_kg: params.weight_kg ?? params.weight ?? null,
    activity: params.activity ?? null,
    stress_level: params.stress ?? params.stress_level ?? null,
    occupation: params.workType ?? params.occupation ?? null,
    goal: params.goal ?? null,
    weekly_sessions: params.weekly_sessions ?? params.frequency ?? params.freq_choice ?? null,
    diet_type: params.diet_type ?? null,
    dietary_restrictions: params.dietary_restrictions ?? params.preferences ?? null,
    notes: params.notes ?? null,
    user_id: params.user_id ?? null,
  };
  return generatePlanForEmail(params.email, { ...options, bmOverride: bm });
}

export { generatePlan, generatePlanForEmail, generatePlanAndSendFromParams };
