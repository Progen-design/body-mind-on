-- Doplnění lehčí/těžší varianty tam, kde ji migrace 20260908120000 nechala NULL.
--
-- DŮVOD: plošné odvození v 20260908120000 páruje jen cviky ze stejné
-- svalové partie a RŮZNÉ úrovně (level). Kde je celá partie na jedné
-- úrovni (bicepsy jsou všechny 'beginner'), nezbylo nic k dopárování a
-- uživatel u takového cviku nemá co přepnout. Tahle migrace to řeší dvěma
-- kroky: ručně vybranými páry pro cviky, které se reálně objevují v
-- plánech, a pak plošným pravidlem podle nářadí uvnitř stejné úrovně.
--
-- Cílové klíče byly ověřeny: každý existuje, má display_name_cs a
-- neprázdné instructions_cs, takže tlačítko ve WorkoutSection má co
-- ukázat a po záměně je vidět postup nového cviku.

-- ---------------------------------------------------------------------------
-- 1) Ruční páry — cviky používané v plánech
-- ---------------------------------------------------------------------------

-- Prkno -> boční prkno (anti-lateral flexe je náročnější než anti-extenze).
UPDATE public.exercise_asset_registry SET harder_key = 'plank_side' WHERE canonical_key = 'plank';

-- Dead bug -> rollout v kleku (stejný vzor anti-extenze, výrazně vyšší nárok).
UPDATE public.exercise_asset_registry SET harder_key = 'barbell_ab_rollout_on_knees' WHERE canonical_key = 'dead_bug';

-- Přítahy s jednoručkou <- kladka (vedená dráha, opřený trup).
UPDATE public.exercise_asset_registry SET easier_key = 'cable_row' WHERE canonical_key = 'dumbbell_row';

-- Přítahy v předklonu -> shyby.
UPDATE public.exercise_asset_registry SET harder_key = 'pull_up' WHERE canonical_key = 'bent_over_row';

-- Bicepsový zdvih: stroj je lehčí, velká činka těžší (celá partie je 'beginner',
-- plošné odvození podle úrovně tu proto nic nenašlo).
UPDATE public.exercise_asset_registry SET easier_key = 'machine_bicep_curl', harder_key = 'barbell_curl' WHERE canonical_key = 'bicep_curl';

-- Kliky <- kliky na šikmé lavici. Migrace 20260908120000 tu nechala NULL
-- s poznámkou, že "kliky na kolenou" v katalogu nemáme — ale kliky na
-- šikmé lavici jsou plnohodnotná lehčí varianta a v katalogu jsou.
UPDATE public.exercise_asset_registry SET easier_key = 'incline_push_up_wide' WHERE canonical_key = 'pushup';

-- Tlak na lavici s jednoručkami <- chest press na stroji.
UPDATE public.exercise_asset_registry SET easier_key = 'chest_press' WHERE canonical_key = 'dumbbell_bench_press';

-- Dřepy <- tlaky nohama (vedená dráha, bez nároku na stabilizaci trupu).
UPDATE public.exercise_asset_registry SET easier_key = 'leg_press' WHERE canonical_key = 'squat';

-- Zakopávání vleže -> rumunský mrtvý tah s jednoručkami (z izolace na komplexní vzor).
UPDATE public.exercise_asset_registry SET harder_key = 'dumbbell_romanian_deadlift' WHERE canonical_key = 'hamstring_curl';

-- Tlaky nad hlavu <- tlak nad hlavu na stroji.
UPDATE public.exercise_asset_registry SET easier_key = 'machine_shoulder_military_press' WHERE canonical_key = 'overhead_press';

-- Tricepsové tlaky: stroj lehčí, tricepsové dipy (vlastní váha) těžší.
UPDATE public.exercise_asset_registry SET easier_key = 'machine_triceps_extension', harder_key = 'tricep_dip' WHERE canonical_key = 'tricep_extension';

-- Zvedání na špičky -> výpony vestoje s jednoručkami.
UPDATE public.exercise_asset_registry SET harder_key = 'standing_dumbbell_calf_raise' WHERE canonical_key = 'calf_raise';

-- Rozpažky nemají vyplněnou partii, takže je plošné odvození přeskočilo.
UPDATE public.exercise_asset_registry
SET primary_muscle = COALESCE(primary_muscle, 'shoulders'),
    easier_key = 'lateral_raise_with_bands'
WHERE canonical_key = 'lateral_raise';

-- ---------------------------------------------------------------------------
-- 2) Plošné doplnění uvnitř stejné úrovně — podle nářadí
--
--    Kde partie nemá jinou úroveň, rozhoduje nářadí: stroj a kladka vedou
--    dráhu za cvičence, guma odpouští, volná zátěž a vlastní váha kladou
--    nároky na stabilizaci. Pořadí je tedy stroj < kladka < guma <
--    jednoručky < velká činka < vlastní váha < kettlebell.
--
--    Doplňuje se JEN tam, kde je pole pořád NULL — ruční páry výše ani
--    páry z migrace 20260908120000 se nepřepisují.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exercise_equipment_ordinal(p_equipment text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE p_equipment
    WHEN 'machine' THEN 1
    WHEN 'cable' THEN 2
    WHEN 'band' THEN 3
    WHEN 'dumbbell' THEN 4
    WHEN 'barbell' THEN 5
    WHEN 'body_weight' THEN 6
    WHEN 'kettlebell' THEN 7
    ELSE NULL
  END;
$function$;

COMMENT ON FUNCTION public.exercise_equipment_ordinal(text) IS
  'equipment_class -> pořadové číslo náročnosti na stabilizaci. Slouží k párování lehčí/těžší varianty uvnitř stejné úrovně obtížnosti. NULL pro neznámé nářadí.';

UPDATE public.exercise_asset_registry r
SET
  easier_key = COALESCE(r.easier_key, (
    SELECT e.canonical_key
    FROM public.exercise_asset_registry e
    WHERE e.primary_muscle = r.primary_muscle
      AND e.level IS NOT DISTINCT FROM r.level
      AND e.canonical_key <> r.canonical_key
      AND e.usable_in_plan
      AND e.display_name_cs IS NOT NULL AND btrim(e.display_name_cs) <> ''
      AND e.instructions_cs IS NOT NULL AND cardinality(e.instructions_cs) > 0
      AND public.exercise_equipment_ordinal(e.equipment_class) IS NOT NULL
      AND public.exercise_equipment_ordinal(r.equipment_class) IS NOT NULL
      AND public.exercise_equipment_ordinal(e.equipment_class) < public.exercise_equipment_ordinal(r.equipment_class)
    ORDER BY public.exercise_equipment_ordinal(e.equipment_class) DESC, e.canonical_key ASC
    LIMIT 1
  )),
  harder_key = COALESCE(r.harder_key, (
    SELECT e.canonical_key
    FROM public.exercise_asset_registry e
    WHERE e.primary_muscle = r.primary_muscle
      AND e.level IS NOT DISTINCT FROM r.level
      AND e.canonical_key <> r.canonical_key
      AND e.usable_in_plan
      AND e.display_name_cs IS NOT NULL AND btrim(e.display_name_cs) <> ''
      AND e.instructions_cs IS NOT NULL AND cardinality(e.instructions_cs) > 0
      AND public.exercise_equipment_ordinal(e.equipment_class) IS NOT NULL
      AND public.exercise_equipment_ordinal(r.equipment_class) IS NOT NULL
      AND public.exercise_equipment_ordinal(e.equipment_class) > public.exercise_equipment_ordinal(r.equipment_class)
    ORDER BY public.exercise_equipment_ordinal(e.equipment_class) ASC, e.canonical_key ASC
    LIMIT 1
  ))
WHERE r.primary_muscle IS NOT NULL
  AND r.level IS NOT NULL
  AND (r.easier_key IS NULL OR r.harder_key IS NULL);

-- ---------------------------------------------------------------------------
-- 3) Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sam_sobe integer;
  v_bez_jmena integer;
  v_bez_postupu integer;
BEGIN
  SELECT count(*) INTO v_sam_sobe
  FROM public.exercise_asset_registry
  WHERE canonical_key = easier_key OR canonical_key = harder_key;
  IF v_sam_sobe > 0 THEN
    RAISE EXCEPTION '% cviků ukazuje na sebe sama jako na variantu.', v_sam_sobe;
  END IF;

  -- Varianta musí mít český název i postup, jinak nemá tlačítko co ukázat.
  SELECT count(*) INTO v_bez_jmena
  FROM public.exercise_asset_registry r
  WHERE (r.easier_key IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.exercise_asset_registry e
           WHERE e.canonical_key = r.easier_key AND btrim(coalesce(e.display_name_cs,'')) <> ''))
     OR (r.harder_key IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.exercise_asset_registry h
           WHERE h.canonical_key = r.harder_key AND btrim(coalesce(h.display_name_cs,'')) <> ''));
  IF v_bez_jmena > 0 THEN
    RAISE EXCEPTION '% cviků ukazuje na variantu bez českého názvu.', v_bez_jmena;
  END IF;

  SELECT count(*) INTO v_bez_postupu
  FROM public.exercise_asset_registry r
  WHERE (r.easier_key IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.exercise_asset_registry e
           WHERE e.canonical_key = r.easier_key AND e.instructions_cs IS NOT NULL AND cardinality(e.instructions_cs) > 0))
     OR (r.harder_key IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.exercise_asset_registry h
           WHERE h.canonical_key = r.harder_key AND h.instructions_cs IS NOT NULL AND cardinality(h.instructions_cs) > 0));
  IF v_bez_postupu > 0 THEN
    RAISE EXCEPTION '% cviků ukazuje na variantu bez českého postupu.', v_bez_postupu;
  END IF;
END $$;
