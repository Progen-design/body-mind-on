-- Název, který JE kanonický, alias nepotřebuje — je normalizovaný z definice.
--
-- ===========================================================================
-- PROČ
-- ===========================================================================
-- Watchdog hlásil 25. 8. 2026 třináct surovin jako „nemá kanonický název":
--   agáve, balsamico ocet, bazalka, červená řepa, chilli vločky, edamame,
--   granola, hroznové víno, ostružiny, ricotta, sezamová semínka,
--   sójové maso, tymián
--
-- VŠECH TŘINÁCT je kanonický název přímo v `ingredients_nutrition`. Slovník
-- je zná. Větev se ale ptala jen na `ingredient_aliases` — a self-alias
-- („granola" → „granola") nikdo nezakládá, protože k ničemu není. Chybí jich
-- 271 z 308, takže hlídka by křičela pokaždé, když plán sáhne na další
-- surovinu.
--
-- Hlídka, která hlásí jen falešné poplachy, je horší než žádná: naučí
-- člověka ji ignorovat. Tuhle větev opravovala už 20260822000000 (hlásila
-- suroviny ještě týden po doplnění aliasu) — tohle je druhá půlka téhož
-- problému.
--
-- ===========================================================================
-- PŘÍČINA JE JINDE NEŽ V HLÁŠCE
-- ===========================================================================
-- Řádky do `ingredient_normalization_misses` píše `/api/cron/shopping-normalize-audit`
-- podle `resolveCanonicalName().matched` z lib/ingredientNormalize.js. Ta se
-- databáze NEPTÁ VŮBEC — porovnává proti `lib/ingredientAliasSeed.js`, což je
-- konstanta v kódu se 74 kanonickými klíči a 13 aliasy. V databázi je přitom
-- 376 surovin a 503 aliasů.
--
-- Na otázku „známe tuhle surovinu?" tedy odpovídala tři různá místa třemi
-- různými slovníky. Změřeno: všech 13 hlášených dostane od `resolveCanonicalName`
-- `matched: false`, přestože je slovník v DB má.
--
-- Proto tahle migrace nezavádí jen podmínku navíc, ale JEDNU funkci, kterou
-- používá watchdog i ten cron: `je_ve_slovniku()`. Cron ji volá přes
-- `suroviny_mimo_slovnik()`, takže se v JS už žádná normalizace neopisuje.
--
-- CO SE NEMĚNÍ: `resolveCanonicalName` zůstává, jak je. Odpovídá na jinou
-- otázku — „mám pro tenhle název kanonický klíč a hezký popisek do nákupního
-- seznamu?" — a slouží k slučování položek, ne k posouzení slovníku. Když
-- klíč nenajde, seskupí položku pod jejím normalizovaným názvem a zobrazí ho;
-- nákupní seznam se tím nerozbije.
--
-- SPÍŽ SE ZÁMĚRNĚ NEPŘIDÁVÁ. Tři z těch třinácti jsou i v `pantry_ingredients`,
-- ale na nulu stačí slovník a rozšiřovat, co se považuje za „známé", by
-- znamenalo tišit i to, co tichý zůstat nemá. Až se ukáže, že spíž chybí,
-- přidá se sem jedním `or`.

-- ------------------------------------------------------------- slovník

-- Zná slovník tuhle surovinu?
--
-- JEDINÉ MÍSTO, kde je ta otázka zodpovězená. Volá ji watchdog i cron, který
-- log plní — přesně proto, aby se nemohly rozejít tak, jako se rozešly
-- s `resolveCanonicalName`.
--
-- Kanonický název i alias platí stejně: alias je jen další způsob, jak tutéž
-- surovinu pojmenovat. Název, který je kanonický, alias nepotřebuje.
create or replace function public.je_ve_slovniku(p_nazev text)
returns boolean
language sql
stable
strict
parallel safe
set search_path to ''
as $function$
  select exists (
    select 1 from public.ingredient_aliases a
     where lower(btrim(a.alias_normalized)) = public.normalizuj_nazev_suroviny(p_nazev)
  ) or exists (
    select 1 from public.ingredients_nutrition n
     where n.name_cs is not null
       and public.normalizuj_nazev_suroviny(n.name_cs) = public.normalizuj_nazev_suroviny(p_nazev)
  );
$function$;

comment on function public.je_ve_slovniku(text) is
  'Zna slovnik tuhle surovinu? Kanonicky nazev v ingredients_nutrition NEBO alias '
  'v ingredient_aliases. Jedine misto, kde ta otazka zije - vola watchdog i '
  '/api/cron/shopping-normalize-audit.';

-- Které z předaných názvů slovník nezná.
--
-- PROČ POLE A NE JEDEN NÁZEV. Cron má na začátku běhu seznam surovin ze všech
-- aktivních plánů a potřebuje odpověď na všechny naráz. Kdyby se ptal po
-- jednom, je to stovky round-tripů; kdyby si slovník stáhl a porovnával v JS,
-- musel by `normalizuj_nazev_suroviny` opsat do JavaScriptu — a byli bychom
-- zpátky u dvou slovníků, které se rozejdou.
create or replace function public.suroviny_mimo_slovnik(p_nazvy text[])
returns text[]
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    array_agg(distinct nazev) filter (
      where btrim(coalesce(nazev, '')) <> '' and not public.je_ve_slovniku(nazev)
    ),
    '{}'::text[]
  )
  from unnest(coalesce(p_nazvy, '{}'::text[])) as nazev;
$function$;

comment on function public.suroviny_mimo_slovnik(text[]) is
  'Podmnozina nazvu, ktere slovnik nezna. Cte /api/cron/shopping-normalize-audit '
  'pres RPC, aby se normalizace neopisovala do JS.';

grant execute on function public.je_ve_slovniku(text) to service_role;
grant execute on function public.suroviny_mimo_slovnik(text[]) to service_role;

-- ------------------------------------------------------------ watchdog

-- Větev `nenormalizovana_surovina` sedí uvnitř `system_health_alerts_zaklad`,
-- což je původní tělo watchdogu s dvaceti větvemi. Přepisovat ho ručně je
-- nejlepší způsob, jak některou z nich tiše ztratit, takže se — stejně jako
-- v 20260822000000 — vymění jen ta jedna podmínka v textu definice.
--
-- Vzor je odolný vůči zalomení a odsazení, protože `pg_get_viewdef` obojí
-- generuje sám a nemáme ho pod kontrolou.
DO $$
DECLARE
  puvodni text;
  nova    text;
  vzor    text;
  shod    integer;
BEGIN
  IF to_regclass('public.system_health_alerts_zaklad') IS NULL THEN
    RAISE EXCEPTION 'system_health_alerts_zaklad neexistuje — migrace by tise neudelala nic';
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  IF puvodni LIKE '%je_ve_slovniku%' THEN
    RAISE NOTICE 'oprava uz je zavedena, preskakuji';
    RETURN;
  END IF;

  vzor := 'AND NOT \(EXISTS \( SELECT 1\s+FROM ingredient_aliases a\s+'
       || 'WHERE lower\(btrim\(a\.alias_normalized\)\) = normalizuj_nazev_suroviny\(m\.raw_name\)\)\)';

  SELECT count(*) INTO shod FROM regexp_matches(puvodni, vzor, 'g');
  IF shod <> 1 THEN
    RAISE EXCEPTION 'podminka vetve nenormalizovana_surovina nalezena %x, cekali jsme 1x', shod;
  END IF;

  nova := regexp_replace(puvodni, vzor, 'AND NOT public.je_ve_slovniku(m.raw_name)');

  -- SECURITY_INVOKER SE OBNOVUJE EXPLICITNE. CREATE OR REPLACE VIEW ho jinak
  -- prepise na vychozi a pohled by obchazel RLS zdrojovych tabulek.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts_zaklad '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

-- ===========================================================================
-- Kontroly
-- ===========================================================================
--
-- ZÁMĚRNĚ SE NETVRDÍ POČET ŘÁDKŮ. Je jich dnes 0, ale kdyby se mezi napsáním
-- a nasazením objevila surovina, kterou slovník opravdu nezná, migrace by
-- spadla na tom, že watchdog správně funguje. Přesně tohle dělá `supabase
-- db reset` v tomhle repu nepoužitelným (29 z 90 migrací tvrdí produkční
-- počty). Kontroluje se tedy INVARIANT, ne stav.
DO $$
DECLARE
  v_definice   text;
  v_ve_slovniku integer;
BEGIN
  v_definice := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  IF v_definice NOT LIKE '%je_ve_slovniku%' THEN
    RAISE EXCEPTION 'vetev se neprepsala';
  END IF;

  IF v_definice NOT LIKE '%uzivatel_bez_planu%' THEN
    RAISE EXCEPTION 'pri prepisu se ztratily ostatni vetve watchdogu';
  END IF;

  -- INVARIANT: co watchdog hlasi, to slovnik neznat NESMI. Cte se z pohledu,
  -- ne z tabulky — overuje se tedy vysledek, ne zamer.
  WITH hlasene AS (
    SELECT btrim(x) AS nazev
    FROM public.system_health_alerts a
    CROSS JOIN LATERAL unnest(string_to_array(a.detail, ',')) AS x
    WHERE a.kod = 'nenormalizovana_surovina'
  )
  SELECT count(*) INTO v_ve_slovniku
  FROM hlasene WHERE public.je_ve_slovniku(nazev);
  IF v_ve_slovniku > 0 THEN
    RAISE EXCEPTION 'watchdog porad hlasi % surovin, ktere slovnik zna', v_ve_slovniku;
  END IF;

  RAISE NOTICE 'Vetev nenormalizovana_surovina se pta i na kanonicky nazev.';
END $$;
