-- Tukový strop pro objednávku generovaného receptu — docs/DALSI_KROK.md 8.8.
--
-- PROČ. 8.4 dalo tuku vazbu na cíl při VÝBĚRU jídla, ale změřilo, že to
-- nestačí — řazení nevybere recept, který v katalogu není. Recepty vyrobené
-- za posledních 48 h (37 kusů, 3. 9. 2026): bílkoviny 32 % kalorií (funguje,
-- má protein_hint), tuk 45 % kalorií (žádný cíl na tuk neexistuje). Cíl
-- systému je 27–28 % (docs/BMON_MAKRA_V_GENERATORU.md bod 4). Dokud generátor
-- cíl na tuk nezná, každý den katalog zhoršuje.
--
-- PROČ NE JSON JAKO protein_hint. Bílkovinový hint nese dvě věci (zdroj
-- suroviny + podíl), tuk jen jedno číslo — horní mez. Prostý `numeric`,
-- žádné parsování, žádné kanonické pořadí klíčů.
--
-- PROČ SLOUPEC MÁ DEFAULT, protein_hint NE. `protein_hint IS NULL` má u
-- bílkovin smysl: generátor si hint při čtení fronty odvodí sám z rozložení
-- katalogu (lib/plan/rotaceBilkovin.js), takže i řádek založený mimo JS
-- (SQL funkcí `fill_recipe_queue_from_demand`, která protein_hint vůbec
-- nenastavuje — známá, akceptovaná mezera z 8.5) dostane hint při čtení.
-- Tuk žádnou takovou "odvoď z katalogu" cestu nemá. Bez DEFAULTu by řádky
-- založené SQL funkcí zůstaly bez cíle na tuk úplně stejně jako dnes — DEFAULT
-- zavírá tuhle mezeru na úrovni sloupce, aniž by bylo nutné sahat do
-- `fill_recipe_queue_from_demand`.
--
-- Hodnota DEFAULTu (0.30) MUSÍ sedět s `VYCHOZI_STROP_TUKU_OBJEDNAVKY`
-- v lib/plan/fatHint.js — tam je i zdůvodnění čísla. Test
-- `lib/__tests__/fatHint.test.mjs` hlídá, že se SQL a JS nerozejdou, stejným
-- vzorem, jakým `frontaSlucovani.test.mjs` hlídá kanonické kalorické pásmo.
--
-- PROČ JE TO STROP, NE TVRDÁ VALIDACE. Kalorie a bílkoviny už v zapisRecept()
-- recept tvrdě zamítají (mimo_kaloricke_pasmo, pod_cilem_bilkovin). 8.5
-- změřilo, že přidání DALŠÍHO tvrdého kritéria bez stropu srazilo úspěšnost
-- z 69–73 % na 17–20 % a nad určitým prahem na 0 ze 145 — tři nezávislá tvrdá
-- kritéria najednou (kcal ∧ bílkoviny ∧ tuk) by měla čistě multiplikativní
-- účinek na propustnost, přesně to, před čím 8.8 varuje ("třetí tvrdá
-- podmínka je přesně to, co srazilo propustnost naposledy"). Tuk proto zůstává
-- jen zadání v promptu (`lib/recipeGenerator.js`, `buildGeneratorInput`) —
-- žádná nová podmínka v `zapisRecept()` (lib/recipeGeneratorRun.js).

alter table public.recipe_generation_queue
  add column if not exists fat_hint numeric default 0.30;

alter table public.recipe_generation_queue
  drop constraint if exists recipe_generation_queue_fat_hint_check;

alter table public.recipe_generation_queue
  add constraint recipe_generation_queue_fat_hint_check
  check (fat_hint is null or (fat_hint > 0 and fat_hint <= 1));

comment on column public.recipe_generation_queue.fat_hint is
  'Nejvýš tolik podílu kalorií z tuku (0..1) — ZADÁNÍ pro model v promptu, '
  'NE tvrdá validace při zápisu (na rozdíl od protein_hint). DEFAULT 0.30, '
  'musí sedět s VYCHOZI_STROP_TUKU_OBJEDNAVKY v lib/plan/fatHint.js. '
  'NULL jen u řádků založených před 8.8.';
