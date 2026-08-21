-- START PROGRAM — progrese tréninku.
--
-- PROC TATO TABULKA A NE `workouts.exercises` (jsonb).
-- Progrese se pta „jaky byl posledni vykon uzivatele X u cviku Y“. V jsonb to
-- znamena scan tabulky a traverzovani dokumentu; tady na to sedne index
-- (user_id, canonical_key, performed_on DESC). `workouts` navic loguje SESSION
-- (datum, typ, delka, pocit), ne serie a vahy — 10. 8. 2026 mela 0 radku
-- a sloupec `exercises` nikdo nikdy nezapsal.
--
-- PROC JEDNA TABULKA A NE DVE (log + stavovy automat).
-- Stav je odvoditelny z posledniho radku, druha tabulka by byla druhy zdroj
-- pravdy, ktery se rozejde pri prvni nekonzistenci.
--
-- KLICOVY DETAIL: radek vznika UZ PRI GENEROVANI PLANU se statusem
-- `prescribed` a prazdnym vysledkem. Tim je „uzivatel nezadal nic“
-- reprezentovatelny stav (radek zustal prescribed), ne chybejici data — bez
-- toho by u uzivatele, ktery nikdy nic nevyplni, nebylo co zopakovat.

CREATE TABLE IF NOT EXISTS public.start_workout_progression (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id        uuid NULL,
  canonical_key  text NOT NULL,
  performed_on   date NOT NULL,
  variant        text NOT NULL CHECK (variant IN ('A', 'B')),

  -- predpis (co ma uzivatel udelat)
  target_sets         smallint NOT NULL CHECK (target_sets BETWEEN 1 AND 10),
  target_reps_min     smallint NULL CHECK (target_reps_min IS NULL OR target_reps_min BETWEEN 1 AND 100),
  target_reps_max     smallint NULL CHECK (target_reps_max IS NULL OR target_reps_max BETWEEN 1 AND 100),
  target_duration_sec smallint NULL CHECK (target_duration_sec IS NULL OR target_duration_sec BETWEEN 5 AND 600),
  prescribed_weight_kg numeric(6,2) NULL CHECK (prescribed_weight_kg IS NULL OR prescribed_weight_kg >= 0),

  -- vysledek (co uzivatel opravdu udelal); jeden prvek pole = jedna serie
  reps_done         smallint[] NULL,
  weight_done_kg    numeric(6,2) NULL CHECK (weight_done_kg IS NULL OR weight_done_kg >= 0),
  duration_done_sec smallint[] NULL,

  status text NOT NULL DEFAULT 'prescribed'
    CHECK (status IN ('prescribed', 'done', 'skipped')),

  -- proc predpis vypada takhle; slouzi k vysvetleni uzivateli i k ladeni
  decision            text NULL,
  consecutive_misses  smallint NOT NULL DEFAULT 0,
  consecutive_no_data  smallint NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Cvik se v jednom dni vyskytuje jednou. Kdyby plan omylem predepsal dvakrat
  -- totez, at to spadne tady a ne az v progresi.
  CONSTRAINT start_workout_progression_unique_slot UNIQUE (user_id, canonical_key, performed_on)
);

-- Hlavni dotaz progrese: posledni vykon uzivatele u konkretniho cviku.
CREATE INDEX IF NOT EXISTS start_workout_progression_lookup
  ON public.start_workout_progression (user_id, canonical_key, performed_on DESC);

-- Tyden uzivatele (co ma dnes odcvicit / co zbyva dopsat).
CREATE INDEX IF NOT EXISTS start_workout_progression_user_date
  ON public.start_workout_progression (user_id, performed_on DESC);

ALTER TABLE public.start_workout_progression ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Uzivatel vidi a upravuje jen svoje radky. INSERT zamerne NENI povoleny
  -- uzivateli: predpis zaklada generator plánu (service_role), uzivatel ho jen
  -- vyplnuje. Jinak by si mohl vymyslet cviky, ktere mu nikdo nepredepsal.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='start_workout_progression'
                    AND policyname='start_workout_progression_own_select') THEN
    CREATE POLICY start_workout_progression_own_select ON public.start_workout_progression
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='start_workout_progression'
                    AND policyname='start_workout_progression_own_update') THEN
    CREATE POLICY start_workout_progression_own_update ON public.start_workout_progression
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='start_workout_progression'
                    AND policyname='start_workout_progression_service_all') THEN
    CREATE POLICY start_workout_progression_service_all ON public.start_workout_progression
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.start_workout_progression IS
  'Progrese START programu. Jeden radek = jeden cvik v jednom treninku. Radek zaklada generator plánu se statusem prescribed; uzivatel ho vyplni na done/skipped. Status prescribed po odcviceni tydne = uzivatel nezadal nic, predpis se zopakuje.';
COMMENT ON COLUMN public.start_workout_progression.reps_done IS
  'Jeden prvek = jedna serie. Delka pole se porovnava s target_sets — splneno je jen tehdy, kdyz kazda serie dosahla target_reps_min.';
COMMENT ON COLUMN public.start_workout_progression.duration_done_sec IS
  'Vydrz po seriich. Jeden prvek = uzivatel zadal jednu hodnotu pro vsechny serie.';
COMMENT ON COLUMN public.start_workout_progression.decision IS
  'Jak se dospelo k tomuhle predpisu (progress_weight, repeat_missed, deload, repeat_no_data, ...). Viz lib/workoutProgression.js.';
