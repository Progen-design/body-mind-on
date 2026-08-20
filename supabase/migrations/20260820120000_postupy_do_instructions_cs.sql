-- Dorovnání postupů u vlastních receptů: `instructions` → `instructions_cs`.
--
-- PROČ. Generátor zapisoval postup jen do `instructions`, kdežto celá čtecí
-- cesta (`instructionLinesFromCatalogRow`, `recipeDetailFromCatalog`,
-- `mealDisplayModel`) sahá nejdřív po `instructions_cs`. Všech 337
-- llm_generated receptů proto vypadalo jako „recept bez postupu“ a v modalu
-- dostávalo generickou náhradu „Připrav suroviny podle seznamu.“
--
-- Přitom postupy existují, jsou české a konkrétní — model je píše podle
-- českého promptu. Recept 866 („Rychlá avokádová pomazánka“) měl celou dobu
-- uloženo: „Avokádo rozmačkej vidličkou v míse. / Přidej citronovou šťávu,
-- sůl a pepř… / Namaž pomazánku na celozrnný toast a podávej.“
--
-- Nejde tedy o chybějící data, ale o nepropojený sloupec. Kopie je proto
-- správná oprava — generovat postupy znovu přes model by stálo 337 volání
-- za obsah, který už máme.
--
-- Zdroj je omezený na `llm_generated`: u importu ze Spoonacularu je
-- `instructions` anglický originál a do českého sloupce nepatří.

update public.recipes_catalog
set instructions_cs = instructions,
    updated_at = now()
where source = 'llm_generated'
  and instructions_cs is null
  and instructions is not null
  and jsonb_typeof(instructions) = 'array'
  and jsonb_array_length(instructions) > 0;
