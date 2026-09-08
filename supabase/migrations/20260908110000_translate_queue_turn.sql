-- NÁVRH — NEAPLIKOVÁNO. Vytvořeno k úkolu "cviky se nikdy nepřeloží do
-- češtiny" (vyhladovění frontou receptů v api/cron/translate-recipes.js).
-- Než tuhle migraci pustíš (`supabase db push`), přečti si
-- lib/translateQueueOrchestrator.js — bez téhle tabulky kód spadne zpátky
-- na "recepty vždy vyhrávají, když mají obě fronty práci" (fail-soft
-- default v lib/translateQueueTurn.js), ne na chybu.
--
-- Jedna řádka drží, která fronta (recepty/postupy cviků) naposledy dostala
-- svoje jedno velké OpenAI volání v jednom běhu cronu — kolotočové střídání
-- (round-robin) potřebuje vědět, kdo byl na řadě, napříč jednotlivými běhy
-- (samostatné serverless invokace, žádná sdílená paměť mezi nimi).
--
-- Zvažoval jsem bezstavovou alternativu (sudá/lichá minuta místo řádku
-- v DB), ale ta se láme, jakmile cron jednou vynechá běh nebo někdo spustí
-- endpoint ručně mimo rozvrh — řádek v DB zaznamenává, co se OPRAVDU
-- naposled stalo, ne co by podle hodin mělo.

CREATE TABLE IF NOT EXISTS public.translate_queue_turn (
  id         smallint PRIMARY KEY DEFAULT 1,
  last_queue text NOT NULL CHECK (last_queue IN ('recipes', 'exercises')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT translate_queue_turn_jediny_radek CHECK (id = 1)
);

-- RLS je v tomhle repu povinné na každé nové tabulce. Tabulka je interní
-- bookkeeping cronu: nikdo z klientů ji nečte ani nepíše, chodí se do ní
-- jen ze serverless funkce přes service_role (ten RLS obchází sám).
ALTER TABLE public.translate_queue_turn ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='translate_queue_turn'
                    AND policyname='translate_queue_turn_service_write') THEN
    CREATE POLICY translate_queue_turn_service_write ON public.translate_queue_turn
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.translate_queue_turn IS
  'Jeden řádek (id=1): last_queue drží, která překladová fronta (recipes/exercises) naposledy dostala svoje velké OpenAI volání v api/cron/translate-recipes.js. Čte/píše lib/translateQueueTurn.js.';
