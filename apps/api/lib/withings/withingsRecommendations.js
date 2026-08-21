// /lib/withings/withingsRecommendations.js

const DISCLAIMER = 'Nejde o lékařské vyhodnocení. Hodnoty z chytré váhy ber jako orientační fitness ukazatel.';

const FORBIDDEN_PATTERNS = [
  /diagnóz/i,
  /nemoc/i,
  /léč/i,
  /předepiš/i,
  /garantuj/i,
  /zaruč/i,
  /hladovka/i,
  /vynech.*jíd/i,
  /extrémní/i,
  /riziko.*srdeční/i,
  /cukrovk/i,
  /hypertenz/i,
];

function normalizeGoal(userGoal) {
  const g = String(userGoal || '').toLowerCase();
  if (/reduk|hubn|tuk|cut|loss/.test(g)) return 'reduction';
  if (/sval|gain|bulk|nárůst/.test(g)) return 'muscle_gain';
  return 'maintenance';
}

function pushRecommendation(list, type, title, text) {
  const entry = { type, title, text };
  const combined = `${title} ${text}`;
  if (FORBIDDEN_PATTERNS.some((re) => re.test(combined))) return;
  if (list.length >= 3) return;
  list.push(entry);
}

/**
 * Bezpečná fitness doporučení — žádná medicínská diagnostika.
 */
export function generateWithingsRecommendations({
  latest,
  trends,
  userGoal,
  trainingFrequency,
  nutritionTarget,
} = {}) {
  const goal = normalizeGoal(userGoal);
  const recommendations = [];
  const deltaWeight = trends?.delta?.weight_kg;
  const deltaFat = trends?.delta?.fat_percent;
  const deltaMuscle = trends?.delta?.muscle_mass_kg;
  const trend7Weight = trends?.trend7d?.weight_kg;
  const trend30Weight = trends?.trend30d?.weight_kg;

  let summary = 'Máme základní přehled z chytré váhy. Pokračuj v pravidelném měření ve stejnou denní dobu.';

  if (latest?.weight_kg != null && trends?.hasEnoughData) {
    if (goal === 'reduction') {
      if (Number.isFinite(trend7Weight) && trend7Weight < 0) {
        summary = 'Váha mírně klesá. Drž stabilní režim a sleduj, aby pokles nebyl příliš rychlý.';
      } else if (Number.isFinite(trend7Weight) && trend7Weight > 0) {
        summary = 'Váha mírně roste. Zkontroluj kalorický deficit a pravidelnost měření.';
      } else {
        summary = 'Váha je v posledním období stabilní. Pro redukci tuku drž konzistentní režim.';
      }
      pushRecommendation(recommendations, 'nutrition', 'Drž bílkoviny stabilně',
        'Pokud je cílem redukce tuku, drž pravidelný příjem bílkovin a nesnižuj příjem příliš agresivně.');
      if (Number.isFinite(deltaMuscle) && deltaMuscle < -0.3) {
        pushRecommendation(recommendations, 'training', 'Chraň svalovou hmotu',
          'Při redukci kombinuj silový trénink s dostatkem bílkovin, aby svalová hmota zůstala co nejvíc stabilní.');
      }
    } else if (goal === 'muscle_gain') {
      summary = Number.isFinite(deltaMuscle) && deltaMuscle > 0
        ? 'Svalová hmota mírně roste. Pokračuj v pravidelném tréninku a dostatečném příjmu energie.'
        : 'Svalová hmota je zatím stabilní. Pro nárůst drž postupný kalorický přebytek a silový trénink.';
      pushRecommendation(recommendations, 'nutrition', 'Dostatek energie a bílkovin',
        'Pro budování svalů měj dostatečný příjem bílkovin a energie kolem tréninkových dnů.');
      pushRecommendation(recommendations, 'training', 'Silový trénink pravidelně',
        'Drž konzistentní silový trénink 3–4× týdně podle svého plánu.');
    } else {
      summary = Number.isFinite(deltaWeight) && Math.abs(deltaWeight) <= 0.5
        ? 'Váha je stabilní. Dobrá základna pro udržení aktuální kondice.'
        : 'Sleduj trend váhy a drž stabilní režim stravy i tréninku.';
      pushRecommendation(recommendations, 'habits', 'Měř ve stejnou dobu',
        'Měř se ráno nebo večer stále stejně — chytrá váha lépe ukáže trend než jednotlivý den.');
    }

    if (Number.isFinite(deltaFat) && deltaFat < -0.2) {
      pushRecommendation(recommendations, 'progress', 'Tukový podíl klesá',
        'Podíl tělesného tuku mírně klesá. Pokračuj v konzistentním režimu, který ti sedí.');
    }
  }

  if (trainingFrequency) {
    pushRecommendation(recommendations, 'training', 'Drž frekvenci tréninku',
      `Tvůj plán počítá s ${trainingFrequency}. Pravidelnost je důležitější než jedno měření.`);
  }

  if (nutritionTarget) {
    pushRecommendation(recommendations, 'nutrition', 'Nutriční cíl z plánu',
      `Drž se orientačního cíle ${nutritionTarget} — chytrá váha pomáhá sledovat trend, ne nahrazovat plán.`);
  }

  const trimmed = recommendations.slice(0, 3);

  return {
    status: 'ok',
    summary,
    recommendations: trimmed,
    disclaimer: DISCLAIMER,
  };
}

export function recommendationsAreSafe(output) {
  const text = JSON.stringify(output || {});
  return !FORBIDDEN_PATTERNS.some((re) => re.test(text));
}
