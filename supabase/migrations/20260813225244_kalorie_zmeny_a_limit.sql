-- KROK 3: audit změn kalorického cíle.
--
-- Cíl se nově přepočítá z odvozené váhy při týdenní obnově plánu
-- (`weekly_plan_update`), NE po každém vážení. Každá taková změna musí být
-- dohledatelná se starou i novou hodnotou a s důvodem — jinak se nedá zpětně
-- říct, jestli člověku cíl spadl kvůli reálnému hubnutí, kvůli jednomu vážení
-- v oblečení, nebo kvůli chybě v kódu.
--
-- PROČ VLASTNÍ TABULKA A NE `product_events`. `product_events` je podle
-- CLAUDE.md interní event tracking BEZ PII. Váha a kalorický cíl konkrétního
-- uživatele je zdravotní údaj — do analytiky nepatří. Navíc tenhle log chceme
-- umět číst po uživatelích a v čase, což je dotaz na tabulku, ne na jsonb.
--
-- Řádky se nemažou ani neupravují: je to audit. Uživatel vidí jen svoje.

CREATE TABLE IF NOT EXISTS public.calorie_target_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),

  -- Stará hodnota smí být NULL: první přepočet u uživatele, který cíl zatím
  -- neměl uložený, je taky změna a má se zalogovat.
  old_calories integer,
  new_calories integer NOT NULL,
  reason text NOT NULL,

  -- Vstupy, ze kterých přepočet vznikl — bez nich se změna nedá reprodukovat.
  derived_weight_kg numeric,
  previous_weight_kg numeric,
  measurement_count integer,
  measurement_window text,
  newest_measurement_at timestamptz,

  -- Dolní limit: platí i pro přepočtenou hodnotu, ne jen pro registrační.
  floor_applied boolean NOT NULL DEFAULT false,
  floor_value integer,

  task_id uuid,

  CONSTRAINT calorie_target_changes_new_calories_range
    CHECK (new_calories > 0 AND new_calories < 20000),
  CONSTRAINT calorie_target_changes_reason_neprazdny
    CHECK (btrim(reason) <> '')
);

CREATE INDEX IF NOT EXISTS idx_calorie_target_changes_user_time
  ON public.calorie_target_changes (user_id, changed_at DESC);

COMMENT ON TABLE public.calorie_target_changes IS
  'Audit zmen kalorickeho cile. Zapisuje se pri tydenni obnove planu, kdyz se cil prepocital z odvozene vahy. Nemaze se.';
COMMENT ON COLUMN public.calorie_target_changes.floor_applied IS
  'True, kdyz vypocet spadl pod dolni limit (max z genderoveho minima a 0,8x BMR) a byl zvednut na nej.';
COMMENT ON COLUMN public.calorie_target_changes.measurement_window IS
  'Okno, ze ktereho medián vznikl: 7d (bezny stav) nebo 14d (za posledni tyden nic nedoslo).';

ALTER TABLE public.calorie_target_changes ENABLE ROW LEVEL SECURITY;

-- Uživatel vidí jen svoje změny. Zápis dělá výhradně server (service_role,
-- který RLS obchází) — proto tu není INSERT politika pro `authenticated`:
-- audit, do kterého si smí klient psát sám, není audit.
DROP POLICY IF EXISTS calorie_target_changes_select_own ON public.calorie_target_changes;
CREATE POLICY calorie_target_changes_select_own
  ON public.calorie_target_changes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
