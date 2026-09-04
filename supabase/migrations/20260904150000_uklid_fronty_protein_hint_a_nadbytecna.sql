-- Úklid fronty generátoru — docs/DALSI_KROK.md 8.12.
--
-- Tři samostatné díry, které vyplavaly z měření 4. 9. po nasazení 8.10:
--
--   1. CHECK na protein_hint pořád povoluje podíl až 0,55, ale kód od 8.5
--      (`omezPodilProObjednavku()`, MAX_PODIL_OBJEDNAVKY) žádnou NOVOU
--      objednávku s podílem nad 0,25 nezaloží. Staré řádky ve frontě si
--      vyšší hodnoty nesou dál (změřeno: 0,55/0,5/0,4 na vegetariánských
--      slotech — 55 % kalorií z bílkovin na svačině je nesplnitelné) a
--      schéma jim to nezakazuje. Kód a schéma si odporují a schéma je
--      slabší — 0,55 byl původní strop z dob PŘED 8.5, nikdy se
--      neupravil na to, co appka doopravdy zapisuje.
--
--   2. Po zastropování existujících řádků na 0,25 se část z nich (`failed`)
--      protne specifikací s objednávkou, která na tentýž slot už čeká
--      v `pending`/`running`. Zkoušet je znovu je zbytečné — je to
--      duplicitní poptávka, ne nová práce. Nemažou se (historie fronty),
--      dostávají nový stav `nadbytecna`.
--
--   3. `černý pepř` chybí v `pantry_ingredients`, přestože `pepr`,
--      `mlety pepr` i `kajensky pepr` tam jsou. Stejná třída chyby jako
--      „červená paprika" v 8.10 — jedna položka na tom spadla.
--
-- IDEMPOTENTNÍ CELÁ — jde spustit opakovaně beze změny výsledku po prvním
-- úspěšném běhu (capping už nic nenajde, ADD CONSTRAINT přepíše na totéž,
-- nadbytecna už nenajde žádný `failed` řádek, pantry insert má ON CONFLICT).

-- ---------------------------------------------------------------------------
-- KROK 1a. Napřed zastropovat DATA, teprve pak zpřísnit CONSTRAINT.
--
-- Pořadí je závazné: kdyby ADD CONSTRAINT běžel první, spadne na starých
-- řádcích s podílem 0,3–0,55 (ALTER TABLE kontroluje CHECK proti VŠEM
-- existujícím řádkům, ne jen budoucím zápisům).
--
-- `regexp_replace` na TEXTU, ne `jsonb_set`/cast na jsonb a zpátky —
-- jsonb výstup v Postgresu vkládá mezeru za dvojtečku (`{"podil": 0.25}`),
-- a CHECK regulární výraz níž (kompaktní formát, žádná mezera) by takovou
-- hodnotu okamžitě odmítl. Na tohle už jednou narazil Honzův druhý Claude.
-- `regexp_replace` mění jen číslo za `"podil":`, `zdroj` (je-li) zůstává
-- doslova, včetně pořadí klíčů, které vyžaduje unikátní index fronty.
-- ---------------------------------------------------------------------------
UPDATE public.recipe_generation_queue
SET protein_hint = regexp_replace(protein_hint, '"podil":[0-9.]+\}$', '"podil":0.25}'),
    updated_at = now()
WHERE protein_hint ~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":[0-9.]+\}$'
  AND (protein_hint::jsonb ->> 'podil')::numeric > 0.25;

-- ---------------------------------------------------------------------------
-- KROK 1b. Zpřísnit CHECK z 0,55 na 0,25.
--
-- Formát (regulární výraz, kanonické pořadí klíčů) je BEZE ZMĚNY — mění se
-- jen horní mez rozsahu podílu. `0.55` byl `MEZE_PODILU.MAX_PODIL`
-- (lib/nutrition/cilBilkovinSlotu.js) — teoretický strop výpočtu dluhu
-- pro zbytek dne. `0.25` je `MAX_PODIL_OBJEDNAVKY`
-- (lib/plan/proteinHint.js) — jediná hodnota, kterou `protein_hint` může
-- od 8.5 vůbec dostat, protože `objednejRecepty()` každý zápis ořízne
-- funkcí `omezPodilProObjednavku()`. Schéma teď hlídá totéž, co kód beztak
-- vynucuje — test `lib/__tests__/proteinHint.test.mjs` (`prahShodnySMigraci`)
-- čte TENHLE soubor, ne 20260823120000, který se dál netýká živého stavu.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipe_generation_queue
  DROP CONSTRAINT IF EXISTS recipe_generation_queue_protein_hint_check;

ALTER TABLE public.recipe_generation_queue
  ADD CONSTRAINT recipe_generation_queue_protein_hint_check
  CHECK (
    protein_hint IS NULL
    OR protein_hint IN ('hovezi', 'veprove', 'drubez', 'ryby', 'lusteniny', 'vejce', 'mlecne')
    OR (
      protein_hint ~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":0\.[0-9]{1,2}\}$'
      AND ((protein_hint::jsonb) ->> 'podil')::numeric > 0
      -- 0.25 = MAX_PODIL_OBJEDNAVKY z lib/plan/proteinHint.js. Bylo 0,55
      -- (MEZE_PODILU.MAX_PODIL) — schéma bylo slabší než kód od 8.5.
      AND ((protein_hint::jsonb) ->> 'podil')::numeric <= 0.25
    )
  );

COMMENT ON COLUMN public.recipe_generation_queue.protein_hint IS
  'Zadání bílkovin pro objednávku. Holý klíč skupiny z lib/plan/rotaceBilkovin.js '
  '(hovezi, veprove, drubez, ryby, lusteniny, vejce, mlecne), nebo JSON '
  '{"zdroj":...,"podil":...} s minimálním podílem bílkovin na kaloriích, podíl '
  '(0, 0.25> — MAX_PODIL_OBJEDNAVKY z lib/plan/proteinHint.js (8.5, 8.12). '
  'Serializuje a parsuje výhradně lib/plan/proteinHint.js — pořadí klíčů je '
  'součást formátu kvůli unikátnímu indexu fronty. NULL = odvodit z katalogu.';

-- ---------------------------------------------------------------------------
-- KROK 2a. Rozšířit CHECK na `stav` o `nadbytecna` — PŘED UPDATEm níž,
-- jinak UPDATE spadne na CHECK violation.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipe_generation_queue
  DROP CONSTRAINT IF EXISTS recipe_generation_queue_stav_check;

ALTER TABLE public.recipe_generation_queue
  ADD CONSTRAINT recipe_generation_queue_stav_check
  CHECK (stav IN ('pending', 'running', 'done', 'failed', 'cancelled', 'nadbytecna'));

COMMENT ON COLUMN public.recipe_generation_queue.stav IS
  'pending/running/done/failed/cancelled beze změny významu. nadbytecna (8.12): '
  '"failed" řádek, jehož specifikace se PO zastropování protein_hint na 0,25 '
  'kryje s jinou položkou v pending/running — zkoušet znovu je zbytečné, '
  'duplicitní poptávku už řeší ten druhý řádek. Nikdy se nemaže, jen se '
  'přeznačí, ať historie fronty zůstane úplná.';

-- ---------------------------------------------------------------------------
-- KROK 2b. Failed řádky, které se PO zastropování kryjí s pending/running
-- objednávkou na tutéž specifikaci — stejný klíč jako unikátní index
-- `recipe_gen_queue_unikat` (20260818150000): meal_type, diet_tags,
-- kcal_min, kcal_max, coalesce(protein_hint, '').
--
-- NEMAŽE SE nic — jen se mění `stav`. Historie fronty je jediné, z čeho se
-- dá zpětně poznat, co appka kdy vyžádala.
-- ---------------------------------------------------------------------------
UPDATE public.recipe_generation_queue f
SET stav = 'nadbytecna', updated_at = now()
WHERE f.stav = 'failed'
  AND EXISTS (
    SELECT 1 FROM public.recipe_generation_queue p
    WHERE p.id <> f.id
      AND p.stav IN ('pending', 'running')
      AND p.meal_type = f.meal_type
      AND p.diet_tags = f.diet_tags
      AND p.kcal_min = f.kcal_min
      AND p.kcal_max = f.kcal_max
      AND coalesce(p.protein_hint, '') = coalesce(f.protein_hint, '')
  );

-- ---------------------------------------------------------------------------
-- KROK 3. "černý pepř" do pantry_ingredients — stejný vzor jako "římský
-- kmín" (20260904090000): koření, rostlinné, zanedbatelná dávka.
-- ---------------------------------------------------------------------------
INSERT INTO public.pantry_ingredients (name_normalized, category, is_vegetarian, is_vegan)
VALUES ('cerny pepr', 'seasoning', true, true)
ON CONFLICT (name_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_nad_stropem   integer;
  v_spatny_format integer;
  v_kcal          numeric;
BEGIN
  -- 1) Po capu nesmí zůstat žádný JSON podíl nad 0,25.
  SELECT count(*) INTO v_nad_stropem
  FROM public.recipe_generation_queue
  WHERE protein_hint ~ '^\{("zdroj":"[a-z]+",)?"podil":[0-9.]+\}$'
    AND (protein_hint::jsonb ->> 'podil')::numeric > 0.25;
  IF v_nad_stropem > 0 THEN
    RAISE EXCEPTION 'Po zastropování zůstalo % řádků s podílem nad 0,25.', v_nad_stropem;
  END IF;

  -- 2) Capping nesmí rozbít formát (mezera by CHECK i regex výš odmítly).
  SELECT count(*) INTO v_spatny_format
  FROM public.recipe_generation_queue
  WHERE protein_hint IS NOT NULL
    AND protein_hint NOT IN ('hovezi', 'veprove', 'drubez', 'ryby', 'lusteniny', 'vejce', 'mlecne')
    AND protein_hint !~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":0\.[0-9]{1,2}\}$';
  IF v_spatny_format > 0 THEN
    RAISE EXCEPTION '% řádků protein_hint neodpovídá formátu CHECKu po migraci.', v_spatny_format;
  END IF;

  -- 3) "černý pepř" je teď pantry.
  IF NOT public.is_pantry_ingredient('cerny pepr') THEN
    RAISE EXCEPTION '"cerny pepr" neni v pantry_ingredients rozpoznany jako pantry.';
  END IF;
  SELECT kcal INTO v_kcal FROM public.compute_nutrition_for_ingredients(
    '[{"name":"losos","amount":100,"unit":"g"},{"name":"černý pepř","amount":2,"unit":"g"}]'::jsonb);
  IF v_kcal IS NULL THEN
    RAISE EXCEPTION 'Recept s "cerny pepr" se porad nespocital.';
  END IF;

  RAISE NOTICE 'Kontroly OK. Nad stropem: %, spatny format: %, losos+cerny pepr: % kcal.',
    v_nad_stropem, v_spatny_format, v_kcal;
END $$;
