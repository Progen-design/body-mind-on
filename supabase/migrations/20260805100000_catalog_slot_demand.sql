-- Poptavkova smycka generatoru: log poptavky po slotech + plneni fronty z nej.
--
-- ===========================================================================
-- CO UZ EXISTOVALO — ZADANI TO POPISOVALO JINAK, NEZ TO JE
-- ===========================================================================
-- Zadani rikalo, ze "CATALOG_SLOT_UNRESOLVED se pri skladani planu jen vyhodi
-- a zmizi" a ze frontu nic neplni podle poptavky. To uz neplati:
--
--   lib/recipesCatalog.js:773  objednejZNevyresenehoSlotu()  -> priorita 10
--   lib/recipesCatalog.js:166  objednejZNizkeNabidky()       -> priorita 50
--
-- Obe zapisuji do recipe_generation_queue se zdroj='demand'. Duplicity resi
-- unikatni index recipe_gen_queue_unikat na (meal_type, diet_tags, kcal_min,
-- kcal_max) WHERE stav IN ('pending','running').
--
-- Proc je tedy ve fronte 9 radku a vsechny 'seed'? Odpoved je v komentari
-- v recipesCatalog.js:309 — insert se driv volal BEZ await, takze ho serverless
-- funkce zabila ve chvili, kdy odesla odpoved. To uz je opravene (poptavka se
-- sbira do Map a odesila se awaitovane na konci skladani, radek 877), jen od te
-- opravy zadny plan neprobehl. Smycka tedy neni rozbita — jen jeste nevystrelila.
--
-- ===========================================================================
-- CO OPRAVDU CHYBELO A CO TAHLE MIGRACE PRIDAVA
-- ===========================================================================
-- 1) LOG POPTAVKY U KAZDEHO RESENI SLOTU, ne jen u selhani.
--    Dnesni kod zapise objednavku jen kdyz rows.length < limit. Slot, ktery
--    ma 2 kandidaty a limit 2, projde jako uspech — a to je presne ta trida
--    problemu, ktera se nikdy neprojevi jako chyba: vsichni uzivatele dostanou
--    totez jidlo. Bez cisla kandidatu se dira pozna az kdyz je uplna.
--
-- 2) PRIORITU PODLE CETNOSTI. Dnesni cesta je udalostni a prioritu ma pevnou
--    (10 / 50). Nevi, ze na jednu kombinaci narazi deset planu a na jinou jeden,
--    protoze unikatni index druhy signal zahodi. Agregovany log to vi.
--
-- ===========================================================================
-- OBJEM DAT: AGREGUJE SE PRI ZAPISU, NEPISI SE RADKY NA UDALOST
-- ===========================================================================
-- Skladac resi slot 86x na jeden plan. Radek na udalost by tabulku nafoukl bez
-- uzitku, protoze nas zajima "jak casto tahle dira" a ne kazdy jeji vyskyt.
-- Klic je (meal_type, diet_tags, kcal_min, kcal_max, den) a citace se scitaji.
--
-- KLICOVE ROZHODNUTI: kcal pasmo se ZAOKROUHLUJE NA 50. Bez toho by klic
-- explodoval — kcal_min/kcal_max se pocitaji z kaloricheho cile konkretniho
-- uzivatele (recipesCatalog.js: Math.floor(minKcal) / Math.ceil(maxKcal)), takze
-- jsou prakticky spojite a kazdy uzivatel by si zalozil vlastni radek. Po
-- zaokrouhleni je pocet kombinaci dany slotem, dietou a pasmem, tedy radove
-- desitky, a "cetnost" zacne mit vyznam.
--
-- diet_tags se ukladaji SETRIDENE. Btree bere {vegan,gluten_free} a
-- {gluten_free,vegan} jako dva rozdilne klice; bez setrideni by se stejna dira
-- pocitala dvakrat. (Stejnou slabinu ma i recipe_gen_queue_unikat — proto ji
-- RPC nize resi taky setridenim, at oba klice sedi.)
--
-- Den v klici drzi granularitu na trendy a umozni mazat stara data; udrzba je
-- na konci migrace.
--
-- ZADNE OSOBNI ANI ZDRAVOTNI UDAJE. Uklada se specifikace slotu, ne kdo si
-- o nej rekl — zadne user_id, zadna vaha, zadne cile. Proto tady take neni
-- zadny odkaz na uzivatele, pres ktery by se to dalo zpetne spojit.

CREATE TABLE IF NOT EXISTS public.catalog_slot_demand (
  meal_type        text    NOT NULL,
  diet_tags        text[]  NOT NULL DEFAULT '{}',
  kcal_min         integer NOT NULL,
  kcal_max         integer NOT NULL,
  den              date    NOT NULL DEFAULT current_date,
  -- kolikrat se tahle specifikace resila (uspesne i neuspesne)
  reseni           integer NOT NULL DEFAULT 0,
  -- kolikrat skoncila jako CATALOG_SLOT_UNRESOLVED (tvrda dira)
  nevyresenych     integer NOT NULL DEFAULT 0,
  -- nejhorsi (nejnizsi) pocet kandidatu, ktery se kdy videl
  kandidatu_min    integer,
  -- soucet kandidatu pres vsechna reseni, aby sel spocitat prumer
  kandidatu_celkem bigint  NOT NULL DEFAULT 0,
  -- nejvetsi zjisteny schodek proti limitu slotu
  chybi_max        integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_slot_demand_pkey PRIMARY KEY (meal_type, diet_tags, kcal_min, kcal_max, den)
);

CREATE INDEX IF NOT EXISTS catalog_slot_demand_den ON public.catalog_slot_demand (den DESC);

-- RLS je v tomhle repu povinne. Tabulka je interni telemetrie: nikdo z klientu
-- ji necte ani nepise, chodi se do ni jen pres SECURITY DEFINER funkce nize.
ALTER TABLE public.catalog_slot_demand ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='catalog_slot_demand'
                    AND policyname='catalog_slot_demand_service_write') THEN
    CREATE POLICY catalog_slot_demand_service_write ON public.catalog_slot_demand
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.catalog_slot_demand IS
  'Agregovana poptavka po slotech katalogu (bez PII). Klic = slot + dieta + kcal pasmo zaokrouhlene na 50 + den. Zdroj pro fill_recipe_queue_from_demand.';

-- ---------------------------------------------------------------------------
-- Zapis poptavky. Vola se pri KAZDEM reseni slotu, i uspesnem.
--
-- p_kandidatu   kolik kandidatu katalog vratil (0 = tvrda dira)
-- p_limit       kolik jich slot potreboval
-- p_nevyreseno  true, kdyz skladani spadlo na CATALOG_SLOT_UNRESOLVED
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_catalog_slot_demand(
  p_meal_type   text,
  p_diet_tags   text[],
  p_kcal_min    integer,
  p_kcal_max    integer,
  p_kandidatu   integer,
  p_limit       integer DEFAULT 0,
  p_nevyreseno  boolean DEFAULT false
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.catalog_slot_demand AS d
    (meal_type, diet_tags, kcal_min, kcal_max, den,
     reseni, nevyresenych, kandidatu_min, kandidatu_celkem, chybi_max, updated_at)
  SELECT
    p_meal_type,
    -- setrideno, aby {vegan,gluten_free} a {gluten_free,vegan} byl jeden klic
    coalesce((SELECT array_agg(t ORDER BY t) FROM unnest(coalesce(p_diet_tags,'{}')) t), '{}'),
    -- zaokrouhleni na 50 dolu/nahoru: klic musi byt konecny, viz komentar vyse
    (floor(greatest(0, coalesce(p_kcal_min, 0)) / 50.0) * 50)::integer,
    (ceil (greatest(0, coalesce(p_kcal_max, 0)) / 50.0) * 50)::integer,
    current_date,
    1,
    CASE WHEN p_nevyreseno THEN 1 ELSE 0 END,
    greatest(0, coalesce(p_kandidatu, 0)),
    greatest(0, coalesce(p_kandidatu, 0)),
    greatest(0, coalesce(p_limit, 0) - coalesce(p_kandidatu, 0)),
    now()
  ON CONFLICT (meal_type, diet_tags, kcal_min, kcal_max, den) DO UPDATE SET
    reseni           = d.reseni + 1,
    nevyresenych     = d.nevyresenych + CASE WHEN p_nevyreseno THEN 1 ELSE 0 END,
    kandidatu_min    = least(d.kandidatu_min, greatest(0, coalesce(p_kandidatu, 0))),
    kandidatu_celkem = d.kandidatu_celkem + greatest(0, coalesce(p_kandidatu, 0)),
    chybi_max        = greatest(d.chybi_max, greatest(0, coalesce(p_limit,0) - coalesce(p_kandidatu,0))),
    updated_at       = now();
$function$;

REVOKE ALL ON FUNCTION public.log_catalog_slot_demand(text, text[], integer, integer, integer, integer, boolean) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.log_catalog_slot_demand(text, text[], integer, integer, integer, integer, boolean) IS
  'Zapis poptavky po slotu. Agreguje se na (slot, dieta, kcal pasmo /50, den). Vola se i pri uspesnem reseni, aby byl videt tenky slot (1-3 kandidati), ne jen uplna dira.';

-- ---------------------------------------------------------------------------
-- Plneni fronty z nasbirane poptavky
--
-- OKNO 7 DNI. Kratsi okno by u malo vytizeneho slotu neuvidelo nic, delsi by
-- drzelo diry, ktere uz jsou zaplnene (generator mezitim recepty vyrobil).
--
-- CO JE DIRA:
--   tvrda  nevyresenych > 0            plan se kvuli tomu nedorucil
--   tenka  kandidatu_min <= 3          plan prosel, ale vsichni dostanou totez
-- Prah 3 je stejny, jaky pouziva zadani: 0 je chyba, 1-3 je problem kvality.
--
-- PRIORITA PODLE CETNOSTI. Zaklad drzi tvrde diry vzdycky pred tenkymi
-- (10 vs 50 — stejna cisla jako PRIORITA v lib/recipeGenerationQueue.js) a
-- v ramci skupiny jde driv to, na co narazi vic reseni. Rozsah je 10-19
-- a 50-59, takze se skupiny nikdy neprekryji.
--
-- STROP 3 POLOZKY NA BEH. Scheduler bere ~1 ulohu za hodinu a deli se o ni
-- s importem, takze realne vznikne par receptu denne. Ve fronte navic uz lezi
-- 4 pending seedy s nedodelanymi 19 recepty (pozadovano 36, vyrobeno 17).
-- Zaplavit frontu stovkou objednavek by jen znecitelnilo prioritu — objednavka,
-- ktera se dostane na radu za dva mesice, uz nepopisuje aktualni poptavku.
--
-- POZADOVANO SE ODVOZUJE OD VELIKOSTI DIRY: schodek proti limitu slotu, a u
-- tvrde diry navic tyden porci toho slotu. Strop 14, spodni mez 3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fill_recipe_queue_from_demand(
  p_okno_dni integer DEFAULT 7,
  p_limit    integer DEFAULT 3
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_zalozeno integer := 0;
  v_kandidatu integer := 0;
BEGIN
  WITH souhrn AS (
    SELECT d.meal_type, d.diet_tags, d.kcal_min, d.kcal_max,
           sum(d.reseni)::integer        AS reseni,
           sum(d.nevyresenych)::integer  AS nevyresenych,
           min(d.kandidatu_min)          AS kandidatu_min,
           max(d.chybi_max)::integer     AS chybi_max
    FROM public.catalog_slot_demand d
    WHERE d.den >= current_date - p_okno_dni
    GROUP BY d.meal_type, d.diet_tags, d.kcal_min, d.kcal_max
  ),
  diry AS (
    SELECT s.*,
           (s.nevyresenych > 0) AS tvrda
    FROM souhrn s
    WHERE s.nevyresenych > 0 OR coalesce(s.kandidatu_min, 0) <= 3
  ),
  -- Uz otevrena objednavka na tutez specifikaci = nezakladat druhou.
  -- Stejny klic jako recipe_gen_queue_unikat.
  nove AS (
    SELECT d.*,
           row_number() OVER (PARTITION BY d.tvrda ORDER BY d.reseni DESC, d.meal_type) AS poradi
    FROM diry d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.recipe_generation_queue q
      WHERE q.stav IN ('pending','running')
        AND q.meal_type = d.meal_type
        AND q.diet_tags = d.diet_tags
        AND q.kcal_min  = d.kcal_min
        AND q.kcal_max  = d.kcal_max
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
    SELECT v.meal_type, v.diet_tags, v.kcal_min, v.kcal_max,
           greatest(3, least(14, v.chybi_max + CASE WHEN v.tvrda THEN 7 ELSE 0 END)),
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

REVOKE ALL ON FUNCTION public.fill_recipe_queue_from_demand(integer, integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fill_recipe_queue_from_demand(integer, integer) IS
  'Z agregovane poptavky (catalog_slot_demand, okno 7 dni) zaklada objednavky do recipe_generation_queue se zdroj=demand. Tvrda dira ma prioritu 10-19, tenka 50-59, v ramci skupiny rozhoduje cetnost. Nezaklada duplicitu k otevrene objednavce. Strop 3 na beh.';

-- ---------------------------------------------------------------------------
-- Udrzba: poptavka starsi 90 dnu uz nic nerika, okno je 7 dnu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_catalog_slot_demand(p_starsi_nez_dnu integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_smazano integer;
BEGIN
  WITH smazane AS (
    DELETE FROM public.catalog_slot_demand
    WHERE den < current_date - p_starsi_nez_dnu
    RETURNING 1
  )
  SELECT count(*) INTO v_smazano FROM smazane;
  RETURN v_smazano;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_catalog_slot_demand(integer) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_pred_frontou integer;
  v_po_frontou   integer;
  v_vysledek     jsonb;
  v_poptavky     integer;
  v_test         integer;
BEGIN
  SELECT count(*) INTO v_pred_frontou FROM public.recipe_generation_queue;
  SELECT count(*) INTO v_poptavky FROM public.catalog_slot_demand;

  -- 1) Zapis poptavky musi fungovat a musi agregovat, ne pridavat radky.
  PERFORM public.log_catalog_slot_demand('obed', ARRAY['vegan','gluten_free'], 431, 642, 2, 5, false);
  PERFORM public.log_catalog_slot_demand('obed', ARRAY['gluten_free','vegan'], 437, 649, 1, 5, false);

  SELECT count(*) INTO v_test FROM public.catalog_slot_demand
  WHERE meal_type='obed' AND diet_tags = ARRAY['gluten_free','vegan'];
  IF v_test <> 1 THEN
    RAISE EXCEPTION 'Dve volani se stejnym slotem zalozila % radku misto 1 — klic neagreguje (setrideni tagu nebo zaokrouhleni kcal).', v_test;
  END IF;

  SELECT reseni INTO v_test FROM public.catalog_slot_demand
  WHERE meal_type='obed' AND diet_tags = ARRAY['gluten_free','vegan'];
  IF v_test <> 2 THEN
    RAISE EXCEPTION 'Citac reseni je % misto 2.', v_test;
  END IF;

  SELECT kandidatu_min INTO v_test FROM public.catalog_slot_demand
  WHERE meal_type='obed' AND diet_tags = ARRAY['gluten_free','vegan'];
  IF v_test <> 1 THEN
    RAISE EXCEPTION 'kandidatu_min je % misto 1 (nejhorsi videny pocet).', v_test;
  END IF;

  -- 2) Plnic z teto testovaci poptavky musi zalozit prave jednu objednavku
  --    (tenka dira, 1 kandidat) a musi jit o zdroj 'demand'.
  v_vysledek := public.fill_recipe_queue_from_demand(7, 3);
  SELECT count(*) INTO v_po_frontou FROM public.recipe_generation_queue;

  IF (v_vysledek->>'zalozeno')::int <> 1 THEN
    RAISE EXCEPTION 'Plnic zalozil % objednavek misto 1. Vysledek: %', v_vysledek->>'zalozeno', v_vysledek;
  END IF;

  -- 3) Druhe spusteni nesmi zalozit nic (duplicita k otevrene objednavce).
  v_vysledek := public.fill_recipe_queue_from_demand(7, 3);
  IF (v_vysledek->>'zalozeno')::int <> 0 THEN
    RAISE EXCEPTION 'Druhy beh zalozil % objednavek, mel 0 (duplicita).', v_vysledek->>'zalozeno';
  END IF;

  -- 4) Uklid po testu — produkcni data se testem nesmi zanest.
  DELETE FROM public.recipe_generation_queue
  WHERE zdroj='demand' AND meal_type='obed' AND diet_tags = ARRAY['gluten_free','vegan'];
  DELETE FROM public.catalog_slot_demand
  WHERE meal_type='obed' AND diet_tags = ARRAY['gluten_free','vegan'];

  SELECT count(*) INTO v_po_frontou FROM public.recipe_generation_queue;
  IF v_po_frontou <> v_pred_frontou THEN
    RAISE EXCEPTION 'Po uklidu je ve fronte % radku misto puvodnich %.', v_po_frontou, v_pred_frontou;
  END IF;

  SELECT count(*) INTO v_test FROM public.catalog_slot_demand;
  IF v_test <> v_poptavky THEN
    RAISE EXCEPTION 'Po uklidu je v poptavce % radku misto puvodnich %.', v_test, v_poptavky;
  END IF;

  -- 5) Kolik by smycka zalozila z REALNYCH dat. Tabulka je nova a prazdna,
  --    takze 0 je spravny vysledek a NENI to selhani — jen se to nema na cem
  --    projevit, dokud neprobehne skladani planu.
  v_vysledek := public.fill_recipe_queue_from_demand(7, 3);
  IF (v_vysledek->>'zalozeno')::int <> 0 THEN
    RAISE EXCEPTION 'Z realnych dat se zalozilo %, cekala se 0 (tabulka je prazdna).', v_vysledek->>'zalozeno';
  END IF;

  RAISE NOTICE 'Poptavkova smycka nasazena. Log agreguje (2 volani = 1 radek, citac 2), plnic zaklada a nezaklada duplicitu.';
  RAISE NOTICE 'Z realnych dat by dnes zalozila 0 objednavek — catalog_slot_demand je prazdna, prvni data prijdou az pri skladani planu.';
END $$;
