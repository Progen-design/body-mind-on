-- Návratová cesta u "Tlaky s jednoručkami".
--
-- Uživatel se z Bench pressu přepnul na "Tlaky s jednoručkami", ale zpátky
-- se dostat nemohl: migrace 20260908160000 zrušila páry uvnitř stejné
-- úrovně a oba cviky byly 'intermediate'. Tlak na lavici s jednoručkami je
-- ve skutečnosti nižší stupeň než bench press s velkou činkou (menší zátěž,
-- volnější dráha, žádný stojan) — sesterský klíč 'dumbbell_bench_press' má
-- proto 'beginner'. Sjednocuje se, čímž pár mezi úrovněmi vznikne přirozeně.
UPDATE public.exercise_asset_registry
SET level = 'beginner',
    easier_key = 'chest_press',
    harder_key = 'bench_press'
WHERE canonical_key = 'dumbbell_press';

DO $$
DECLARE v_zpet text;
BEGIN
  SELECT harder_key INTO v_zpet FROM public.exercise_asset_registry WHERE canonical_key = 'dumbbell_press';
  IF v_zpet IS DISTINCT FROM 'bench_press' THEN
    RAISE EXCEPTION 'dumbbell_press nemá cestu zpět na bench_press (je %).', v_zpet;
  END IF;
END $$;
