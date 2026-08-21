-- Krok 1: doplnění času přípravy z instrukcí. Zdarma, deterministicky.
--
-- ready_in_minutes je VÝHRADNĚ měřená hodnota ze Spoonacularu (readyInMinutes).
-- Odhad má vlastní sloupec a nikdy měřenou hodnotu nepřepisuje. Aktuálně má
-- ready_in_minutes vyplněno 4 z 509 receptů — plní se jen u nových importů od
-- 30. 7. 2026, proto se čas zatím NESMÍ stát aktivační podmínkou.
--
-- POZOR na zdroje. Pokrytí vypadá takhle:
--   151  strukturovaná délka kroku (analyzedInstructions[].steps[].length)  → použito
--     3  čas v anglickém textu kroku                                        → NEPOUŽITO
--   100  čas POUZE v českém překladu (instructions_cs)                      → NEPOUŽITO
--
-- Těch 100 se vynechává: ve všech 100 případech nemá anglický originál v krocích
-- ani jednu číslici, takže minuty v překladu si vymyslel OpenAI. Vydávat je za
-- deterministický údaj by bylo zaměnění odhadu za měření. Patří do LLM vrstvy,
-- kde ponesou confidence.
--
-- Ty 3 z textu se vynechávají taky, i když by regexem šly vytáhnout. Na vzorku
-- tří jeden vychází špatně: "leave in the refrigerator for 1 / 2 hour" je půl
-- hodiny, ale jakýkoli rozumný regex z toho udělá 2 hodiny (120 min). Za tři
-- recepty nemá smysl riskovat čtyřnásobnou chybu ve vrstvě, jejíž jediná hodnota
-- je, že se jí dá věřit. Strukturovaná `length` je jednoznačná, text není.
-- (Pozn.: Postgres ARE bere \b jako backspace, hranice slova je \y — na tohle
-- narazí každý, kdo se sem bude chtít vrátit s regexem.)
--
-- Očekávané pokrytí téhle migrace: 151 receptů.

-- ---------------------------------------------------------------------------
-- 1. Sloupce pro odhad
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS prep_minutes_estimated    integer,
  ADD COLUMN IF NOT EXISTS prep_minutes_source       text,
  ADD COLUMN IF NOT EXISTS prep_minutes_confidence   numeric,
  ADD COLUMN IF NOT EXISTS prep_minutes_estimated_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_estimate_blocked     boolean NOT NULL DEFAULT false;

ALTER TABLE public.recipes_catalog
  DROP CONSTRAINT IF EXISTS recipes_catalog_prep_source_chk;
ALTER TABLE public.recipes_catalog
  ADD CONSTRAINT recipes_catalog_prep_source_chk
    CHECK (prep_minutes_source IS NULL
           OR prep_minutes_source IN ('structured_length', 'regex_instructions', 'llm'));

ALTER TABLE public.recipes_catalog
  DROP CONSTRAINT IF EXISTS recipes_catalog_prep_confidence_chk;
ALTER TABLE public.recipes_catalog
  ADD CONSTRAINT recipes_catalog_prep_confidence_chk
    CHECK (prep_minutes_confidence IS NULL OR prep_minutes_confidence BETWEEN 0 AND 1);

COMMENT ON COLUMN public.recipes_catalog.ready_in_minutes IS
  'MERENA hodnota ze Spoonacularu (readyInMinutes). Odhad sem NIKDY nepatri — ten ma prep_minutes_estimated.';
COMMENT ON COLUMN public.recipes_catalog.prep_minutes_estimated IS
  'Odhadnuty cas pripravy v minutach. SPODNI MEZ — scitaji se jen explicitne uvedene useky, priprava bez uvedeneho casu chybi.';
COMMENT ON COLUMN public.recipes_catalog.prep_minutes_source IS
  'structured_length = length u kroku z analyzedInstructions. regex_instructions = cas z anglickeho textu kroku. llm = odhad modelu.';
COMMENT ON COLUMN public.recipes_catalog.prep_minutes_confidence IS
  'Jen pro source = llm. U deterministickych zdroju zustava NULL — je to spodni mez, ne jistota.';

-- ---------------------------------------------------------------------------
-- 2. Ochrana měřené hodnoty
--
-- Jakmile je ready_in_minutes jednou naměřený, nesmí ho nic přepsat na jinou
-- hodnotu. Legitimní přeměření musí sloupec nejdřív vynulovat — tím je zásah
-- vědomý a dohledatelný. NULL -> hodnota povoleno (doplnění měření).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_measured_ready_in_minutes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ready_in_minutes IS NOT NULL
     AND NEW.ready_in_minutes IS DISTINCT FROM OLD.ready_in_minutes THEN
    NEW.ready_in_minutes := OLD.ready_in_minutes;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_measured_ready_in_minutes ON public.recipes_catalog;
CREATE TRIGGER protect_measured_ready_in_minutes
  BEFORE UPDATE ON public.recipes_catalog
  FOR EACH ROW EXECUTE FUNCTION public.protect_measured_ready_in_minutes();

-- ---------------------------------------------------------------------------
-- 3. Backfill ze strukturované délky kroků (151 receptů)
--
-- Součet, ne maximum: kroky jdou po sobě. Jednotka je u všech 'minutes',
-- přesto se ošetřuje i 'hours' pro případ budoucích dat.
-- ---------------------------------------------------------------------------
WITH souctem AS (
  SELECT r.id,
         sum(
           CASE WHEN lower(coalesce(s->'length'->>'unit','minutes')) LIKE 'hour%'
                THEN (s->'length'->>'number')::numeric * 60
                ELSE (s->'length'->>'number')::numeric
           END
         ) AS minut
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.instructions, '[]'::jsonb)) b
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(b->'steps', '[]'::jsonb)) s
  WHERE s->'length'->>'number' IS NOT NULL
  GROUP BY r.id
)
UPDATE public.recipes_catalog r
SET prep_minutes_estimated    = ceil(souctem.minut)::integer,
    prep_minutes_source       = 'structured_length',
    prep_minutes_confidence   = NULL,
    prep_minutes_estimated_at = now()
FROM souctem
WHERE r.id = souctem.id
  AND souctem.minut > 0;

-- ---------------------------------------------------------------------------
-- 4. Recepty bez postupu se odhadovat nebudou — označit a nechat mimo
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog
SET prep_estimate_blocked = true
WHERE instructions IS NULL OR jsonb_array_length(instructions) = 0;

CREATE INDEX IF NOT EXISTS recipes_catalog_prep_minutes_idx
  ON public.recipes_catalog (prep_minutes_estimated)
  WHERE active = true AND prep_minutes_estimated IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Kontrola: 154 doplněných, měřená hodnota nedotčená.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_doplneno integer;
  v_mereno   integer;
BEGIN
  SELECT count(*) INTO v_doplneno
    FROM public.recipes_catalog WHERE prep_minutes_estimated IS NOT NULL;
  SELECT count(*) INTO v_mereno
    FROM public.recipes_catalog WHERE ready_in_minutes IS NOT NULL;

  IF v_doplneno <> 151 THEN
    RAISE EXCEPTION 'Doplnenych odhadu je %, cekali jsme 151.', v_doplneno;
  END IF;
  IF v_mereno <> 4 THEN
    RAISE EXCEPTION 'Receptu s merenym casem je %, cekali jsme 4 (migrace ho nesmi menit).', v_mereno;
  END IF;
END $$;
