// /lib/generatePlan.js
// Body & Mind ON – AI trenér (výživa, trénink, mindset)
// ------------------------------------------------------
// Funkce generatePlan(inputs) spočítá BMR/TDEE/makra, připraví empatický prompt,
// zavolá OpenAI a vrátí HTML blok + metriky. Volitelně umí uložit do Supabase.

import OpenAI from 'openai'

// ========== Pomocné výpočty ==========

function asNum(n, def = 0) {
  const num = Number(n)
  return Number.isFinite(num) ? num : def
}

// Mifflin–St Jeor
function calcBMR({ gender = 'male', weight_kg, height_cm, age }) {
  const w = asNum(weight_kg)
  const h = asNum(height_cm)
  const a = asNum(age)
  if (gender?.toLowerCase() === 'female') {
    return 10 * w + 6.25 * h - 5 * a - 161
  }
  return 10 * w + 6.25 * h - 5 * a + 5
}

// Koeficient aktivity (mapa dle interní standardizace)
const ACTIVITY_FACTOR = {
  sedavy: 1.2,
  lehce: 1.375,
  stredne: 1.55,
  velmi: 1.725,
  extra: 1.9,
}

// Úpravy dle práce (sedavá vs fyzická)
const OCCUPATION_FACTOR = {
  office_it: 0.98,       // sedavější práce
  driver: 1.0,
  warehouse: 1.06,
  manual: 1.08,
  healthcare: 1.05,
  teacher_sales: 1.03,
  gastronomy: 1.05,
}

// Úroveň stresu
const STRESS_FACTOR = {
  low: 1.00,
  medium: 0.98,
  high: 0.96,
}

// Tréninky týdně – malá adaptace
function trainingFactor(weeklySessions) {
  const s = asNum(weeklySessions)
  if (s >= 5) return 1.10
  if (s >= 3) return 1.05
  if (s >= 1) return 1.02
  return 1.0
}

// Cílová úprava kcal
function applyGoal(tdee, goal) {
  const g = (goal || '').toLowerCase()
  if (g.includes('reduk')) return Math.round(tdee * 0.80)
  if (g.includes('náb') || g.includes('nab') || g.includes('sval')) return Math.round(tdee * 1.15)
  return Math.round(tdee) // udržení
}

// Zaokrouhlení na 50 kcal
function round50(x) {
  return Math.round(x / 50) * 50
}

// Rozdělení makroživin
function splitMacros({ calories, weight_kg, gender = 'male', stress = 'medium', weeklySessions = 3 }) {
  const w = Math.max(1, asNum(weight_kg))
  const g = (gender || 'male').toLowerCase()
  const s = (stress || 'medium').toLowerCase()
  const sessions = asNum(weeklySessions, 3)

  // Bílkoviny (g/kg)
  let proteinPerKg = 1.8
  if (sessions >= 4) proteinPerKg = 2.0
  if (s === 'high') proteinPerKg = Math.max(proteinPerKg, 2.0)
  if (g === 'female') proteinPerKg = Math.min(Math.max(proteinPerKg, 1.6), 2.0)

  const protein_g = Math.round(proteinPerKg * w)

  // Tuky (g/kg)
  let fatPerKg = g === 'female' ? 1.0 : 0.9
  if (s === 'high') fatPerKg = Math.max(fatPerKg, 1.0)
  const fat_g = Math.round(fatPerKg * w)

  // Škroby/sacharidy = zbytek
  const kcalFromProtein = protein_g * 4
  const kcalFromFat = fat_g * 9
  const carbs_g = Math.max(0, Math.round((calories - kcalFromProtein - kcalFromFat) / 4))

  return { protein_g, fat_g, carbs_g }
}

// Bezpečný text pro HTML šablonu
function safe(v, fallback = '—') {
  if (v === 0) return '0'
  return (v === undefined || v === null || v === '') ? fallback : String(v)
}

// ========== Prompt & OpenAI ==========

function buildSystemPrompt() {
  return `
Jsi Body & Mind ON – empatický AI trenér výživy, cvičení a mindsetu.
Piš česky, přirozeně, s lehkým humorem a lidskostí. Motivuj: "Zvládneš to!", "Tělo ti poděkuje."
Vrať JEN 1 HTML BLOK (bez <html>/<body>). Nepřidávej žádný JSON ani vysvětlení.
Používej jemné barvy (modrá/tyrkys/bílá), odděluj sekce, používej emoji v nadpisech.
`
}

function buildUserPromptHTML(vars) {
  // Vars obsahují: name, gender, age, height_cm, weight_kg, activityLabel (CZ), stressLabel (CZ), jobLabel (CZ),
  // goalLabel (CZ), weeklySessions, calories, protein_g, carbs_g, fat_g
  const {
    age, height_cm, weight_kg, activityLabel, stressLabel, jobLabel,
    goalLabel, weeklySessions, calories, protein_g, carbs_g, fat_g
  } = vars

  // HTML šablona – drží se přesně tvého designu
  return `
<h2 style="text-align:center; color:#00BFFF; font-family:'Inter',sans-serif;">
💙 Tvůj osobní plán Body & Mind ON
</h2>

<p style="font-size:15px; color:#444; text-align:center; margin-bottom:30px;">
Díky, že ses svěřil do rukou našeho AI trenéra.
Tenhle plán je připraven přesně pro tebe — s respektem k tvému tělu, hlavě i energii.
Pojď do toho naplno – <b>základ jsi právě položil!</b>
</p>

<div style="background:#f5f9ff; padding:20px; border-radius:10px; margin-bottom:25px;">
  <h3 style="color:#0077cc;">👤 Osobní údaje & cíle</h3>
  <ul style="list-style:none; padding:0; line-height:1.6;">
    <li><b>Věk:</b> ${safe(age)} let</li>
    <li><b>Výška:</b> ${safe(height_cm)} cm</li>
    <li><b>Váha:</b> ${safe(weight_kg)} kg</li>
    <li><b>Aktivita:</b> ${safe(activityLabel)}</li>
    <li><b>Míra stresu:</b> ${safe(stressLabel)}</li>
    <li><b>Typ práce:</b> ${safe(jobLabel)}</li>
    <li><b>Cíl:</b> ${safe(goalLabel)}</li>
    <li><b>Frekvence cvičení:</b> ${safe(weeklySessions)}× týdně</li>
  </ul>
</div>

<div style="background:#e6f9f5; padding:20px; border-radius:10px; margin-bottom:25px;">
  <h3 style="color:#009688;">🥗 Denní cíle</h3>
  <ul style="list-style:none; padding:0; line-height:1.6;">
    <li><b>Kalorie:</b> ${safe(calories)} kcal</li>
    <li><b>Bílkoviny:</b> ${safe(protein_g)} g</li>
    <li><b>Sacharidy:</b> ${safe(carbs_g)} g</li>
    <li><b>Tuky:</b> ${safe(fat_g)} g</li>
  </ul>
</div>

<div style="padding:20px; border:1px solid #ddd; border-radius:10px; margin-bottom:25px;">
  <h3 style="color:#333;">🍽️ Jídelníček na 7 dní</h3>
  <table style="width:100%; border-collapse:collapse; font-size:14px;">
    <thead>
      <tr style="background:#00BFFF; color:white;">
        <th style="padding:8px;">Den</th>
        <th style="padding:8px;">Snídaně</th>
        <th style="padding:8px;">Oběd</th>
        <th style="padding:8px;">Večeře</th>
        <th style="padding:8px;">Svačiny</th>
      </tr>
    </thead>
    <tbody>
      {{weekly_meal_plan}}
    </tbody>
  </table>
</div>

<div style="background:#f7f7ff; padding:20px; border-radius:10px; margin-bottom:25px;">
  <h3 style="color:#6a5acd;">💪 Tréninkový plán</h3>
  <ul style="list-style:none; padding:0; line-height:1.6;">
    <li><b>Den 1:</b> {{workout_day_1}}</li>
    <li><b>Den 2:</b> {{workout_day_2}}</li>
    <li><b>Den 3:</b> {{workout_day_3}}</li>
    <li><b>Den 4:</b> {{workout_day_4}}</li>
    <li><b>Den 5:</b> {{workout_day_5}}</li>
  </ul>
</div>

<div style="background:#fff7f0; padding:20px; border-radius:10px;">
  <h3 style="color:#e67e22;">🧘 Regenerace & Mindfulness</h3>
  <ul style="list-style:none; padding:0; line-height:1.6;">
    <li>😴 Spánek: 7–9 hodin denně</li>
    <li>💧 Hydratace: 2–3 litry vody</li>
    <li>🧠 Mindset: krátká meditace nebo dechové cvičení</li>
    <li>🤸‍♀️ Protahování po každém tréninku</li>
  </ul>
</div>

<p style="text-align:center; color:#555; margin-top:30px;">
🔥 <b>Každý krok se počítá.</b><br/>
Dívej se na svůj pokrok s respektem – i malé změny dělají velké rozdíly.<br/>
<b>Tým Body & Mind ON 💙</b>
</p>
`
}

// ========== Hlavní funkce ==========

export async function generatePlan({
  // vstupy od uživatele
  name = '',
  gender = 'male',           // 'male' | 'female'
  age,
  height_cm,
  weight_kg,
  activity = 'stredne',      // sedavy|lehce|stredne|velmi|extra
  stress = 'medium',         // low|medium|high
  occupation = 'office_it',  // office_it|driver|warehouse|manual|healthcare|teacher_sales|gastronomy
  goal = 'udrzovani',        // redukce|udrzovani|nabirani_svaly
  weekly_sessions = 3,       // 0..7
  preferences = '',          // vegetarián apod. (volitelné)

  // systém
  openaiApiKey = process.env.OPENAI_API_KEY,
  model = 'gpt-4o-mini',
}) {
  if (!openaiApiKey) throw new Error('Chybí OPENAI_API_KEY')

  // 1) Výpočty
  const bmr = calcBMR({ gender, weight_kg, height_cm, age })
  const tdeeBase = bmr * (ACTIVITY_FACTOR[activity] || ACTIVITY_FACTOR.stredne)
  const tdeeOcc = tdeeBase * (OCCUPATION_FACTOR[occupation] || 1.0)
  const tdeeStress = tdeeOcc * (STRESS_FACTOR[stress] || 1.0)
  const tdeeTrain = tdeeStress * trainingFactor(weekly_sessions)
  const targetCalories = round50(applyGoal(tdeeTrain, goal))

  const { protein_g, fat_g, carbs_g } = splitMacros({
    calories: targetCalories,
    weight_kg,
    gender,
    stress,
    weeklySessions: weekly_sessions,
  })

  // 2) Labely pro HTML (hezká čeština)
  const ACTIVITY_LABEL = {
    sedavy: 'Sedavý',
    lehce: 'Mírně aktivní',
    stredne: 'Středně aktivní',
    velmi: 'Velmi aktivní',
    extra: 'Extra aktivní',
  }
  const STRESS_LABEL = { low: 'Nízká', medium: 'Střední', high: 'Vysoká' }
  const JOB_LABEL = {
    office_it: 'Kancelář / IT', driver: 'Řidič', warehouse: 'Sklad',
    manual: 'Manuální', healthcare: 'Zdravotnictví',
    teacher_sales: 'Obchod / Učitel', gastronomy: 'Gastronomie',
  }
  const GOAL_LABEL = {
    redukce: 'Redukce hmotnosti',
    udrzovani: 'Udržování',
    nabirani_svaly: 'Nárůst svalů',
  }

  // 3) Prompt – systém + HTML skeleton + požadavek na doplnění tabulek/rozpisů
  const system = buildSystemPrompt()
  const userHtml = buildUserPromptHTML({
    age, height_cm, weight_kg,
    activityLabel: ACTIVITY_LABEL[activity] || '—',
    stressLabel: STRESS_LABEL[stress] || '—',
    jobLabel: JOB_LABEL[occupation] || '—',
    goalLabel: GOAL_LABEL[goal] || '—',
    weeklySessions: weekly_sessions,
    calories: targetCalories,
    protein_g, carbs_g, fat_g,
  })

  const userTask = `
Doplň do šablony:
- {{weekly_meal_plan}} nahraď tabulkou 7 řádků (Po–Ne), každá buňka krátký pokrm + množství v gramech.
- {{workout_day_1..5}} nahraď konkrétními tréninky (45–60 min, split podle úrovně).
- Zohledni preference: ${preferences || '—'}.
- Piš česky, empaticky, přirozeně. Nepřidávej nic mimo HTML.
` .trim()

  const openai = new OpenAI({ apiKey: openaiApiKey })
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userHtml },
      { role: 'user', content: userTask },
    ],
  })

  let html = (completion.choices?.[0]?.message?.content || '').trim()
  // Malé čištění (odstranění případných backticks)
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
  }

  return {
    html,
    metrics: {
      bmr: Math.round(bmr),
      tdee: Math.round(tdeeTrain),
      calories: targetCalories,
      protein_g,
      carbs_g,
      fat_g,
    },
  }
}

// ========== Volitelné uložení do Supabase ==========

export async function savePlanToSupabase({
  supabase,          // importovaný client z lib/supabaseClient
  email,             // komu patří plán
  plan_html,         // výstup z generatePlan().html
  daily_calories,    // číslo
  macros = {},       // { protein_g, carbs_g, fat_g }
  generated_by = 'gpt-4o-mini',
}) {
  if (!supabase) throw new Error('Chybí supabase client')
  if (!email) throw new Error('Chybí email')

  const { data, error } = await supabase
    .from('ai_generated_plans')
    .insert([{
      email,
      plan_html,
      daily_calories: asNum(daily_calories),
      macros,
      generated_by,
      is_active: true,
    }])
    .select('*')

  if (error) throw error
  return data?.[0]
}
