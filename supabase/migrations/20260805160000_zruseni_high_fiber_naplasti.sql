-- Zruseni naplasti high_fiber u receptu 830 a 833.
--
-- ===========================================================================
-- PROC
-- ===========================================================================
-- Tag high_fiber u tehle dvou receptu nebyl pravda o diete, ale obchazka
-- Atwaterovy kontroly, ktera neumela odecist vlakninu. Po migraci
-- 20260805150000 uz obchazku nepotrebuji:
--   830 Avokadova pomazanka s celerem  173 kcal, 4/4/9 = 192 (11,0 %)
--       vlaknina 7,6 g -> 192 - 15,3 = 177 (2,3 %)   projde
--   833 Broskvovo-bananovy salat s chia 206 kcal, 4/4/9 = 229 (11,2 %)
--       vlaknina 8,3 g -> 229 - 16,6 = 212 (3,0 %)   projde
--
-- Zustava u nich tag `vegan`, ktery pravda JE.
--
-- ===========================================================================
-- POZOR: TENHLE UPDATE MUSI PROJIT TREMI BRANAMI
-- ===========================================================================
-- UPDATE na recipes_catalog spusti enforce_recipe_catalog_rules, ktera po
-- odebrani tagu znovu posoudi VSECHNO. Krome Atwatera tedy i:
--   (c) pocet hlavnich surovin  — 830 ma 5, 833 ma 4, limit je 10
--   (f) konflikt vegan tagu     — overeno pred zapisem, viz kontrola nize
-- Kdyby cokoli z toho neproslo, recept se deaktivuje a naplast by byla
-- potreba dal. Kontrola na konci to hlida.
--
-- JS ZRCADLO: lib/macroKcalConsistency.js pouziva rowPassesMacroKcalGate ve
-- vyberu kandidatu (lib/recipesCatalog.js:319). Do teto zmeny by po odebrani
-- tagu oba recepty z vyberu vypadly, protoze JS umel jen 4/4/9. Proto se
-- v tom samem balicku upravuje i ono a katalogovy dotaz uz tahá fiber_g.
-- Bez toho by tahle migrace recepty odblokovala v DB a zaroven schovala v app.

UPDATE public.recipes_catalog
SET diet_tags = array_remove(diet_tags, 'high_fiber')
WHERE id IN (830, 833) AND 'high_fiber' = ANY(diet_tags);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_aktivni  integer;
  v_s_tagem  integer;
  v_atwater  integer;
  v_ostatni  integer;
BEGIN
  -- 1) Tag je odebrany.
  SELECT count(*) INTO v_s_tagem FROM public.recipes_catalog
  WHERE id IN (830,833) AND 'high_fiber' = ANY(diet_tags);
  IF v_s_tagem > 0 THEN
    RAISE EXCEPTION 'U % receptu tag high_fiber zustal.', v_s_tagem;
  END IF;

  -- 2) TO PODSTATNE: oba recepty musi zustat AKTIVNI. Kdyby je brana shodila,
  --    naplast byla jeste potreba a odebrat ji byla chyba.
  SELECT count(*) INTO v_aktivni FROM public.recipes_catalog WHERE id IN (830,833) AND active;
  IF v_aktivni <> 2 THEN
    RAISE EXCEPTION 'Aktivni zustaly jen % z 2 receptu — brana je po odebrani tagu deaktivovala.', v_aktivni;
  END IF;

  -- 3) A musi projit Atwaterem uz BEZ obchazky, ne diky ni.
  SELECT count(*) INTO v_atwater FROM public.recipes_catalog
  WHERE id IN (830,833)
    AND public.atwater_ok(kcal, protein_g, carbs_g, fat_g, public.recipe_fiber_g(ingredients), 10.0);
  IF v_atwater <> 2 THEN
    RAISE EXCEPTION 'Atwater bez naplasti projdou jen % z 2 receptu.', v_atwater;
  END IF;

  -- 4) Tag `vegan` zustal — ten je pravda a odebrat se nemel.
  SELECT count(*) INTO v_ostatni FROM public.recipes_catalog
  WHERE id IN (830,833) AND 'vegan' = ANY(diet_tags);
  IF v_ostatni <> 2 THEN
    RAISE EXCEPTION 'Tag vegan zbyl jen u % z 2 receptu.', v_ostatni;
  END IF;

  -- 5) Nic jineho se deaktivovat nesmelo.
  SELECT count(*) INTO v_aktivni FROM public.recipes_catalog WHERE active;
  IF v_aktivni <> 463 THEN
    RAISE EXCEPTION 'Aktivnich receptu je % (cekali jsme 463).', v_aktivni;
  END IF;

  -- 6) Kolik receptu jeste naplast pouziva — pro shrnuti.
  SELECT count(*) INTO v_s_tagem FROM public.recipes_catalog WHERE 'high_fiber' = ANY(diet_tags);
  RAISE NOTICE '830 a 833 projdou bez naplasti a zustaly aktivni. Tag high_fiber ma jeste % receptu.', v_s_tagem;
END $$;
