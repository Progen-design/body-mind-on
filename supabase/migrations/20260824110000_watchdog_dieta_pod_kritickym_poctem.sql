-- Watchdog: dieta, kterou systém nedokáže dodat.
--
-- PROČ. Klient si při registraci vybere dietu a systém na ni nemá dost
-- receptů. Dnes se to pozná až tak, že jídelníček se opakuje nebo se slot
-- nevyřeší vůbec. Watchdog má osmnáct větví na katalog, import a překlad,
-- ale žádnou na to, jestli je vybraná dieta dodatelná.
--
-- ZMĚŘENO 24. 8. 2026 (aktivní recepty na slot):
--   gluten_free   snidane 50  svacina 67  obed 38  vecere 47   ← v pořádku
--   low_carb      snidane 13  svacina 14  obed  8  vecere 47   ← v pořádku
--   vegetarian    snidane 33  svacina 31  obed 15  vecere 22   ← v pořádku
--   vegan         snidane 11  svacina  9  obed 12  vecere 12   ← v pořádku
--   paleolithic   snidane  5  svacina  1  obed  5  vecere  0   ← PODKRITICKÉ
--   dairy_free    snidane 20  svacina  8  obed 21  vecere  0   ← PODKRITICKÉ
--   ketogenic     snidane 10  svacina  0  obed  3  vecere  1   ← PODKRITICKÉ
--
-- Vegan má nad hranicí všechny sloty, a přesto je v `dietOptions.js` vypnutý.
-- To je vědomé rozhodnutí (pestrost, ne počet) — větev proto hlásí i diety,
-- které se dnes nenabízejí. Jinak by se na paleo zapomnělo úplně.
--
-- PRÁH 7 SE NEKOPÍRUJE. Je to `MIN_RECEPTU_NA_SLOT` z lib/dietOptions.js:
-- tolik si objednává `objednejZNevyresenehoSlotu`, protože týden má sedm dní
-- a pod tím se jídelníček opakuje. Že se SQL a JS nerozešly, hlídá test
-- v lib/__tests__/dietaWatchdog.test.mjs.
--
-- ===========================================================================
-- JAK SE DO WATCHDOGU PŘIDÁVÁ VĚTEV
-- ===========================================================================
-- Pohled má přes dvacet větví a Postgres neumí do view přidat část — musel by
-- se celý přepsat ručně, což je nejlepší způsob, jak některou z nich tiše
-- ztratit. Proto tahle migrace zavádí tvar, ve kterém se to stát nemůže:
--
--   system_health_alerts_zaklad   původní tělo, nedotčené, jen přejmenované
--   system_health_alerts_<vetev>  jedna větev = jeden pohled
--   system_health_alerts          TENKÉ sjednocení, nic jiného
--
-- Další větev se přidává takhle: nový `system_health_alerts_<vetev>` a jeden
-- řádek `union all` v tenkém pohledu. Že v něm žádná větev nechybí, hlídá
-- test v lib/__tests__/dietaWatchdog.test.mjs — porovnává seznam pohledů
-- v migracích proti tomu, co tenký pohled opravdu sjednocuje.

alter view public.system_health_alerts rename to system_health_alerts_zaklad;

-- SECURITY_INVOKER SE MUSÍ DRŽET NA VŠECH POHLEDECH. Bez něj se view ptá
-- právy vlastníka a obejde RLS na `recipes_catalog` i na tabulkách, které
-- čtou původní větve. Nastavila ho migrace 20260729110816 a přejmenování
-- ho sice zachovává, ale každý nový pohled ho musí dostat taky — jinak by
-- celý watchdog běžel s právy vlastníka přes nadstavbu.
alter view public.system_health_alerts_zaklad set (security_invoker = true);

comment on view public.system_health_alerts_zaklad is
  'Původní tělo watchdogu. Nečíst přímo — cron čte system_health_alerts, '
  'které tenhle pohled sjednocuje s dalšími větvemi.';

-- ------------------------------------------------------------------ větev

-- Dieta, na kterou katalog nemá dost aktivních receptů ani na jeden slot.
--
-- Hlásí se jeden řádek na dietu, ne na slot: „paleo nejde dodat“ je jedna
-- informace. Které sloty chybí, je v detailu.
create or replace view public.system_health_alerts_dieta_pod_kritickym_poctem as
  select
    'warning'::text as severity,
    'dieta_pod_kritickym_poctem'::text as kod,
    'Dieta nema dost aktivnich receptu na slot - plan by se opakoval'::text as popis,
    string_agg(
      d.tag || ' (' || d.chybejici_sloty || ')',
      ', ' order by d.tag
    ) as detail,
    count(*)::bigint as pocet
  from (
    select
      t.tag,
      string_agg(
        s.slot || ': ' || coalesce(c.pocet, 0)::text,
        ', ' order by s.slot
      ) filter (where coalesce(c.pocet, 0) < 7) as chybejici_sloty
    from (
      -- Diety, které katalog tagem opravdu popisuje. `lactose_free` mezi nimi
      -- není schválně: neřeší se tagem, ale vyloučením mléčných výrobků
      -- v dietaryPublishGate.js, takže nulový počet tagů je u ní v pořádku.
      select unnest(array['vegan','vegetarian','gluten_free','low_carb','paleolithic','dairy_free','ketogenic']) as tag
    ) t
    cross join (
      select unnest(array['snidane','svacina','obed','vecere']) as slot
    ) s
    left join (
      select tg as tag, r.meal_type as slot, count(*) as pocet
      from public.recipes_catalog r, lateral unnest(r.diet_tags) tg
      where r.active
      group by tg, r.meal_type
    ) c on c.tag = t.tag and c.slot = s.slot
    group by t.tag
  ) d
  where d.chybejici_sloty is not null
  having count(*) > 0;

alter view public.system_health_alerts_dieta_pod_kritickym_poctem set (security_invoker = true);

-- ------------------------------------------------------------ sjednocení

create or replace view public.system_health_alerts as
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_zaklad
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_dieta_pod_kritickym_poctem;

alter view public.system_health_alerts set (security_invoker = true);

comment on view public.system_health_alerts is
  'Watchdog. TENKÉ sjednocení původního těla (system_health_alerts_zaklad) '
  'a jednotlivých větví (system_health_alerts_*). Nic jiného sem nepatří — '
  'detekce patří do větve. Cron /api/cron/system-health-alert čte tenhle pohled.';
