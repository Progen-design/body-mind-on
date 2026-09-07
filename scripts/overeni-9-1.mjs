// Overeni bodu 9.1: cile pro presne ty profily, na kterych se audit delal.
import { calculateNutritionTargets, bmrMifflinStJeor } from '../lib/nutritionTargets.js';

const profily = [
  { n:'u01 zena 32/168/72', gender:'female', height_cm:168, age:32, weight_kg:72, activity:'sedavy',  dny:3, tdee:2246 },
  { n:'u02 muz  38/183/95', gender:'male',   height_cm:183, age:38, weight_kg:95, activity:'sedavy',  dny:4, tdee:2959 },
  { n:'u03 zena 24/172/58', gender:'female', height_cm:172, age:24, weight_kg:58, activity:'velmi',   dny:5, tdee:2130 },
  { n:'u05 zena 57/160/79', gender:'female', height_cm:160, age:57, weight_kg:79, activity:'sedavy',  dny:2, tdee:2083 },
  { n:'u06 muz  27/190/72', gender:'male',   height_cm:190, age:27, weight_kg:72, activity:'sedavy',  dny:4, tdee:2755 },
  { n:'u08 muz  43/176/110',gender:'male',   height_cm:176, age:43, weight_kg:110,activity:'sedavy',  dny:3, tdee:3085 },
  { n:'u09 zena 22/158/50', gender:'female', height_cm:158, age:22, weight_kg:50, activity:'velmi',   dny:5, tdee:1886 },
];

const cile = ['redukce', 'udrzovani', 'nabirani_svaly'];

console.log('=== A) KALORIE: cil vs TDEE (zaporne = deficit) ===');
for (const p of profily) {
  const radky = cile.map((goal) => {
    const t = calculateNutritionTargets({
      bodyMetrics: { ...p, calories_target: null }, goal, activity: p.activity, workoutDays: Array(p.dny).fill(1),
    });
    return `${goal.padEnd(15)} ${String(t.calories_target).padStart(5)}`;
  });
  console.log(`${p.n.padEnd(22)} TDEE~${p.tdee}   ${radky.join('   ')}`);
}

console.log('\n=== B) SMER: dela redukce deficit a nabirani prebytek? ===');
let chyby = 0;
for (const p of profily) {
  const bmr = bmrMifflinStJeor({ weightKg: p.weight_kg, heightCm: p.height_cm, age: p.age, gender: p.gender });
  const pal = p.activity === 'velmi' ? 1.725 : p.activity === 'stredne' ? 1.55 : 1.375;
  const tdee = Math.round(bmr * pal);
  for (const goal of ['redukce', 'nabirani_svaly']) {
    const t = calculateNutritionTargets({
      bodyMetrics: { ...p, calories_target: null }, goal, activity: p.activity, workoutDays: Array(p.dny).fill(1),
    });
    const d = t.calories_target - tdee;
    const ok = goal === 'redukce' ? d < 0 : d > 0;
    if (!ok) { chyby += 1; console.log(`  CHYBA ${p.n} ${goal}: cil ${t.calories_target}, TDEE ${tdee}, rozdil ${d}`); }
  }
}
console.log(chyby === 0 ? '  OK - vsech 14 kombinaci ma spravny smer' : `  ${chyby} spatnych`);

console.log('\n=== C) LOW_CARB: podil sacharidu na energii ===');
for (const dieta of [null, 'low_carb', 'vegetarian']) {
  const t = calculateNutritionTargets({
    bodyMetrics: { gender:'female', height_cm:165, age:34, weight_kg:63, activity:'stredne', diet_type: dieta, calories_target: null },
    goal: 'udrzovani', activity: 'stredne', workoutDays: [1,2,3],
  });
  const kcal = t.calories_target;
  const pS = Math.round(100 * t.carbs_g * 4 / kcal);
  const pT = Math.round(100 * t.fat_g * 9 / kcal);
  const pB = Math.round(100 * t.protein_g * 4 / kcal);
  const soucet = t.protein_g*4 + t.carbs_g*4 + t.fat_g*9;
  console.log(`  ${String(dieta).padEnd(12)} ${kcal} kcal   B ${t.protein_g}g/${pB}%  S ${t.carbs_g}g/${pS}%  T ${t.fat_g}g/${pT}%   soucet maker ${soucet} kcal`);
}

console.log('\n=== D) PODLAHA drzi i pri redukci u malych lidi? ===');
for (const p of [profily[6], profily[3]]) {
  const t = calculateNutritionTargets({
    bodyMetrics: { ...p, calories_target: null }, goal: 'redukce', activity: p.activity, workoutDays: Array(p.dny).fill(1),
  });
  const bmr = bmrMifflinStJeor(p);
  const podlaha = Math.max(p.gender === 'female' ? 1200 : 1500, Math.round(0.8 * bmr));
  console.log(`  ${p.n}  cil ${t.calories_target}  podlaha ${podlaha}  ${t.calories_target >= podlaha ? 'OK' : 'POD PODLAHOU'}`);
}

console.log('\n=== E) ULOZENY CIL ma prednost (nesmi se prepocitat) ===');
const ulozeny = calculateNutritionTargets({
  bodyMetrics: { gender:'male', height_cm:180, age:35, weight_kg:85, activity:'stredne', calories_target: 2777 },
  goal: 'redukce', activity: 'stredne', workoutDays: [1,2,3],
});
console.log(`  ulozeno 2777 -> vraceno ${ulozeny.calories_target}  ${ulozeny.calories_target === 2777 ? 'OK' : 'PREPOCITALO SE!'}`);

console.log('\n=== F) BEZ VYSKY/VEKU spadne na starou heuristiku, nespadne ===');
const bezVysky = calculateNutritionTargets({
  bodyMetrics: { gender:'male', weight_kg:85, activity:'stredne', calories_target: null },
  goal: 'udrzovani', activity: 'stredne', workoutDays: [1,2,3],
});
console.log(`  cil ${bezVysky.calories_target} (stara heuristika 85*30*1,0 = 2550)  ${bezVysky.calories_target > 0 ? 'OK' : 'CHYBA'}`);
