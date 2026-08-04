-- R5: vycisteni viditelneho smeti ze seznamu surovin (4 recepty, 5 radku).
--
-- ===========================================================================
-- PROC PRAVE TOHLE, KDYZ SE ZADNA METRIKA NEZLEPSI
-- ===========================================================================
-- Ze seznamu 107 "nespocitatelnych" receptu je tohle JEDINA cast, kterou
-- uzivatel opravdu vidi: v aplikaci se mu mezi surovinami zobrazi veta
-- z postupu nebo utaty text. Kvalitativni vada nezavisla na nutrici.
--
-- Zbytek te analyzy rika, ze 107 blokovanych neni defekt, ale artefakt
-- metriky (`complete` ma v repu jedine produkcni pouziti — zapis novych
-- receptu v lib/recipeGeneratorRun.js:224 — takze nehlida ani zobrazeni, ani
-- sestavovani jidelnicku). Tahle migrace proto zamerne nemiri na cislo, ale
-- na to, co je videt.
--
-- ===========================================================================
-- CO SE MENI A PROC PRAVE TAKHLE
-- ===========================================================================
-- Rozliseni je jednoduche: kdyz je za smetim SKUTECNA SUROVINA, prejmenuje se
-- na ni (mazat by znamenalo ztratit slozku jidla). Kdyz je to veta z postupu,
-- radek se smaze, protoze surovina to nikdy nebyla.
--
--   id 508  Frittata s chrestem a parmazanem — SMAZAT dva radky
--     "hrnec. odlomte a odhodte tvrde konce z"
--        <- "saucepan. Snap and discard tough ends from the"
--     "privedte k varu nekolik hrnku vody"  (236 ml!)
--        <- "quart Bring several water to a boil in a medium"
--     Oboji jsou utrzky postupu. Voda na blansirovani chrestu se navic sleva,
--     takze to neni ani slozka jidla.
--
--   id 644  Jednoducha vecere s vejcem — PREJMENOVAT na "cibule"
--     "onion or" <- "1 small sweet onion or / 1/2 large sweet onion"
--     Parser rozsekl vetu na spojce "or". Je to cibule; mnozstvi (0,5 "small")
--     zustava, jak ho spocital import — prepisuje se jen nazev.
--
--   id 614  Barevne testoviny s morskymi plody — PREJMENOVAT na "bazalka"
--     "to)" <- "1/4 cup to 1/2 basil (dependent on your taste), roll leaves..."
--     Z cele vety zbyla dve pismena a zavorka. Je to bazalka, 3 g.
--
--   id 80   Snidanova kase — PREJMENOVAT na "slehacka"
--     "lehce oslazena slehacka nebo" <- "1 servings lehce oslazena slehacka nebo"
--     Utaty nazev s visicim "nebo". Je to slehacka.
--     BONUS: tenhle recept je zaminovany PRESNE timhle nazvem — je jeho jediny
--     konflikt s tagem vegetarian. Po prejmenovani na slehacku (ve slovniku
--     vegetarianska) konflikt zmizi, takze se recept zaroven odminuje.
--     Overeno pred pushem: recipe_diet_conflicts vraci po zmene prazdne pole.
--
-- BEZPECNOST: u vsech ctyr je overeno, ze je trigger enforce_recipe_catalog_rules
-- nedeaktivuje. 508, 614 a 644 nemaji tag vegan ani vegetarian, takze se jich
-- brana (f) netyka; 80 branou projde diky tomu, ze zmena konflikt rusi.
-- count_main_ingredients zustava u vsech <= 10 a Atwater se nemeni (makra ani
-- ulozene kcal se nesahaji).
--
-- ULOZENE kcal SE NEPREPOCITAVA (samostatne rozhodnuti).

-- Stav PRED zmenou pro kontroly.
CREATE TEMP TABLE _pred ON COMMIT DROP AS
SELECT r.id, r.active, c.complete, jsonb_array_length(r.ingredients) AS surovin
FROM public.recipes_catalog r
CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
WHERE r.active;

-- ---------------------------------------------------------------------------
-- 1. id 508 — smazani dvou utrzku postupu
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog r SET
  ingredients = (
    SELECT jsonb_agg(t.i ORDER BY t.ord)
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(i, ord)
    WHERE t.i->>'name' NOT IN ('hrnec. odlomte a odhoďte tvrdé konce z',
                               'přiveďte k varu několik hrnků vody')
  )
WHERE r.id = 508
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.ingredients) e
               WHERE e->>'name' IN ('hrnec. odlomte a odhoďte tvrdé konce z',
                                    'přiveďte k varu několik hrnků vody'));

-- ---------------------------------------------------------------------------
-- 2. Prejmenovani tam, kde za smetim je skutecna surovina
-- ---------------------------------------------------------------------------
-- Prepisuje se `name` I `name_en`. Neni to kosmetika:
-- count_main_ingredients() cte COALESCE(name_en, name, nameClean), tedy
-- name_en MA PREDNOST. Prepsat jen `name` by u receptu 614 nestacilo — a
-- prvni verze teto migrace na tom spadla, viz komentar u 614 nize.
UPDATE public.recipes_catalog r SET
  ingredients = (
    SELECT jsonb_agg(
             CASE WHEN t.i->>'name' = 'onion or'
                  THEN jsonb_set(jsonb_set(t.i, '{name}', '"cibule"'::jsonb), '{name_en}', '"onion"'::jsonb)
                  ELSE t.i END ORDER BY t.ord)
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(i, ord)
  )
WHERE r.id = 644
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.ingredients) e WHERE e->>'name' = 'onion or');

-- id 614 — POZOR, TENHLE RECEPT JE ZAMINOVANY JINOU BRANOU NEZ OSTATNI.
-- Ma count_main_ingredients = 11 pri limitu 10, takze brana (c) ho deaktivuje
-- pri JAKEMKOLI updatu. Prepis samotneho `name` na bazalku pocet nezmenil
-- (cte se name_en) a migrace spravne spadla. Prepis name_en na "basil" je
-- vecne spravny (je to bazalka) a pocet klesne na 10, protoze 'basil' je
-- v pantry — takze brana projde. Neni to obejiti limitu: radek se prestal
-- pocitat mezi hlavni suroviny proto, ze se z utrzku "to)" stalo koreni,
-- kterym vzdycky byl.
UPDATE public.recipes_catalog r SET
  ingredients = (
    SELECT jsonb_agg(
             CASE WHEN t.i->>'name' = 'to)'
                  THEN jsonb_set(jsonb_set(t.i, '{name}', '"bazalka"'::jsonb), '{name_en}', '"basil"'::jsonb)
                  ELSE t.i END ORDER BY t.ord)
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(i, ord)
  )
WHERE r.id = 614
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.ingredients) e WHERE e->>'name' = 'to)');

UPDATE public.recipes_catalog r SET
  ingredients = (
    SELECT jsonb_agg(
             CASE WHEN t.i->>'name' = 'lehce oslazená šlehačka nebo'
                  THEN jsonb_set(jsonb_set(t.i, '{name}', '"šlehačka"'::jsonb), '{name_en}', '"whipped cream"'::jsonb)
                  ELSE t.i END ORDER BY t.ord)
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(i, ord)
  )
WHERE r.id = 80
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.ingredients) e
               WHERE e->>'name' = 'lehce oslazená šlehačka nebo');

-- ===========================================================================
-- CO SE ZAMERNE NEUKLIDILO
-- ===========================================================================
-- Pri hledani jsem nasel 10 radku smeti v 8 receptech, ne 4. Zbylych 5 radku
-- nechavam a je proc — u kazdeho by oprava byla vic nez uklid nazvu:
--
--   id  59  "raspberries and mint leaves"  ("4 each - fresh raspberries and
--           mint leaves for garnish") — DVE suroviny slite do jedne. Poctiva
--           oprava je rozdelit radek na dva, ne prejmenovat; to uz je zasah do
--           struktury receptu, ne uklid. Recept je navic zaminovany.
--   id  83  "poznamka: pouzil jsem pomerance" (4 ks) — veta z postupu, smazat
--           by slo, ale recept je zaminovany a smazani radku je jeho jediny
--           konflikt; slo by to, ale je to jina trida zasahu (mazani u
--           zaminovaneho receptu) a v analyze mezi ty ctyri nepatri.
--   id 132  "habanero omacka a chile" — dve suroviny slite do jedne.
--   id 532  "voda minus 2 lzice & pridat 2" — podle puvodniho textu je to
--           KEFIR nebo PODMASLI (177 ml), ne voda. Prejmenovani na vodu by
--           z receptu odstranilo mlecny vyrobek; spravny nazev z textu
--           jednoznacne neplyne (kefir NEBO podmasli NEBO voda).
--   id 586  "cokolada a extra kakaovy prasek" — dve suroviny slite do jedne.
--
-- Vsechny cekaji na opravu parseru, ne na dalsi rucni kuraci.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_smeti     integer;
  v_deakt     integer;
  v_regrese   integer;
  v_pred_sum  integer;
  v_po_sum    integer;
BEGIN
  -- 1) Zadny z opravovanych nazvu uz nesmi v aktivnich receptech byt.
  SELECT count(*) INTO v_smeti
  FROM public.recipes_catalog r CROSS JOIN LATERAL jsonb_array_elements(r.ingredients) i
  WHERE r.active AND i->>'name' IN ('hrnec. odlomte a odhoďte tvrdé konce z',
    'přiveďte k varu několik hrnků vody', 'onion or', 'to)', 'lehce oslazená šlehačka nebo');
  IF v_smeti > 0 THEN
    RAISE EXCEPTION 'V aktivnich receptech zustalo % radku smeti.', v_smeti;
  END IF;

  -- 2) Trigger nesmel zadny ze ctyr receptu deaktivovat.
  SELECT count(*) INTO v_deakt FROM public.recipes_catalog
  WHERE id IN (80, 508, 614, 644) AND NOT active;
  IF v_deakt > 0 THEN
    RAISE EXCEPTION 'Update deaktivoval % ze ctyr opravovanych receptu.', v_deakt;
  END IF;

  -- 3) U 508 se smazaly presne dva radky, nikde jinde se pocet nezmenil.
  SELECT p.surovin - jsonb_array_length(r.ingredients) INTO v_pred_sum
  FROM _pred p JOIN public.recipes_catalog r ON r.id = p.id WHERE p.id = 508;
  IF v_pred_sum <> 2 THEN
    RAISE EXCEPTION 'U receptu 508 se smazalo % radku misto 2.', v_pred_sum;
  END IF;

  SELECT count(*) INTO v_po_sum
  FROM _pred p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE p.id <> 508 AND jsonb_array_length(r.ingredients) <> p.surovin;
  IF v_po_sum > 0 THEN
    RAISE EXCEPTION 'U % jinych receptu se zmenil pocet surovin.', v_po_sum;
  END IF;

  -- 4) Zadny recept nesmel prijit o spocitatelnost.
  SELECT count(*) INTO v_regrese
  FROM _pred p
  JOIN public.recipes_catalog r ON r.id = p.id
  CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
  WHERE p.complete AND NOT c.complete;
  IF v_regrese > 0 THEN
    RAISE EXCEPTION 'Regrese: % receptu prestalo byt spocitatelnych.', v_regrese;
  END IF;

  -- 5) Recept 80 se mel zaroven odminovat.
  IF array_length(public.recipe_diet_conflicts(
       (SELECT ingredients FROM public.recipes_catalog WHERE id = 80), 'vegetarian'), 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Recept 80 zustal zaminovany, i kdyz smeti bylo jeho jediny konflikt.';
  END IF;

  RAISE NOTICE 'Uklid hotov: 5 radku smeti ve 4 receptech, zadna deaktivace, recept 80 odminovan.';
END $$;
