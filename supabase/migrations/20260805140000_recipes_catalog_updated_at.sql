-- recipes_catalog.updated_at — kdy se recept naposledy zmenil.
--
-- ===========================================================================
-- PROC
-- ===========================================================================
-- Tabulka mela jen created_at, takze neslo zjistit, kdy se recept naposledy
-- zmenil ani kdy se prepnul `active`. Po zapnuti casove brany (20260805090000)
-- neslo rict, ktere recepty sweeper vratil zpatky a kdy.
--
-- ===========================================================================
-- HLAVNI RIZIKO: BACKFILL JE UPDATE, A NA TEHLE TABULCE UPDATE NENI ZDARMA
-- ===========================================================================
-- recipes_catalog ma trg_enforce_recipe_catalog_rules BEFORE INSERT OR UPDATE.
-- Brana pri kazdem updatu aktivniho receptu znovu vyhodnoti VSECHNA pravidla
-- (makra, Atwater, pocet hlavnich surovin, cas, dietni tagy) a umi recept
-- deaktivovat. Backfill pres 568 radku by ji tedy spustil na kazdem z nich —
-- a v katalogu dnes lezi radky, ktere by tim spadly:
--   14 receptu ma nevyreseny konflikt diet_tags (chybi suroviny ve slovniku)
--   recept 614 je na hrane count_main_ingredients (10 z 10)
-- Presne tohle uz jednou zastavilo migraci 20260804200000.
--
-- RESENI: brana se pro dobu backfillu VYPNE a hned zapne zpatky. Je to jediny
-- zpusob, jak ciste doplnit sloupec bez toho, aby se znovu posuzovala
-- pravidla, ktera s updated_at nemaji nic spolecneho. Oboji je v jedne
-- transakci migrace, takze pri jakemkoli selhani se DISABLE odroluje spolu
-- se zbytkem a brana nikdy nezustane vypnuta.
--
-- protect_measured_ready_in_minutes se nevypina — jen brani prepsani merene
-- hodnoty, a backfill se ready_in_minutes nedotyka.
--
-- BACKFILL NASTAVUJE updated_at = created_at, ne now(). Tvarit se, ze se
-- vsech 568 receptu zmenilo dnes, by byla lez v datech.

-- Stav PRED zmenou, aby kontroly mely s cim srovnat.
CREATE TEMP TABLE _pred_aktivni ON COMMIT DROP AS
SELECT id FROM public.recipes_catalog WHERE active;

-- ---------------------------------------------------------------------------
-- 1. Sloupec
--
-- ADD COLUMN s nevolatilnim DEFAULT nepresepisuje tabulku a NESPOUSTI triggery
-- (Postgres 11+), takze samotne pridani sloupce branu nevzbudi.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.recipes_catalog.updated_at IS
  'Kdy se radek naposledy zmenil, vcetne prepnuti active branou nebo sweeperem. U radku zalozenych pred zavedenim sloupce je rovno created_at.';

-- ---------------------------------------------------------------------------
-- 2. Backfill s vypnutou branou
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog DISABLE TRIGGER trg_enforce_recipe_catalog_rules;

UPDATE public.recipes_catalog SET updated_at = created_at WHERE updated_at <> created_at;

ALTER TABLE public.recipes_catalog ENABLE TRIGGER trg_enforce_recipe_catalog_rules;

-- ---------------------------------------------------------------------------
-- 3. Trigger
--
-- Pouziva se UZ EXISTUJICI public.set_updated_at(). V databazi jsou ctyri
-- funkce, ktere delaji presne totez (set_updated_at, touch_updated_at,
-- update_updated_at_column, touch_ai_generated_plans_updated_at) — zakladat
-- patou by byl zrovna ten vzorec "dve mista nad stejnymi daty", ktery tahle
-- rada migraci odstranuje.
--
-- Trigger je az ZA backfillem schvalne: kdyby existoval driv, prepsal by
-- created_at hodnotu na now() a backfill by byl k nicemu.
--
-- Fire se pri kazdem UPDATE, i kdyz se zadny jiny sloupec nezmenil. Podminka
-- WHEN (OLD.* IS DISTINCT FROM NEW.*) by se vyhodnotila PRED ostatnimi BEFORE
-- triggery, takze by nevidela zmeny, ktere dela brana (napr. active := false) —
-- a prave ty chceme mit datovane.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_recipes_catalog_updated_at ON public.recipes_catalog;
CREATE TRIGGER set_recipes_catalog_updated_at
  BEFORE UPDATE ON public.recipes_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- CO SE ZAMERNE NEUDELALO
-- ===========================================================================
-- Index na updated_at nezakladam — 568 radku se preskenuje bez nej a
-- nepouzivany index je jen dalsi vec k udrzbe. Az bude tabulka radove vetsi
-- nebo se objevi dotaz, ktery ho potrebuje, da se pridat kdykoli.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_pred      integer;
  v_po        integer;
  v_deakt     integer;
  v_neshoda   integer;
  v_trigger   integer;
  v_vypnuty   integer;
  v_testovaci bigint;
  v_pred_ts   timestamptz;
  v_po_ts     timestamptz;
  v_aktivni   boolean;
  v_celkem    integer;
BEGIN
  -- 1) TO PODSTATNE: migrace nesmela deaktivovat ani jeden recept.
  SELECT count(*) INTO v_pred FROM _pred_aktivni;
  SELECT count(*) INTO v_po FROM public.recipes_catalog WHERE active;
  IF v_po <> v_pred THEN
    RAISE EXCEPTION 'Pocet aktivnich receptu se zmenil: % -> %.', v_pred, v_po;
  END IF;

  SELECT count(*) INTO v_deakt
  FROM _pred_aktivni p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE NOT r.active;
  IF v_deakt > 0 THEN
    RAISE EXCEPTION 'Backfill deaktivoval % receptu.', v_deakt;
  END IF;

  -- 2) Brana MUSI byt zpatky zapnuta. Kdyby zustala vypnuta, tise by prestala
  --    hlidat kazdy dalsi zapis do katalogu — horsi nez chybejici sloupec.
  SELECT count(*) INTO v_vypnuty FROM pg_trigger
  WHERE tgrelid = 'public.recipes_catalog'::regclass
    AND tgname = 'trg_enforce_recipe_catalog_rules'
    AND tgenabled = 'D';
  IF v_vypnuty > 0 THEN
    RAISE EXCEPTION 'trg_enforce_recipe_catalog_rules zustal VYPNUTY.';
  END IF;

  -- 3) Backfill: u vsech radku updated_at = created_at, nikde now().
  SELECT count(*) INTO v_neshoda FROM public.recipes_catalog WHERE updated_at <> created_at;
  IF v_neshoda > 0 THEN
    RAISE EXCEPTION 'U % radku neni updated_at rovno created_at.', v_neshoda;
  END IF;

  -- 4) Trigger existuje a opravdu funguje. Testuje se na receptu, ktery branou
  --    projde (vybirame aktivni bez konfliktu), aby test nemeril nahodou
  --    deaktivaci misto updated_at.
  SELECT count(*) INTO v_trigger FROM pg_trigger
  WHERE tgrelid = 'public.recipes_catalog'::regclass
    AND tgname = 'set_recipes_catalog_updated_at' AND NOT tgisinternal;
  IF v_trigger <> 1 THEN
    RAISE EXCEPTION 'Trigger set_recipes_catalog_updated_at neexistuje.';
  END IF;

  SELECT r.id, r.updated_at INTO v_testovaci, v_pred_ts
  FROM public.recipes_catalog r
  WHERE r.active AND NOT r.pending_review
    AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegetarian'),1) IS NULL
    AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegan'),1) IS NULL
    AND public.count_main_ingredients(r.ingredients) < 10
  ORDER BY r.id LIMIT 1;

  IF v_testovaci IS NULL THEN
    RAISE NOTICE 'Zadny recept nesplnil podminky pro test triggeru, test preskocen.';
  ELSE
    UPDATE public.recipes_catalog SET name_cs = name_cs WHERE id = v_testovaci;
    SELECT updated_at, active INTO v_po_ts, v_aktivni FROM public.recipes_catalog WHERE id = v_testovaci;
    IF v_po_ts <= v_pred_ts THEN
      RAISE EXCEPTION 'Trigger updated_at nezvedl (% -> %).', v_pred_ts, v_po_ts;
    END IF;
    IF NOT v_aktivni THEN
      RAISE EXCEPTION 'Testovaci update deaktivoval recept %.', v_testovaci;
    END IF;
    -- Test zmenil updated_at u jednoho radku; vracime ho na created_at, aby
    -- migrace nezanechala jediny radek, ktery tvrdi, ze se dnes zmenil.
    ALTER TABLE public.recipes_catalog DISABLE TRIGGER set_recipes_catalog_updated_at;
    UPDATE public.recipes_catalog SET updated_at = created_at WHERE id = v_testovaci;
    ALTER TABLE public.recipes_catalog ENABLE TRIGGER set_recipes_catalog_updated_at;
  END IF;

  SELECT count(*) INTO v_neshoda FROM public.recipes_catalog WHERE updated_at <> created_at;
  IF v_neshoda > 0 THEN
    RAISE EXCEPTION 'Po testu zustalo % radku s updated_at <> created_at.', v_neshoda;
  END IF;

  SELECT count(*) INTO v_celkem FROM public.recipes_catalog;
  RAISE NOTICE 'updated_at doplnen u % radku (= created_at), aktivnich zustalo % (bylo %), brana i trigger zapnute.',
    v_celkem, v_po, v_pred;
END $$;
