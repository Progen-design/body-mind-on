-- Unikát fronty generátoru musí zahrnout `protein_hint`.
--
-- `recipe_gen_queue_unikat` stál na (meal_type, diet_tags, kcal_min, kcal_max)
-- a deduplikuje poptávku, aby se stejná díra v katalogu neobjednala desetkrát.
-- To je správně — jen ten klíč od 18. 8. 2026 nepopisuje objednávku celou.
--
-- „Oběd 450–650 na hovězí“ a „oběd 450–650 na vepřové“ jsou DVĚ RŮZNÉ
-- objednávky. Se starým klíčem druhá spadla na 23505:
--
--   duplicate key value violates unique constraint "recipe_gen_queue_unikat"
--   Key (meal_type, diet_tags, kcal_min, kcal_max)=(obed, {}, 450, 650)
--
-- Bez téhle změny by `protein_hint` nešlo použít na to, kvůli čemu vznikl:
-- doplnit najednou hovězí i vepřové ve stejném kalorickém pásmu.
--
-- Deduplikace zůstává. Dvě objednávky se stejným hintem a stejným pásmem se
-- pořád nepustí; přibyl jen rozměr, kterým se objednávky opravdu liší.
-- `coalesce(protein_hint, '')` proto, že NULL se v unikátním indexu nerovná
-- NULL — dvě položky bez hintu by jinak prošly obě a stará ochrana by zmizela.

drop index if exists public.recipe_gen_queue_unikat;

create unique index recipe_gen_queue_unikat
  on public.recipe_generation_queue
     (meal_type, diet_tags, kcal_min, kcal_max, coalesce(protein_hint, ''))
  where (stav = any (array['pending'::text, 'running'::text]));
