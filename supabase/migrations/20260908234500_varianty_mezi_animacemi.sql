-- Doplnění variant mezi cviky, které mají animaci.
--
-- Po migraci 20260908230000 smí varianta mířit jen na cvik s animací, takže
-- část dvojic zmizela. Tahle migrace síť dopárovává zpátky — ručně, mezi
-- 23 použitelnými cviky s animací, podle pohybového vzoru a náročnosti.
--
-- Nedoplňuje se tam, kde v animované sadě protějšek není: biceps, lýtka,
-- dolní záda a full body mají po jediném cviku, takže lehčí ani těžší
-- varianta neexistuje a tlačítko se u nich nenabídne.

-- Břicho: anti-extenze vleže -> rotace vsedě.
UPDATE public.exercise_asset_registry SET harder_key = 'russian_twist' WHERE canonical_key = 'dead_bug';
UPDATE public.exercise_asset_registry SET easier_key = 'dead_bug' WHERE canonical_key = 'russian_twist';

-- Záda: vedená kladka je nižší stupeň než přítah v předklonu s volnou zátěží.
UPDATE public.exercise_asset_registry SET easier_key = 'lat_pulldown' WHERE canonical_key = 'bent_over_row';

-- Hrudník: vlastní váha -> velká činka.
UPDATE public.exercise_asset_registry SET harder_key = 'bench_press' WHERE canonical_key = 'pushup';
UPDATE public.exercise_asset_registry SET easier_key = 'pushup' WHERE canonical_key = 'bench_press';

-- Nohy: vedená dráha ve stroji -> dřep s vlastní vahou.
UPDATE public.exercise_asset_registry SET harder_key = 'squat' WHERE canonical_key = 'leg_press';

-- Hýždě: most vleže -> hip hinge ve stoji.
UPDATE public.exercise_asset_registry SET harder_key = 'romanian_deadlift' WHERE canonical_key = 'glute_bridge';

-- Zadní stehna: izolace na stroji -> komplexní hip hinge.
UPDATE public.exercise_asset_registry SET harder_key = 'romanian_deadlift' WHERE canonical_key = 'hamstring_curl';

-- Ramena: upažování je nižší stupeň než tlak nad hlavu.
UPDATE public.exercise_asset_registry SET easier_key = 'lateral_raise' WHERE canonical_key = 'overhead_press';

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bez_animace integer;
  v_sam_sobe integer;
  v_s_variantou integer;
BEGIN
  SELECT count(*) INTO v_bez_animace
  FROM public.exercise_asset_registry r
  LEFT JOIN public.exercise_asset_registry e ON e.canonical_key = r.easier_key
  LEFT JOIN public.exercise_asset_registry h ON h.canonical_key = r.harder_key
  WHERE (r.easier_key IS NOT NULL AND e.gif_url IS NULL)
     OR (r.harder_key IS NOT NULL AND h.gif_url IS NULL);
  IF v_bez_animace > 0 THEN
    RAISE EXCEPTION '% variant míří na cvik bez animace.', v_bez_animace;
  END IF;

  SELECT count(*) INTO v_sam_sobe FROM public.exercise_asset_registry
  WHERE canonical_key = easier_key OR canonical_key = harder_key;
  IF v_sam_sobe > 0 THEN
    RAISE EXCEPTION '% cviků ukazuje samo na sebe.', v_sam_sobe;
  END IF;

  SELECT count(*) INTO v_s_variantou FROM public.exercise_asset_registry
  WHERE gif_url IS NOT NULL AND usable_in_plan
    AND (easier_key IS NOT NULL OR harder_key IS NOT NULL);
  RAISE NOTICE 'Animovaných cviků s aspoň jednou variantou: %.', v_s_variantou;
END $$;
