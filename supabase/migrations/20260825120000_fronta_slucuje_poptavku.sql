-- Fronta objednává jedno pásmo na chod, ne jedno na uživatele.
--
-- ===========================================================================
-- PROČ
-- ===========================================================================
-- Fronta si 25. 8. 2026 říkala o 2 042 kusů ve 100 otevřených položkách.
-- Generátor dělá 20 denně, takže 104 dní — a fronta roste při každém
-- generování plánu. Nikdy se nevyprázdní.
--
-- Těch 100 položek přitom pokrývá jen 17 kombinací (slot × dieta × bílkovinný
-- hint). Tříští je VÝHRADNĚ kalorické pásmo, protože si ho každá objednávka
-- bere z cíle konkrétního uživatele (`cil/2` až `cil*2`). Unikátní index
-- `recipe_gen_queue_unikat` má pásmo v klíči, takže dvě skoro stejné poptávky
-- založí dva řádky a nikdy se nespojí.
--
-- A tříští ji i nesmysly, které se do pásma dostaly:
--   svacina low_carb   50–2500 kcal   (objednávka na cokoli)
--   snidane            912–1200 kcal  (model neumí: medián 392, maximum 542)
-- Přesně tyhle položky pak končí ve stavu `failed` — 8 ze 14 selhalo na tom,
-- že model netrefil pásmo.
--
-- UŽIVATELSKÉ PÁSMO V OBJEDNÁVCE NEDÁVÁ SMYSL. Katalog je SDÍLENÝ. Kolik
-- kalorií potřebuje konkrétní člověk, se rozhoduje až při skládání jídelníčku,
-- kde se porce škáluje (0,5–2,0×). Objednávka má říkat „co model pro tenhle
-- chod umí vyrobit", a to je jedno číslo na chod.
--
-- CO SE MĚNÍ
--   1. `kanonicke_pasmo_slotu()` — jedno pásmo na chod, zrcadlí
--      KANONICKA_PASMA z lib/recipeGenerationBands.js.
--   2. `fill_recipe_queue_from_demand` pásmo kanonizuje a slučuje poptávku
--      na (slot, dieta, hint) místo přesné shody pásma.
--   3. Strop na jednu objednávku: 7 = MIN_RECEPTU_NA_SLOT.
--   4. Jednorázové sloučení 100 otevřených položek.
--
-- ZMĚŘENO PŘEDEM: 2 042 kusů ve 100 položkách → 114 v 17 položkách.
--
-- CO SE NEMĚNÍ: validace v `zapisRecept()`. Recept mimo pásmo se dál zahodí.
-- Mění se ZADÁNÍ, ne kontrola — stejně jako u 20260822... (srovnejPasmo).

-- ------------------------------------------------------- kanonické pásmo

-- Zrcadlí KANONICKA_PASMA z lib/recipeGenerationBands.js, které vzniká
-- z ROZSAHY_CHODU: spodní hranice = `spodni_strop`, horní = `horni_podlaha`,
-- rozšířeno na MIN_SIRKA_PASMA (200 kcal), když je pásmo užší.
--
-- Svačina je jediná, které se rozšíření týká: 170–350 → 170–370.
--
-- Že se SQL a JS nerozešly, hlídá test v lib/__tests__/frontaSlucovani.test.mjs.
create or replace function public.kanonicke_pasmo_slotu(p_meal_type text)
returns table(kcal_min integer, kcal_max integer)
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select v.kcal_min, v.kcal_max
  from (values
    ('snidane', 300, 520),
    ('obed',    450, 680),
    ('vecere',  300, 650),
    ('svacina', 170, 370)
  ) as v(chod, kcal_min, kcal_max)
  where v.chod = lower(btrim(coalesce(p_meal_type, '')));
$function$;

comment on function public.kanonicke_pasmo_slotu(text) is
  'Jedno kaloricke pasmo na chod. Zrcadli KANONICKA_PASMA v '
  'lib/recipeGenerationBands.js. Prazdny vysledek = neznamy chod.';

-- ------------------------------------------------------------- plnič fronty

-- Slučuje poptávku na (slot, dieta, hint) a objednává kanonické pásmo.
--
-- ROZDÍL PROTI PŮVODNÍ VERZI:
--   * `kcal_min/kcal_max` se berou z `kanonicke_pasmo_slotu()`, ne z poptávky.
--     Poptávkové pásmo se tím zahazuje záměrně — viz hlavička.
--   * Souhrn a kontrola duplicity ignorují pásmo. Otevřená objednávka na
--     (slot, dieta, hint) znamená „tuhle díru už řešíme".
--   * `pozadovano` má strop 7 (MIN_RECEPTU_NA_SLOT). Původní `least(14, …)`
--     dovoloval dvojnásobek.
--   * Neznámý chod se přeskočí. Objednat pásmo, které jsme neměřili, by bylo
--     horší než neobjednat nic.
create or replace function public.fill_recipe_queue_from_demand(
  p_okno_dni integer DEFAULT 7, p_limit integer DEFAULT 3
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_zalozeno integer := 0;
  v_kandidatu integer := 0;
BEGIN
  WITH souhrn AS (
    -- Pasmo v GROUP BY NENI. To je cela oprava: poptavka se scita pres nej.
    SELECT d.meal_type, d.diet_tags,
           sum(d.reseni)::integer        AS reseni,
           sum(d.nevyresenych)::integer  AS nevyresenych,
           min(d.kandidatu_min)          AS kandidatu_min,
           max(d.chybi_max)::integer     AS chybi_max
    FROM public.catalog_slot_demand d
    WHERE d.den >= current_date - p_okno_dni
    GROUP BY d.meal_type, d.diet_tags
  ),
  diry AS (
    SELECT s.*, (s.nevyresenych > 0) AS tvrda,
           p.kcal_min AS pasmo_min, p.kcal_max AS pasmo_max
    FROM souhrn s
    CROSS JOIN LATERAL public.kanonicke_pasmo_slotu(s.meal_type) p
    WHERE s.nevyresenych > 0 OR coalesce(s.kandidatu_min, 0) <= 3
  ),
  nove AS (
    SELECT d.*,
           row_number() OVER (PARTITION BY d.tvrda ORDER BY d.reseni DESC, d.meal_type) AS poradi
    FROM diry d
    -- Otevrena objednavka na tutez (slot, dieta) = nezakladat druhou.
    -- Pasmo se schvalne NEPOROVNAVA — po kanonizaci je stejne stejne, a kdyby
    -- ve fronte zbyl stary radek s jinym pasmem, druhy by k nemu nepribyl.
    WHERE NOT EXISTS (
      SELECT 1 FROM public.recipe_generation_queue q
      WHERE q.stav IN ('pending','running')
        AND q.meal_type = d.meal_type
        AND q.diet_tags = d.diet_tags
    )
  ),
  vybrane AS (
    SELECT * FROM nove
    ORDER BY tvrda DESC, reseni DESC
    LIMIT greatest(0, p_limit)
  ),
  vlozene AS (
    INSERT INTO public.recipe_generation_queue
      (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj)
    SELECT v.meal_type, v.diet_tags, v.pasmo_min, v.pasmo_max,
           -- Strop 7 = MIN_RECEPTU_NA_SLOT. Vic uz jen odsouva jinou diru.
           greatest(3, least(7, v.chybi_max + CASE WHEN v.tvrda THEN 7 ELSE 0 END)),
           CASE WHEN v.tvrda THEN 10 ELSE 50 END + least(9, v.poradi - 1),
           'demand'
    FROM vybrane v
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT (SELECT count(*) FROM vlozene), (SELECT count(*) FROM nove)
    INTO v_zalozeno, v_kandidatu;

  RETURN jsonb_build_object(
    'zalozeno', v_zalozeno,
    'kandidatu_na_dire', v_kandidatu,
    'okno_dni', p_okno_dni,
    'limit', p_limit,
    'filled_at', now()
  );
END;
$function$;

-- --------------------------------------------------- sloučení stávající fronty

-- Sto otevřených položek se slučuje na sedmnáct.
--
-- `vyrobeno` se u přeživšího řádku NULUJE a `pozadovano` se nastavuje na
-- zastropovaný zbytek. Fronta je pracovní seznam, ne účetní kniha — kolik
-- kusů kdy vzniklo, je v `recipes_catalog` a v `ai_runs`. Nechat původní
-- `vyrobeno` by znamenalo, že sloučená položka je hned zčásti hotová,
-- což by neodpovídalo ničemu.
DO $$
DECLARE
  v_pred_polozek integer;
  v_pred_kusu    integer;
  v_po_polozek   integer;
  v_po_kusu      integer;
BEGIN
  SELECT count(*), sum(pozadovano - coalesce(vyrobeno, 0))
    INTO v_pred_polozek, v_pred_kusu
  FROM public.recipe_generation_queue WHERE stav = 'pending';

  -- Přeživší = nejvyšší priorita (nejnižší číslo), pak nejstarší.
  CREATE TEMP TABLE _slouceni ON COMMIT DROP AS
  SELECT DISTINCT ON (meal_type, coalesce(diet_tags, '{}'::text[]), coalesce(protein_hint, ''))
         id AS prezije,
         meal_type,
         coalesce(diet_tags, '{}'::text[]) AS tagy,
         coalesce(protein_hint, '') AS hint
  FROM public.recipe_generation_queue
  WHERE stav = 'pending'
  ORDER BY meal_type, coalesce(diet_tags, '{}'::text[]), coalesce(protein_hint, ''),
           priorita, created_at;

  CREATE TEMP TABLE _souhrn ON COMMIT DROP AS
  SELECT meal_type,
         coalesce(diet_tags, '{}'::text[]) AS tagy,
         coalesce(protein_hint, '') AS hint,
         least(7, greatest(1, sum(pozadovano - coalesce(vyrobeno, 0))::integer)) AS kusu
  FROM public.recipe_generation_queue
  WHERE stav = 'pending'
  GROUP BY 1, 2, 3;

  -- Nejdřív smazat, teprve pak přepsat přeživší — jinak by přepis na
  -- kanonické pásmo narazil na unikát u řádku, který za chvíli zmizí.
  DELETE FROM public.recipe_generation_queue q
  WHERE q.stav = 'pending'
    AND NOT EXISTS (SELECT 1 FROM _slouceni s WHERE s.prezije = q.id);

  UPDATE public.recipe_generation_queue q
  SET kcal_min = p.kcal_min,
      kcal_max = p.kcal_max,
      pozadovano = so.kusu,
      vyrobeno = 0,
      updated_at = now()
  FROM _slouceni s
  JOIN _souhrn so
    ON so.meal_type = s.meal_type AND so.tagy = s.tagy AND so.hint = s.hint
  CROSS JOIN LATERAL public.kanonicke_pasmo_slotu(s.meal_type) p
  WHERE q.id = s.prezije;

  SELECT count(*), sum(pozadovano - coalesce(vyrobeno, 0))
    INTO v_po_polozek, v_po_kusu
  FROM public.recipe_generation_queue WHERE stav = 'pending';

  RAISE NOTICE 'Fronta sloucena: % polozek / % kusu -> % polozek / % kusu.',
    v_pred_polozek, v_pred_kusu, v_po_polozek, v_po_kusu;

  -- Sloucenim se nesmi objednavat VIC, nez se objednavalo. Kontroluje se
  -- smer, ne konkretni cislo — to zavisi na datech v okamziku nasazeni.
  IF v_po_kusu > v_pred_kusu THEN
    RAISE EXCEPTION 'Slouceni frontu zvetsilo: % -> % kusu.', v_pred_kusu, v_po_kusu;
  END IF;

  -- Zadna otevrena polozka nesmi zustat nad stropem ani mimo kanonicke pasmo.
  IF EXISTS (SELECT 1 FROM public.recipe_generation_queue
              WHERE stav = 'pending' AND pozadovano > 7) THEN
    RAISE EXCEPTION 'Ve fronte zustala polozka nad stropem 7 kusu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recipe_generation_queue q
    WHERE q.stav = 'pending'
      AND EXISTS (SELECT 1 FROM public.kanonicke_pasmo_slotu(q.meal_type) p
                   WHERE (q.kcal_min, q.kcal_max) IS DISTINCT FROM (p.kcal_min, p.kcal_max))
  ) THEN
    RAISE EXCEPTION 'Ve fronte zustala polozka mimo kanonicke pasmo slotu.';
  END IF;
END $$;
