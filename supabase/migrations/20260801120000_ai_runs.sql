-- ai_runs: jedno volání modelu = jeden řádek.
--
-- ai_logs se na tohle nehodí — je vázaný na user_id a task_id z AI orchestrace,
-- což u dávkového zpracování katalogu nedává smysl. Tabulka drží to, bez čeho
-- nejde zpětně říct, čím a za kolik konkrétní hodnota vznikla: otisk promptu,
-- model, teplotu, tokeny a cenu.
--
-- prompt_sha256 je otisk souboru z prompts/. Kdyz se prompt zmeni, zmeni se SHA
-- a starsi vysledky jdou od novejsich odlisit bez hadani.

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose        text NOT NULL,
  recipe_id      bigint REFERENCES public.recipes_catalog(id) ON DELETE SET NULL,
  model          text NOT NULL,
  temperature    numeric NOT NULL,
  prompt_sha256  text NOT NULL,
  input_tokens   integer,
  output_tokens  integer,
  cost_usd       numeric(12, 6),
  result         jsonb,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_runs IS
  'Jedno volani modelu = jeden radek. Slouzi k dohledani, cim a za kolik vznikla konkretni hodnota. Na rozdil od ai_logs neni vazane na uzivatele ani na AI orchestraci.';
COMMENT ON COLUMN public.ai_runs.purpose IS
  'Ucel volani, napr. prep_time_estimate. Rozlisuje davky ruznych uloh v jedne tabulce.';
COMMENT ON COLUMN public.ai_runs.prompt_sha256 IS
  'SHA-256 souboru z prompts/. Zmena promptu = jine SHA = starsi vysledky jdou odlisit.';
COMMENT ON COLUMN public.ai_runs.cost_usd IS
  'Skutecna cena spoctena z usage v odpovedi, ne odhad predem.';

CREATE INDEX IF NOT EXISTS ai_runs_recipe_idx     ON public.ai_runs (recipe_id);
CREATE INDEX IF NOT EXISTS ai_runs_purpose_idx    ON public.ai_runs (purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_runs_prompt_sha_idx ON public.ai_runs (prompt_sha256);

-- RLS je na kazde tabulce povinne. Tahle je cistě serverova — zadna politika,
-- takze pres anon ani authenticated klic se k ni nikdo nedostane.
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_runs FROM anon, authenticated;
