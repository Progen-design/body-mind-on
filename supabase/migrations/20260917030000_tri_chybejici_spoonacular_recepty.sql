-- PROMPT_PRO_CODE.md bod E (2026-09-17).
--
-- Tři jídla v aktivních produkčních plánech odkazují na Spoonacular ID, která
-- v recipes_catalog nejsou — detail receptu se uživateli nenačte
-- (lib/recipeDetailFromCatalog.js hledá podle source_id, ref viz níž).
--
--   644044  "Proteinové jahodové smoothie"
--   637705  "Jogurtový parfait s třešněmi"
--   716414  "Červenobílé palačinky"
--
-- Recepty jsou dopsané ručně (ne re-import ze Spoonacularu — ten už tahle ID
-- evidentně nemá / nikdy neměl aktivní), suroviny a makra podle stejných
-- pravidel jako PROMPT_PRO_CODE.md bod C: `kcal` = 4*protein_g + 4*carbs_g +
-- 9*fat_g přesně, dopočteno ze surovin, ne odhadem.
--
-- NESAHÁ na plány uživatelů, kteří na tahle ID odkazují — jen doplňuje
-- chybějící řádky katalogu, na které se ta ID teď napojí sama přes source_id.

insert into public.recipes_catalog (
  source, source_id, name_cs, name_en, meal_type,
  kcal, protein_g, carbs_g, fat_g, diet_tags, servings,
  ingredients, instructions, instructions_cs,
  nutrition_source, active
) values
(
  'manual', '644044', 'Proteinové jahodové smoothie', 'Strawberry Protein Smoothie', 'snidane',
  377, 32, 51, 5, ARRAY['vegetarian'], 1,
  '[
    {"name": "jahody", "amount": 150, "unit": "g", "original": "jahody 150 g"},
    {"name": "banán", "amount": 1, "unit": "ks", "original": "banán 1 ks (120 g)"},
    {"name": "proteinový prášek", "amount": 30, "unit": "g", "original": "proteinový prášek 30 g"},
    {"name": "mléko", "amount": 200, "unit": "ml", "original": "mléko 200 ml"}
  ]'::jsonb,
  '["Jahody omyj a odstopkuj.", "Banán oloupej a nakrájej na kousky.", "Vše dej do mixéru s mlékem a proteinem.", "Rozmixuj do hladka.", "Podávej hned jako rychlou snídani nebo svačinu."]'::jsonb,
  '["Jahody omyj a odstopkuj.", "Banán oloupej a nakrájej na kousky.", "Vše dej do mixéru s mlékem a proteinem.", "Rozmixuj do hladka.", "Podávej hned jako rychlou snídani nebo svačinu."]'::jsonb,
  'computed_from_ingredients', true
),
(
  'manual', '637705', 'Jogurtový parfait s třešněmi', 'Cherry Yogurt Parfait', 'svacina',
  323, 25, 49, 3, ARRAY['vegetarian'], 1,
  '[
    {"name": "řecký jogurt bílý", "amount": 200, "unit": "g", "original": "řecký jogurt bílý 200 g"},
    {"name": "třešně", "amount": 100, "unit": "g", "original": "třešně (vypeckované) 100 g"},
    {"name": "ovesné vločky", "amount": 30, "unit": "g", "original": "ovesné vločky 30 g"},
    {"name": "med", "amount": 10, "unit": "g", "original": "med 10 g"}
  ]'::jsonb,
  '["Třešně omyj a vypeckuj.", "Do sklenice nebo misky střídej vrstvy jogurtu, ovesných vloček a třešní.", "Polij medem.", "Podávej hned jako svačinu bez vaření."]'::jsonb,
  '["Třešně omyj a vypeckuj.", "Do sklenice nebo misky střídej vrstvy jogurtu, ovesných vloček a třešní.", "Polij medem.", "Podávej hned jako svačinu bez vaření."]'::jsonb,
  'computed_from_ingredients', true
),
(
  'manual', '716414', 'Červenobílé palačinky', 'Red and White Pancakes', 'snidane',
  486, 28, 62, 14, ARRAY['vegetarian'], 1,
  '[
    {"name": "hladká mouka", "amount": 60, "unit": "g", "original": "hladká mouka 60 g"},
    {"name": "vejce", "amount": 1, "unit": "ks", "original": "vejce 1 ks"},
    {"name": "mléko", "amount": 100, "unit": "ml", "original": "mléko 100 ml"},
    {"name": "tvaroh", "amount": 100, "unit": "g", "original": "tvaroh 100 g"},
    {"name": "jahody", "amount": 100, "unit": "g", "original": "jahody 100 g"}
  ]'::jsonb,
  '["Mouku, vejce a mléko smíchej na hladké těsto.", "Na pánvi usmaž tenké palačinky z obou stran.", "Tvaroh rozmíchej dohladka.", "Jahody nakrájej na kousky.", "Palačinky naplň tvarohem a jahodami a zaviň.", "Podávej hned, teplé i studené."]'::jsonb,
  '["Mouku, vejce a mléko smíchej na hladké těsto.", "Na pánvi usmaž tenké palačinky z obou stran.", "Tvaroh rozmíchej dohladka.", "Jahody nakrájej na kousky.", "Palačinky naplň tvarohem a jahodami a zaviň.", "Podávej hned, teplé i studené."]'::jsonb,
  'computed_from_ingredients', true
);
