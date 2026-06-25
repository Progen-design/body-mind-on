function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mealTypeToEn(value) {
  const t = normalizeText(value);
  if (t === 'snidane' || t === 'breakfast') return 'breakfast';
  if (t === 'obed' || t === 'lunch') return 'lunch';
  if (t === 'vecere' || t === 'dinner') return 'dinner';
  if (t === 'svacina' || t === 'snack') return 'snack';
  return 'lunch';
}

export const SIMPLE_START_RECIPES = [
  {
    key: 'vejce-pecivo-zelenina',
    title: 'Vejce s pečivem a zeleninou',
    meal_type: 'breakfast',
    ingredients: ['vejce 3 ks', 'celozrnné pečivo 2 plátky', 'rajče 1 ks', 'okurka 1/2 ks'],
    instructions: [
      'Uvař vejce natvrdo nebo je připrav míchaná na pánvi.',
      'Nakrájej rajče a okurku na kousky.',
      'Připrav si celozrnné pečivo.',
      'Dej vejce na talíř se zeleninou.',
      'Lehce osol a opepři podle chuti.',
      'Podávej hned jako rychlou snídani.',
    ],
    calories: 450,
    protein_g: 24,
    carbs_g: 38,
    fat_g: 22,
  },
  {
    key: 'ryze-vejce-zelenina',
    title: 'Rýže s vejcem a zeleninou',
    meal_type: 'lunch',
    ingredients: ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Zeleninu nakrájej na menší kousky.',
      'Na pánvi rozehřej trochu oleje.',
      'Přidej zeleninu a krátce ji orestuj.',
      'Přidej vejce a míchej, dokud se nesrazí.',
      'Vmíchej rýži, dochuť solí a pepřem a podávej.',
    ],
    calories: 540,
    protein_g: 24,
    carbs_g: 64,
    fat_g: 20,
  },
  {
    key: 'vejce-natvrdo-zelenina',
    title: 'Vejce natvrdo se zeleninou',
    meal_type: 'snack',
    ingredients: ['vejce 2 ks', 'rajče 1 ks', 'okurka 1/2 ks', 'olivový olej 1 lžička'],
    instructions: [
      'Dej vejce do vroucí vody a vař asi 9 minut.',
      'Vejce zchlaď ve studené vodě a oloupej.',
      'Nakrájej rajče a okurku na kousky.',
      'Rozlož vejce a zeleninu na talíř.',
      'Zakápni olejem a lehce osol.',
      'Sněz jako rychlou svačinu.',
    ],
    calories: 260,
    protein_g: 16,
    carbs_g: 8,
    fat_g: 18,
  },
  {
    key: 'tvarohova-miska',
    title: 'Tvarohová miska',
    meal_type: 'dinner',
    ingredients: ['tvaroh 250 g', 'banán 1 ks', 'mandle 15 g'],
    instructions: [
      'Dej tvaroh do misky.',
      'Nakrájej banán na kolečka.',
      'Přidej banán do tvarohu.',
      'Mandle nasekej nebo nech celé.',
      'Posyp mandlemi tvaroh.',
      'Podávej hned, případně dochutí solí nebo skořicí.',
    ],
    calories: 420,
    protein_g: 34,
    carbs_g: 32,
    fat_g: 14,
  },
  {
    key: 'ovesna-kase-protein',
    title: 'Ovesná kaše s proteinem',
    meal_type: 'breakfast',
    ingredients: ['ovesné vločky 60 g', 'mléko 200 ml', 'protein 30 g', 'banán 1 ks'],
    instructions: [
      'Vločky vsyp do hrnce s mlékem.',
      'Za stálého míchání povař do zhoustnutí.',
      'Odstav z plotny a nech chvíli vychladnout.',
      'Vmíchej protein, dokud se nerozpustí.',
      'Nakrájej banán a přidej do kaše.',
      'Podávej teplé hned po dochucení.',
    ],
    calories: 480,
    protein_g: 33,
    carbs_g: 59,
    fat_g: 12,
  },
  {
    key: 'cocka-s-vejcem',
    title: 'Čočka s vejcem',
    meal_type: 'lunch',
    ingredients: ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g'],
    instructions: [
      'Čočku propláchni a uvař do měkka podle návodu.',
      'Zeleninu nakrájej na menší kousky.',
      'Vejce uvař natvrdo nebo připrav míchaná.',
      'Čočku sceď a dej do mísy nebo na talíř.',
      'Přidej zeleninu a vejce.',
      'Lehce osol, opepři a podávej teplé.',
    ],
    calories: 550,
    protein_g: 32,
    carbs_g: 58,
    fat_g: 16,
  },
  {
    key: 'kefir-pecivo',
    title: 'Kefír a pečivo',
    meal_type: 'snack',
    ingredients: ['kefír 400 ml', 'celozrnné pečivo 2 plátky'],
    instructions: [
      'Kefír nalij do sklenice nebo misky.',
      'Pečivo si připrav na talíř.',
      'Podávej jako rychlou svačinu bez další přípravy.',
      'Pokud chceš, pečivo lehce opeč v toustovači.',
      'Svačinu sněz do hodiny od přípravy.',
    ],
    calories: 320,
    protein_g: 16,
    carbs_g: 40,
    fat_g: 10,
  },
  {
    key: 'cottage-talir',
    title: 'Cottage talíř',
    meal_type: 'snack',
    ingredients: ['cottage 200 g', 'rajče 1 ks', 'okurka 1/2 ks', 'celozrnné pečivo 1 plátek'],
    instructions: [
      'Dej cottage na talíř nebo do misky.',
      'Nakrájej rajče a okurku na kousky.',
      'Zeleninu přidej ke cottage.',
      'Připrav si plátek celozrnného pečiva.',
      'Lehce osol a opepři podle chuti.',
      'Podávej jako studenou svačinu.',
    ],
    calories: 330,
    protein_g: 24,
    carbs_g: 26,
    fat_g: 13,
  },
  {
    key: 'cottage-pecivo',
    title: 'Cottage s pečivem',
    meal_type: 'snack',
    ingredients: ['cottage 180 g', 'celozrnné pečivo 2 plátky', 'okurka 1/2 ks'],
    instructions: [
      'Dej cottage do misky nebo na talíř.',
      'Okurku nakrájej na kolečka nebo kousky.',
      'Přidej zeleninu ke cottage.',
      'Připrav si celozrnné pečivo.',
      'Lehce osol a opepři podle chuti.',
      'Sněz jako rychlé studené jídlo bez další přípravy.',
    ],
    calories: 340,
    protein_g: 23,
    carbs_g: 32,
    fat_g: 12,
  },
  {
    key: 'fazole-ryze',
    title: 'Fazole s rýží',
    meal_type: 'lunch',
    ingredients: ['fazole 200 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Fazole ohřej na pánvi nebo v hrnci.',
      'Zeleninu nakrájej a krátce orestuj na oleji.',
      'Smíchej rýži s fazolemi a zeleninou.',
      'Dochuť solí a pepřem.',
      'Podávej teplé hned po dochucení.',
    ],
    calories: 590,
    protein_g: 22,
    carbs_g: 86,
    fat_g: 16,
  },
  {
    key: 'testoviny-kure',
    title: 'Těstoviny s kuřetem',
    meal_type: 'lunch',
    ingredients: ['těstoviny 80 g', 'kuřecí prsa 150 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař těstoviny podle návodu na obalu.',
      'Kuřecí prsa nakrájej na menší kousky.',
      'Osol, opepři a opeč na pánvi s trochou oleje.',
      'Přidej zeleninu a krátce prohřej.',
      'Smíchej s uvařenými těstovinami.',
      'Podávej teplé; případně si část nech do krabičky.',
    ],
    calories: 640,
    protein_g: 43,
    carbs_g: 68,
    fat_g: 18,
  },
  {
    key: 'jogurt-ovoce',
    title: 'Jogurt s ovocem',
    meal_type: 'snack',
    ingredients: ['jogurt 180 g', 'banán 1 ks', 'jahody 80 g'],
    instructions: [
      'Dej jogurt do misky.',
      'Banán nakrájej na kolečka.',
      'Jahody omyj a nakrájej.',
      'Ovoce přidej do jogurtu.',
      'Lehce promíchej.',
      'Podávej hned jako rychlou svačinu.',
    ],
    calories: 220,
    protein_g: 14,
    carbs_g: 28,
    fat_g: 6,
  },
  {
    key: 'kure-ryze-zelenina',
    title: 'Kuře s rýží a zeleninou',
    meal_type: 'lunch',
    ingredients: ['kuřecí prsa 150 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Kuřecí prsa nakrájej na kousky.',
      'Osol, opepři a opeč na pánvi s olejem.',
      'Přidej zeleninu a krátce prohřej.',
      'Podávej s hotovou rýží na talíři.',
      'Dochuť solí a pepřem podle chuti.',
    ],
    calories: 620,
    protein_g: 42,
    carbs_g: 65,
    fat_g: 16,
  },
  {
    key: 'testoviny-tunak',
    title: 'Těstoviny s tuňákem',
    meal_type: 'lunch',
    ingredients: ['těstoviny 80 g', 'tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g'],
    instructions: [
      'Uvař těstoviny podle návodu na obalu.',
      'Tuňáka sceď a rozmělní vidličkou.',
      'Zeleninu nakrájej na menší kousky.',
      'Smíchej těstoviny s tuňákem a zeleninou.',
      'Lehce osol a opepři.',
      'Podávej hned, ideálně teplé.',
    ],
    calories: 600,
    protein_g: 38,
    carbs_g: 68,
    fat_g: 14,
  },
  {
    key: 'brambory-vejce',
    title: 'Brambory s vejcem',
    meal_type: 'dinner',
    ingredients: ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g'],
    instructions: [
      'Brambory oloupej, nakrájej a uvař do měkka.',
      'Vejce uvař natvrdo nebo připrav míchaná.',
      'Zeleninu nakrájej na kousky.',
      'Brambory sceď a dej na talíř.',
      'Přidej vejce a zeleninu.',
      'Lehce osol, opepři a podávej teplé.',
    ],
    calories: 500,
    protein_g: 20,
    carbs_g: 52,
    fat_g: 22,
  },
  {
    key: 'omeleta-zelenina',
    title: 'Omeleta se zeleninou',
    meal_type: 'dinner',
    ingredients: ['vejce 3 ks', 'zelenina 200 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Vejce rozšlehej v misce se špetkou soli.',
      'Zeleninu nakrájej na menší kousky.',
      'Na pánvi rozehřej olej a orestuj zeleninu.',
      'Zalij vejci a nech ztuhnout zespodu.',
      'Opatrně otoč nebo dopeč pod pokličkou.',
      'Podávej teplou omeletu hned z pánve.',
    ],
    calories: 480,
    protein_g: 32,
    carbs_g: 18,
    fat_g: 28,
  },
  {
    key: 'tunak-salat-pecivo',
    title: 'Tuňákový salát s pečivem',
    meal_type: 'dinner',
    ingredients: ['tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g', 'celozrnné pečivo 2 plátky'],
    instructions: [
      'Tuňáka sceď a dej do misky.',
      'Zeleninu nakrájej na kousky.',
      'Smíchej tuňáka se zeleninou.',
      'Lehce osol a opepři podle chuti.',
      'Připrav si celozrnné pečivo.',
      'Podávej jako rychlou večeři hned po smíchání.',
    ],
    calories: 520,
    protein_g: 36,
    carbs_g: 42,
    fat_g: 18,
  },
  {
    key: 'sunka-syr-pecivo',
    title: 'Šunka, sýr, pečivo a zelenina',
    meal_type: 'breakfast',
    ingredients: ['šunka 60 g', 'sýr 2 plátky', 'celozrnné pečivo 2 plátky', 'zelenina 100 g'],
    instructions: [
      'Připrav si plátky celozrnného pečiva.',
      'Na pečivo dej šunku a sýr.',
      'Zeleninu nakrájej na kousky.',
      'Podávej sendvič se zeleninou navíc.',
      'Lehce dochutí solí a pepřem, pokud chceš.',
      'Sněz hned jako rychlou snídani.',
    ],
    calories: 420,
    protein_g: 22,
    carbs_g: 35,
    fat_g: 18,
  },
];

const SIMPLE_START_INDEX = new Map(
  SIMPLE_START_RECIPES.map((recipe) => [
    `${mealTypeToEn(recipe.meal_type)}::${normalizeText(recipe.title)}`,
    recipe,
  ])
);

const SIMPLE_START_TITLE_INDEX = new Map(
  SIMPLE_START_RECIPES.map((recipe) => [normalizeText(recipe.title), recipe])
);

export function findSimpleStartRecipeByTitle(title, mealType = null) {
  const normTitle = normalizeText(title);
  if (!normTitle) return null;
  if (mealType) {
    const exact = SIMPLE_START_INDEX.get(`${mealTypeToEn(mealType)}::${normTitle}`);
    if (exact) return exact;
  }
  return SIMPLE_START_TITLE_INDEX.get(normTitle) || null;
}

export function hasSimpleStartRecipeTitle(title, mealType = null) {
  return !!findSimpleStartRecipeByTitle(title, mealType);
}

export function buildSimpleStartLibraryMeal(title, mealType, options = {}) {
  const recipe = findSimpleStartRecipeByTitle(title, mealType);
  if (!recipe) return null;
  const sourceTitle = String(title || '').trim();
  const displayName = sourceTitle || recipe.title;
  const safeImageUrl = typeof options.image_url === 'string' && options.image_url.trim()
    ? options.image_url.trim()
    : null;
  return {
    type: mealTypeToEn(mealType || recipe.meal_type),
    name_cs: displayName,
    ai_name: null,
    display_name_cs: displayName,
    display_name: displayName,
    planner_suggestion_cs:
      sourceTitle && sourceTitle !== recipe.title ? sourceTitle : null,
    recipe_verified: true,
    kcal: recipe.calories,
    protein_g: recipe.protein_g,
    carbs_g: recipe.carbs_g,
    fat_g: recipe.fat_g,
    recipe_id: null,
    catalog_id: null,
    catalog_source: 'simple_start_library',
    spoonacular_id: null,
    spoonacular_url: null,
    external_url: null,
    source_url: null,
    shopping_ingredient_lines: [...recipe.ingredients],
    simple_instructions_cs: [...recipe.instructions],
    image_url: safeImageUrl,
    image_trust_level: safeImageUrl ? 'illustrative' : 'none',
    recipe: {
      id: null,
      title: displayName,
      title_cs: displayName,
      image: safeImageUrl,
      source_url: null,
      sourceUrl: null,
      ready_in_minutes: 15,
      calories: recipe.calories,
      protein_g: recipe.protein_g,
      carbs_g: recipe.carbs_g,
      fat_g: recipe.fat_g,
      source: 'simple_start_library',
      portion_multiplier: 1,
      ingredients: [...recipe.ingredients],
      instructions: recipe.instructions.join('\n'),
      instructions_cs: recipe.instructions.join('\n'),
    },
    planner_source: options.planner_source || null,
  };
}
