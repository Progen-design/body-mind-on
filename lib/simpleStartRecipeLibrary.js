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
      'Připrav vejce podle zvyku (vařená nebo míchaná).',
      'Nakrájej zeleninu na talíř.',
      'Podávej s pečivem a dochuť solí a pepřem.',
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
      'Na pánvi připrav vejce a krátce přidej zeleninu.',
      'Smíchej rýži s vejci a zeleninou, zakápni olejem a podávej.',
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
      'Uvař vejce natvrdo a oloupej je.',
      'Nakrájej zeleninu na talíř.',
      'Přidej vejce, lehce osol a zakápni olejem.',
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
      'Nakrájej banán a přidej ho do tvarohu.',
      'Posyp mandlemi a podávej.',
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
      'Povař vločky v mléce do zhoustnutí.',
      'Po odstavení vmíchej protein.',
      'Přidej nakrájený banán a podávej.',
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
      'Uvař čočku do měkka.',
      'Připrav vejce podle zvyku.',
      'Podávej čočku s vejci a zeleninou.',
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
      'Nalij kefír do sklenice.',
      'Podávej s pečivem.',
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
      'Dej cottage na talíř.',
      'Přidej nakrájenou zeleninu.',
      'Podávej s pečivem.',
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
      'Připrav cottage do misky.',
      'Podávej s pečivem a zeleninou.',
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
      'Ohřej fazole a přidej zeleninu.',
      'Smíchej s rýží, zakápni olejem a podávej.',
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
      'Opeč kuřecí maso na pánvi.',
      'Přidej zeleninu, promíchej s těstovinami a podávej.',
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
      'Přidej nakrájené ovoce a promíchej.',
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
      'Opeč kuřecí maso na pánvi a přidej zeleninu.',
      'Podávej s rýží.',
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
      'Smíchej těstoviny s tuňákem a zeleninou.',
      'Podávej ihned.',
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
      'Uvař brambory do měkka.',
      'Připrav vejce podle zvyku.',
      'Podávej s nakrájenou zeleninou.',
    ],
    calories: 500,
    protein_g: 20,
    carbs_g: 52,
    fat_g: 22,
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

