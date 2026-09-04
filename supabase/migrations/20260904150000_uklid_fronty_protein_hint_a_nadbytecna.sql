-- Úklid fronty generátoru — docs/DALSI_KROK.md 8.12.
--
-- TATO MIGRACE UŽ JE APLIKOVANÁ A ORAZÍTKOVANÁ NA PRODUKCI. Soubor níž je
-- OPRAVA KVŮLI REPRODUKOVATELNOSTI, ne nová změna schématu — původní verze
-- popisovala pořadí, které na produkci NEPROŠLO (capping pending/running
-- řádků narazil na unikátní index `recipe_gen_queue_unikat` dřív, než
-- stačil doběhnout: dvě `pending` objednávky lišící se jen podílem 0,4 a
-- 0,55 by se po zastropování na 0,25 staly TÝMŽ řádkem a UPDATE spadl na
-- "duplicate key"). Tenhle soubor popisuje pořadí, kterým se to na
-- produkci SKUTEČNĚ provedlo — ať jde znovu zreprodukovat na čisté DB.
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
--   2. Po zastropování existujících řádků na 0,25 se část z nich protne
--      specifikací s objednávkou, která na tentýž slot už čeká — ať už
--      jde o `failed` řádek, nebo o dvě `pending`/`running` objednávky,
--      které se dřív lišily jen (nesplnitelným) podílem. Zkoušet je znovu
--      je zbytečné — je to duplicitní poptávka, ne nová práce. Nemažou se
--      (historie fronty), dostávají nový stav `nadbytecna`.
--
--   3. `černý pepř` chybí v `pantry_ingredients`, přestože `pepr`,
--      `mlety pepr` i `kajensky pepr` tam jsou. Stejná třída chyby jako
--      „červená paprika" v 8.10 — jedna položka na tom spadla.
--
-- SKUTEČNÉ POŘADÍ Z PRODUKCE (4.–5. 9. 2026), s počty, které tenkrát vyšly
-- — čísla jsou historická poznámka, PROČ je pořadí takhle, ne assert, který
-- by migrace na jiných datech (nebo na čisté DB, kde vyjde 0 všude) musela
-- splnit:
--
--   1. CHECK na `stav` rozšířit o `nadbytecna`
--   2. zastropovat řádky MIMO pending/running (unikátní index se jich
--      netýká — `WHERE stav IN ('pending','running')` — takže tady
--      kolize nehrozí)                                              -> 46
--   3. pending/running řádky, které by PO zastropování na 0,25 kolidovaly
--      s jinou pending/running položkou na téže specifikaci -> `nadbytecna`
--      (tím zmizí z množiny, kterou unikátní index hlídá, DŘÍV, než se
--      vůbec zkusí zastropovat)                                     -> 11
--   4. zastropovat zbytek — nadbytecné z kroku 3 (potřebují to kvůli
--      CHECKu, který se přidává za chvíli, i když už nejsou aktivní) i
--      případné přeživší pending/running řádky nad 0,25 (po kroku 3 už
--      bez kolize, protože duplicity jsou pryč)                     -> 11
--   5. TEPRVE TEĎ `ADD CONSTRAINT protein_hint <= 0.25` — všechna data už
--      vyhovují, ALTER TABLE nemá na čem spadnout
--   6. `failed` duplicity (kryjí se s pending/running na tutéž
--      specifikaci) -> `nadbytecna`                                 -> 56
--   7. `cerny pepr` do `pantry_ingredients`
--
-- IDEMPOTENTNÍ CELÁ — jde spustit opakovaně beze změny výsledku po prvním
-- úspěšném běhu (capping už nic nenajde, ADD CONSTRAINT přepíše na totéž,
-- nadbytecna už nenajde žádný kolidující řádek, pantry insert má
-- ON CONFLICT).

-- ---------------------------------------------------------------------------
-- KROK 1. CHECK na `stav` rozšířit o `nadbytecna` — PŘED jakýmkoli UPDATEm,
-- co ho na řádek nastavuje, jinak ten UPDATE spadne na CHECK violation.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipe_generation_queue
  DROP CONSTRAINT IF EXISTS recipe_generation_queue_stav_check;

ALTER TABLE public.recipe_generation_queue
  ADD CONSTRAINT recipe_generation_queue_stav_check
  CHECK (stav IN ('pending', 'running', 'done', 'failed', 'cancelled', 'nadbytecna'));

COMMENT ON COLUMN public.recipe_generation_queue.stav IS
  'pending/running/done/failed/cancelled beze změny významu. nadbytecna (8.12): '
  'řádek, jehož specifikace se PO zastropování protein_hint na 0,25 kryje '
  's jinou položkou v pending/running — zkoušet znovu je zbytečné, '
  'duplicitní poptávku už řeší ten druhý řádek. Nikdy se nemaže, jen se '
  'přeznačí, ať historie fronty zůstane úplná.';

-- ---------------------------------------------------------------------------
-- KROK 2. Zastropovat řádky MIMO pending/running.
--
-- Unikátní index `recipe_gen_queue_unikat` (20260818150000) platí JEN
-- `WHERE stav IN ('pending','running')` — cokoli jiného (`done`, `failed`,
-- `cancelled`) tou podmínkou vůbec neprochází, takže capnout je jde vždycky
-- bezpečně, bez rizika kolize. Dělá se to jako první krok capping, aby
-- zbyla jen ta menšina (pending/running), která si žádá zvláštní ošetření
-- v kroku 3–4.
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
WHERE stav NOT IN ('pending', 'running')
  AND protein_hint ~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":[0-9.]+\}$'
  AND (protein_hint::jsonb ->> 'podil')::numeric > 0.25;

-- ---------------------------------------------------------------------------
-- KROK 3. Pending/running řádky, které by PO zastropování na 0,25
-- kolidovaly s jinou pending/running položkou na TÉŽE specifikaci —
-- `nadbytecna` DŘÍV, než se zastropují, aby capping v kroku 4 už neměl na
-- čem spadnout.
--
-- `budouci_hint` simuluje, jaký by `protein_hint` byl PO capu (u řádků,
-- které cap nepotřebují, zůstává beze změny). Group by je stejný klíč
-- jako unikátní index (meal_type, diet_tags, kcal_min, kcal_max,
-- coalesce(budouci_hint,'')) — v každé skupině přežije řádek s nejnižším
-- `id`, zbytek jde do `nadbytecna`. Funguje to obecně: nezáleží, jestli
-- "vítěz" skupiny byl už na 0,25, nebo bude teprve capnutý v kroku 4 —
-- obojí je zdravé.
-- ---------------------------------------------------------------------------
WITH budouci AS (
  SELECT
    q.id, q.meal_type, q.diet_tags, q.kcal_min, q.kcal_max,
    CASE
      WHEN q.protein_hint ~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":[0-9.]+\}$'
           AND (q.protein_hint::jsonb ->> 'podil')::numeric > 0.25
      THEN regexp_replace(q.protein_hint, '"podil":[0-9.]+\}$', '"podil":0.25}')
      ELSE q.protein_hint
    END AS budouci_hint
  FROM public.recipe_generation_queue q
  WHERE q.stav IN ('pending', 'running')
),
poradi AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY meal_type, diet_tags, kcal_min, kcal_max, coalesce(budouci_hint, '')
      ORDER BY id
    ) AS poradi_ve_skupine
  FROM budouci
)
UPDATE public.recipe_generation_queue q
SET stav = 'nadbytecna', updated_at = now()
FROM poradi
WHERE q.id = poradi.id
  AND poradi.poradi_ve_skupine > 1;

-- ---------------------------------------------------------------------------
-- KROK 4. Zastropovat zbytek — teď už bezpečně.
--
-- Bez podmínky na `stav`: chytí jak řádky právě demotované v kroku 3 (aby
-- i ony vyhověly CHECKu, který se přidává v kroku 5, přestože už nejsou
-- aktivní), tak jakýkoli přeživší pending/running řádek nad 0,25 — po
-- kroku 3 už žádný takový nemůže kolidovat s ničím jiným aktivním.
-- ---------------------------------------------------------------------------
UPDATE public.recipe_generation_queue
SET protein_hint = regexp_replace(protein_hint, '"podil":[0-9.]+\}$', '"podil":0.25}'),
    updated_at = now()
WHERE protein_hint ~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":[0-9.]+\}$'
  AND (protein_hint::jsonb ->> 'podil')::numeric > 0.25;

-- ---------------------------------------------------------------------------
-- KROK 5. Teprve TEĎ zpřísnit CHECK z 0,55 na 0,25 — všechna data už
-- vyhovují (kroky 2–4), takže ALTER TABLE nemá na čem spadnout.
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
-- KROK 6. `failed` řádky, které se PO zastropování kryjí s pending/running
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
-- KROK 7. "černý pepř" do pantry_ingredients — stejný vzor jako "římský
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
  v_nad_stropem          integer;
  v_aktivni_nad_stropem  integer;
  v_spatny_format        integer;
  v_kcal                 numeric;
BEGIN
  -- 1) Po capu nesmí zůstat žádný JSON podíl nad 0,25, kdekoli v tabulce.
  SELECT count(*) INTO v_nad_stropem
  FROM public.recipe_generation_queue
  WHERE protein_hint ~ '^\{("zdroj":"[a-z]+",)?"podil":[0-9.]+\}$'
    AND (protein_hint::jsonb ->> 'podil')::numeric > 0.25;
  IF v_nad_stropem > 0 THEN
    RAISE EXCEPTION 'Po zastropování zůstalo % řádků s podílem nad 0,25.', v_nad_stropem;
  END IF;

  -- 2) Specificky pending/running — přesně ta množina, kterou hlídá
  --    unikátní index a kolem které tahle migrace vznikla.
  SELECT count(*) INTO v_aktivni_nad_stropem
  FROM public.recipe_generation_queue
  WHERE stav IN ('pending', 'running')
    AND protein_hint ~ '^\{("zdroj":"[a-z]+",)?"podil":[0-9.]+\}$'
    AND (protein_hint::jsonb ->> 'podil')::numeric > 0.25;
  IF v_aktivni_nad_stropem > 0 THEN
    RAISE EXCEPTION '% pending/running řádků má pořád podíl nad 0,25.', v_aktivni_nad_stropem;
  END IF;

  -- 3) Capping nesmí rozbít formát (mezera by CHECK i regex výš odmítly).
  SELECT count(*) INTO v_spatny_format
  FROM public.recipe_generation_queue
  WHERE protein_hint IS NOT NULL
    AND protein_hint NOT IN ('hovezi', 'veprove', 'drubez', 'ryby', 'lusteniny', 'vejce', 'mlecne')
    AND protein_hint !~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":0\.[0-9]{1,2}\}$';
  IF v_spatny_format > 0 THEN
    RAISE EXCEPTION '% řádků protein_hint neodpovídá formátu CHECKu po migraci.', v_spatny_format;
  END IF;

  -- 4) "černý pepř" je teď pantry.
  IF NOT public.is_pantry_ingredient('cerny pepr') THEN
    RAISE EXCEPTION '"cerny pepr" neni v pantry_ingredients rozpoznany jako pantry.';
  END IF;
  SELECT kcal INTO v_kcal FROM public.compute_nutrition_for_ingredients(
    '[{"name":"losos","amount":100,"unit":"g"},{"name":"černý pepř","amount":2,"unit":"g"}]'::jsonb);
  IF v_kcal IS NULL THEN
    RAISE EXCEPTION 'Recept s "cerny pepr" se porad nespocital.';
  END IF;

  RAISE NOTICE 'Kontroly OK. Nad stropem: % (z toho pending/running: %), spatny format: %, losos+cerny pepr: % kcal.',
    v_nad_stropem, v_aktivni_nad_stropem, v_spatny_format, v_kcal;
END $$;
