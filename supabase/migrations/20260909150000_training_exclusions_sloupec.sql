-- Vyloučení cviků a pohybových vzorů z tréninkového plánu — stejný princip
-- jako dietní vyloučení u jídel (`foods_to_avoid`, `dietary_restrictions`,
-- `diet_tags` na téže tabulce). Nová tabulka `user_context` se nezakládá —
-- `body_metrics` je už dnes místo, kde žije zbytek uživatelových omezení,
-- a je to jeden řádek na uživatele s RLS, které není potřeba dublovat.
--
-- TVAR (validovaný jen typem, obsah hlídá `lib/trainingExclusions.js`
-- v aplikační vrstvě — DB CHECK na povolené hodnoty vzorů/kontraindikací by
-- se musel měnit pokaždé, když přibude nový vzor, a to je rozhodnutí kódu,
-- ne migrace):
--   {
--     "patterns": ["squat", "floor"],
--     "muscles": ["shoulders"],
--     "exercise_keys": ["bench_press"],
--     "contraindications": ["knee"],
--     "source": "onboarding",
--     "updated_at": "2026-09-09T12:00:00.000Z"
--   }
--
-- Prázdný objekt = žádná vyloučení (výchozí stav pro všechny dnešní účty).
-- NEAPLIKUJI tuhle migraci — píšu soubor, nasazuje ji Honzův druhý Claude
-- před mergem (docs/DALSI_KROK.md, "Pravidla, která platí nade vším").

ALTER TABLE public.body_metrics
  ADD COLUMN IF NOT EXISTS training_exclusions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.body_metrics.training_exclusions IS
  'Vyloučení cviků/pohybových vzorů z tréninkového plánu. Tvar a validace: lib/trainingExclusions.js (normalizeTrainingExclusions). Prázdný objekt = žádná vyloučení.';

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sloupec_existuje boolean;
  v_nenull_bez_defaultu integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'body_metrics' AND column_name = 'training_exclusions'
  ) INTO v_sloupec_existuje;
  IF NOT v_sloupec_existuje THEN
    RAISE EXCEPTION 'Sloupec body_metrics.training_exclusions se nevytvořil.';
  END IF;

  SELECT count(*) INTO v_nenull_bez_defaultu
  FROM public.body_metrics
  WHERE training_exclusions IS NULL;
  IF v_nenull_bez_defaultu > 0 THEN
    RAISE EXCEPTION '% řádků body_metrics má training_exclusions NULL místo výchozího {}.', v_nenull_bez_defaultu;
  END IF;
END $$;
