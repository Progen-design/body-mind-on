-- Odminovani receptu: doplneni is_vegetarian / is_vegan do ingredients_nutrition.
--
-- ===========================================================================
-- PROBLEM
-- ===========================================================================
-- 67 ze 454 aktivnich receptu se deaktivuje pri JAKEMKOLI UPDATE. Vsech 67 pada
-- na jedine brane — (f) v enforce_recipe_catalog_rules, ktera porovnava
-- recipe_diet_conflicts(ingredients, tag) proti diet_tags receptu. Zadna jina
-- brana (makra, Atwater, pocet surovin) nefiruje ani u jednoho z nich.
--
-- ROOT CAUSE: ingredients_nutrition.is_vegetarian a is_vegan jsou NOT NULL
-- DEFAULT false. Hromadne importy je nikdy nevyplnily, takze kazda surovina,
-- ktera prisla batchem, je vedena jako NEvegetarianska:
--
--   reference_cs             167 surovin, 147 ma vege priznak  (rucne kurirovano)
--   usda_fdc                 141 surovin,  20 ma vege priznak  <- dira
--   spoonacular_enrichment    68 surovin,   0 ma vege priznak  <- dira
--
-- Proto "chleb", "rozinky" nebo "kava" plati za konflikt s vegetarianskym
-- tagem. Recept jednou proslel branou v dobe, kdy slovnik vypadal jinak,
-- zustal active — a prvni update ho shodi.
--
-- ===========================================================================
-- JAK JSEM KLASIFIKOVAL
-- ===========================================================================
-- Ne mechanicky "co odblokuje trigger", ale podle skutecnosti. A hlavne podle
-- KONVENCE, KTEROU UZ PROJEKT MA v rucne kurirovanych radcich reference_cs:
--
--   * syry (parmezan, mozzarella, cheddar, ricotta, cottage, smetanovy syr)
--     = is_vegetarian true, is_vegan false. Projekt zamerne neresi zivocisne
--     syridlo; drzim to stejne, jinak by se dva radky slovniku rozesly.
--   * mleko, smetana, jogurt, maslo, vejce, med = vegetarian true, vegan false
--   * musli = vegetarian true, vegan FALSE (opatrne kvuli medu/susenemu mleku)
--
-- Kde je pochybnost, radeji NEDOPLNUJU — nevyplneny priznak nechava recept
-- zaminovany, ale spatny priznak by mohl vegetarianovi nebo veganovi poslat
-- jidlo, ktere nechce. To je horsi chyba.

-- ---------------------------------------------------------------------------
-- 1. Rostlinne suroviny: vegetarian + vegan
-- ---------------------------------------------------------------------------
UPDATE public.ingredients_nutrition SET is_vegetarian = true, is_vegan = true, updated_at = now()
WHERE name_cs IN (
  -- zelenina a listy
  'červená řepa','cukrový hrášek','dýně','dýňové pyré','listová kapusta collard',
  'listy červené řepy','máslová dýně vařená','pastinák','ředkvičky','řeřicha',
  'rukola','růžičková kapusta','sušená rajčata','konzervovaná rajčata','rajčatový protlak',
  -- ovoce
  'černý rybíz','datle','fíky','hroznové víno','kaki','mangostana','meruňky',
  'ostružiny','pomeranč','pomerančová kůra','rozinky','semínka granátového jablka',
  'sušené třešně','vodní meloun','koktejlové třešně','džem','brusinková omáčka',
  -- obiloviny, mouky, luststeniny, orechy, seminka
  'chléb','vícezrnný chléb','pita','celozrnná pita','krupice','kukuřičná krupice',
  'kokosová mouka','ovesná mouka','pohanková mouka','pufovaná rýže','sušená cizrna',
  'mák','mandlové máslo','pistácie','kokos','kokosové vločky',
  -- koreni a bylinky
  'anýzová semínka','chilli vločky','cibulové vločky','estragon','hořčičný prášek',
  'hřebíček','kardamom','rozmarýn','šafrán',
  -- tekutiny, omacky, ostatni
  'káva','kokosová voda','limetková šťáva','melasa','miso','pálivá omáčka','salsa',
  'hoisin omáčka','rostlinný tuk','rum','vanilkové mandlové mléko','olivy','droždí'
);

-- ---------------------------------------------------------------------------
-- 2. Vegetarianske, ale NE veganske (mleko / vejce / med v receptu suroviny)
-- ---------------------------------------------------------------------------
UPDATE public.ingredients_nutrition SET is_vegetarian = true, is_vegan = false, updated_at = now()
WHERE name_cs IN (
  -- syry
  'americký tavený sýr','brie','ementál','feta','gouda','gruyère','kozí sýr',
  'monterey jack','pecorino romano',
  -- mleko a mlecne
  'odtučněné mléko','sušené mléko','podmáslí','šlehačka','zakysaná smetana',
  'smetana a mléko (half-and-half)','netučný bílý jogurt','nízkotučný řecký jogurt',
  'plnotučný bílý jogurt','plnotučný řecký jogurt','vanilkový jogurt','vanilkový řecký jogurt',
  -- vejce
  'kachní vejce',
  -- POZOR: USDA "egg substitute" je vyrobena z BILKU, ne z rostlin. Nazev lze,
  -- veganska neni.
  'náhrada vajec',
  -- pecivo a testa s maslem/vejcem/mlekem
  'challah chléb','croissant','naan','krutony','těsto na koláč','palačinková směs',
  -- ostatni
  'granola','čokoládové kousky','pesto','ranch dresink'
);

-- ===========================================================================
-- CO SE ZAMERNE NEDOPLNILO
-- ===========================================================================
-- A) Suroviny, ktere vegetarianske OPRAVDU NEJSOU — priznak zustava false,
--    protoze je pravdivy:
--      hovezi maso, hovezi vyvar, hovezi hash, nakladane hovezi, libove hovezi
--      maso, libove maso (napr. veprove), mlete veprove, veprova panenka,
--      veprova plec, kure, kureci prsa/prso, kureci palicky, grilovana kureci
--      prsa, kureci vyvar, kureci polevka, kruti prsa/prso, kruti klobasa,
--      klobasa, chorizo, slanina, sunka, sadlo, losos, bila ryba,
--      ryba (napr. losos), ryba (napr. treska), tunak (v konzerve), krabi maso,
--      krevety, ustricova omacka, worcesterska omacka (ancovicky), zelatina
--
-- B) Nejasne — nechavam nevyplnene a radeji zaminovane:
--      proteinovy prasek   whey (vegetarianske), nebo rostlinny? Z nazvu nepozna.
--      fazolova kase       tradicni refried beans se delaji na sadle.
--      houbova polevka     cast komercnich krem obsahuje kureci vyvar.
--      barbecue omacka     cast receptur obsahuje worcester, tedy ancovicky.
--    U vsech ctyr je riziko, ze bych vegetarianovi poslal neco s masem.
--
-- C) 68 radku ze spoonacular_enrichment ma name_cs = NULL, takze je
--    recipe_diet_conflicts stejne nikdy netrefi (joinuje na name_cs).
--    Je to samostatna dira ve slovniku, ne v priznacich.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_zaminovanych integer;
  v_maso integer;
BEGIN
  -- 1) Zadna masna/rybi surovina nesmi vyjit z teto migrace jako vegetarianska.
  SELECT count(*) INTO v_maso FROM public.ingredients_nutrition
  WHERE (is_vegetarian OR is_vegan)
    AND name_cs ~* '^(hovězí|vepřová|vepřové|mleté vepřové|kuře|kuřecí|krůtí|klobása|chorizo|slanina|šunka|sádlo|losos|bílá ryba|ryba |tuňák|krabí|krevety|ústřicová|worcesterská|želatina|libové|nakládané|grilovaná kuřecí)';
  IF v_maso > 0 THEN
    RAISE EXCEPTION 'Masna nebo rybi surovina dostala vegetariansky priznak (% radku).', v_maso;
  END IF;

  -- 2) Pocet zaminovanych receptu musel klesnout.
  SELECT count(*) INTO v_zaminovanych FROM public.recipes_catalog
  WHERE active AND NOT pending_review
    AND (('vegan' = ANY(diet_tags) AND array_length(public.recipe_diet_conflicts(ingredients,'vegan'),1) IS NOT NULL)
      OR ('vegetarian' = ANY(diet_tags) AND array_length(public.recipe_diet_conflicts(ingredients,'vegetarian'),1) IS NOT NULL));
  IF v_zaminovanych >= 67 THEN
    RAISE EXCEPTION 'Pocet zaminovanych receptu neklesl: %', v_zaminovanych;
  END IF;

  -- 3) Recept 205 (pastitsio s masovou omackou, otagovany vegetarian) MUSI
  --    zustat v konfliktu — brana tam pracuje spravne, tag receptu je spatny.
  IF array_length(public.recipe_diet_conflicts(
       (SELECT ingredients FROM public.recipes_catalog WHERE id = 205), 'vegetarian'), 1) IS NULL THEN
    RAISE EXCEPTION 'Recept 205 s masovou omackou prestal byt v konfliktu — to je spatne.';
  END IF;

  RAISE NOTICE 'Zaminovanych receptu po backfillu: % (bylo 67)', v_zaminovanych;
END $$;
