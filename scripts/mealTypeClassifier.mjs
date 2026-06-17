/**
 * scripts/mealTypeClassifier.mjs
 * Sdílený OpenAI klasifikátor meal_type pro recipes_catalog.
 * Používá ho recategorizeMeals.mjs, seedRecipes.js i importRecipesFromMealCache.mjs,
 * aby seed/import i re-kategorizace měly identickou logiku.
 */

export const CATALOG_MEAL_TYPES = ['snidane', 'obed', 'vecere', 'svacina'];

const SYSTEM_PROMPT = `Jsi klasifikátor jídel pro fitness aplikaci. Pro každý recept urči správný meal_type.

PRAVIDLA (závazná, v tomto pořadí priority):
1. "snidane" = vejce, omelety, ovesná kaše (VŽDY snidane, bez ohledu na kcal), lívance/palačinky, toasty,
   jogurtový parfait / jogurt s granolou, smoothie bowl, müsli, tvaroh.
2. "svacina" = POUZE lehké jídlo: samotný jogurt, ovoce, dip, hummus, salsa, malý zeleninový salát bez masa,
   dezert, oříšky, proteinová tyčinka.
   NIKDY ne polévky, NIKDY ne rýžová/těstovinová/nudlová jídla (včetně makaronů se sýrem), NIKDY ne kari,
   NIKDY ne maso/ryba/krevety/mušle, NIKDY ne stir fry.
3. "obed" nebo "vecere" = hlavní jídla: maso/ryba s přílohou, rýže, těstoviny, kari, stir fry, rizoto,
   polévka jako hlavní chod, zapékaná jídla, salát s masem/rybou.
4. DŮLEŽITÉ — minimalizuj změny mezi obed a vecere: obě kategorie jsou hlavní jídla a jsou zaměnitelné.
   Pokud je current_meal_type "obed" nebo "vecere" a jídlo JE hlavní chod, VRAŤ current_meal_type beze změny.
   Mezi obed/vecere přeřazuj POUZE pokud jídlo vůbec není hlavní chod (pak patří do snidane/svacina).
5. Kalorie ber jen jako vodítko; dip/dezert je svačina i při vyšších kcal, polévka NENÍ svačina ani při nízkých kcal.

Odpověz POUZE validním JSON: {"results":[{"id":<id>,"meal_type":"snidane"|"obed"|"vecere"|"svacina"}, ...]}
— přesně jeden výsledek pro každý vstupní recept, stejná id jako ve vstupu.`;

const MAIN_DISH_PATTERN =
  /polévka|polevka|\bsoup\b|kari|curry|smažená rýže|fried rice|rizot|risotto|těstovin|testovin|\bpasta\b|makaron|mac and cheese|špaget|spaghetti|noodles|nudle|ramen|stir fry|maso s|kuře s|kuřecí prsa|steak|burger|lasagne|guláš|gulas|krevet|shrimp|mušle|mussels|škeble|clams|losos|salmon|tuňák|tuna|treska|\bcod\b/i;

const BREAKFAST_PATTERN =
  /ovesná kaše|ovesn[áé]|oatmeal|overnight oats|parfait|granola|müsli|muesli|omelet|lívance|livance|palačink|pancake|toast|smoothie bowl|scrambled|míchaná vejce|michana vejce/i;

/**
 * Deterministická pojistka po klasifikaci, i kdyby model rozhodl špatně:
 * - hlavní jídlo (polévka, kari, těstoviny, maso/ryba…) nesmí skončit ve svačině,
 * - snídaňová jídla (kaše, parfait, omeleta…) zůstávají snídaně.
 * @param {string} name – name_cs + name_en dohromady
 * @param {string} proposed
 * @param {string} [current] – aktuální meal_type (pro minimalizaci obed↔vecere přehozů)
 * @returns {string}
 */
export function enforceMealTypeGuards(name, proposed, current) {
  const n = String(name || '').toLowerCase();
  if (BREAKFAST_PATTERN.test(n)) return 'snidane';
  if (proposed === 'svacina' && MAIN_DISH_PATTERN.test(n)) {
    return current === 'obed' || current === 'vecere' ? current : 'obed';
  }
  // obed a vecere jsou zaměnitelné hlavní chody — bez silného důvodu neměnit.
  if ((proposed === 'obed' || proposed === 'vecere') && (current === 'obed' || current === 'vecere')) {
    return current;
  }
  return proposed;
}

/**
 * Klasifikuje dávku receptů přes OpenAI (chunky, strict JSON).
 * @param {import('openai').default} openai – instance OpenAI klienta
 * @param {Array<{id: number|string, name_cs?: string, name_en?: string, kcal?: number|null, protein_g?: number|null, carbs_g?: number|null, fat_g?: number|null}>} items
 * @param {{ model?: string, chunkSize?: number }} [opts]
 * @returns {Promise<Map<string, string>>} id (string) → meal_type; chybějící/nevalidní výsledky v mapě nejsou
 */
export async function classifyMealTypesWithOpenAI(openai, items, opts = {}) {
  const model = opts.model || process.env.MEAL_CLASSIFIER_MODEL || 'gpt-4o-mini';
  const chunkSize = Number(opts.chunkSize) > 0 ? Number(opts.chunkSize) : 20;
  const out = new Map();

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const payload = chunk.map((r) => ({
      id: r.id,
      name_cs: String(r.name_cs || '').slice(0, 100),
      name_en: String(r.name_en || '').slice(0, 100),
      kcal: r.kcal ?? null,
      protein_g: r.protein_g ?? null,
      carbs_g: r.carbs_g ?? null,
      fat_g: r.fat_g ?? null,
      current_meal_type: r.meal_type ?? null,
    }));

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ recipes: payload }) },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    for (const res of results) {
      const id = res?.id != null ? String(res.id) : '';
      const mt = String(res?.meal_type || '').toLowerCase().trim();
      if (!id || !CATALOG_MEAL_TYPES.includes(mt)) continue;
      const source = chunk.find((c) => String(c.id) === id);
      const nameForGuard = source ? `${source.name_cs || ''} ${source.name_en || ''}` : '';
      out.set(id, enforceMealTypeGuards(nameForGuard, mt, source?.meal_type));
    }
  }

  return out;
}
