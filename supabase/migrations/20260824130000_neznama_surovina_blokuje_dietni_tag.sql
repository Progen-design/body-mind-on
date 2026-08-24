-- Neznámá surovina, která shodí dietní tag, je pracovní seznam pro slovník.
--
-- ===========================================================================
-- PROČ
-- ===========================================================================
-- Migrace 20260824120000 zavedla správné, ale TICHÉ pravidlo: surovina, kterou
-- slovník neumí posoudit, shodí `gluten_free`. „Nevíme“ není „bez lepku“ a to
-- je správná strana chyby.
--
-- Tiché to je proto, že recept zůstane aktivní a v katalogu — jen se přestane
-- nabízet celiakovi. Nikde se nerozsvítí, že se to stalo, a slovník sám
-- neroste. Změřeno 24. 8. 2026: z 199 receptů, které tag nesly, o něj kvůli
-- neznámé surovině přijde 27. Bez téhle migrace by jich každým importem
-- přibývalo a nikdo by se to nedozvěděl — tichá eroze katalogu.
--
-- ===========================================================================
-- PROČ POHLED A NE ZÁPIS DO TABULKY
-- ===========================================================================
-- `ingredient_normalization_misses` se na to NEHODÍ:
--   * Významem odpovídá na jinou otázku — „surovina v aktivním PLÁNU nemá
--     kanonický název". Je klíčovaná na `plan_id` (FK → ai_generated_plans,
--     ON DELETE CASCADE). Naše surovina žádný plán nemá, patří k receptu.
--   * Prakticky by tam zmizela. Větev `nenormalizovana_surovina` ve watchdogu
--     joinuje `ai_generated_plans p ON p.id = m.plan_id AND p.is_active`, takže
--     řádky s `plan_id IS NULL` by nikdy nikdo neviděl. A `UNIQUE (raw_name,
--     plan_id)` nad NULL nededuplikuje (NULL <> NULL), takže by každý zápis
--     receptu přidal duplicitu. To je přesně ta tichá ztráta, které se bráníme.
--
-- VLASTNÍ TABULKA BY BYLA TAKY ŠPATNĚ, jen dráž. Zápis by musel vzniknout
-- v BEFORE triggeru, kde recept ještě neexistuje a FK na `recipes_catalog`
-- nejde splnit; potřeboval by dedup, RLS, úklidový cron a řešení zastarání.
-- A hlavně by nic nepřidal: recept o tag jen přijde, z katalogu nezmizí, takže
-- se stav dá kdykoli spočítat z katalogu. Log by navíc dál ukazoval názvy,
-- které už někdo do slovníku doplnil — a tak pracovní seznamy umírají.
--
-- POHLED SE ČISTÍ SÁM. Doplní se surovina do slovníku → název ze seznamu
-- zmizí. Zmizí recept → klesne počet. To je vlastnost, kterou log nemá.
--
-- CENA. Změřeno na produkci: ~2,1 s nad 732 aktivními recepty. Cron
-- /api/cron/system-health-alert běží 1x denně (30 7 * * *) s maxDuration 60 s,
-- takže se index na `lower(unaccent(name_cs))` nevyplatí zavádět kvůli tomuhle
-- (potřeboval by IMMUTABLE obal nad `unaccent`, který je jen STABLE).

-- ------------------------------------------------- posouzení surovin

-- Jak slovník vidí každou surovinu receptu vůči jednomu dietnímu tagu.
--
-- Vrací tři možné verdikty, protože ty tři stavy opravdu existují:
--   ok        slovník potvrdil, že surovina tag splňuje
--   konflikt  slovník potvrdil, že NEsplňuje (chléb u gluten_free)
--   neznama   slovník neví — surovina v něm není, nebo nemá posouzený příznak
--
-- `recipe_diet_conflicts` slévá poslední dva do jednoho, protože bráně stačí
-- vědět, že tag nevznikne. Pracovní seznam je ale potřebuje rozlišit: doplnit
-- do slovníku jde jen `neznama`. `konflikt` je správný výsledek, ne mezera.
--
-- NORMALIZACE JE TADY JEDINKRÁT. `recipe_diet_conflicts` se níž přepisuje tak,
-- aby četla z týhle funkce — jinak by rozpad názvu, alias a shoda proti spíži
-- žily ve dvou kopiích, které se tiše rozejdou.
create or replace function public.recipe_posouzeni_surovin(p_ingredients jsonb, p_tag text)
returns table(surovina text, verdikt text)
language sql
stable
set search_path to ''
as $function$
with rozpad as (
  select lower(extensions.unaccent(regexp_replace(trim(i->>'name'), '\s+', ' ', 'g'))) as n_raw
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) i
),
res as (
  select coalesce(
    (select a.canonical_normalized from public.ingredient_aliases a
      where a.alias_normalized = rz.n_raw),
    rz.n_raw
  ) as rn
  from rozpad rz
),
posouzeno as (
  select res.rn,
    (select case
              when p_tag = 'vegan' then inu.is_vegan
              -- TŘÍHODNOTOVĚ, ne `obsahuje_lepek is false`. Komentář u sloupce
              -- říká „NULL = neposouzeno", ale `is false` z neposouzeného dělá
              -- tvrzení „obsahuje lepek". Rozdíl: neposouzená surovina teď
              -- propadne na spíž, místo aby tag zablokovala sama — přesně jako
              -- u `is_vegan`. Tag může jedině přibýt, a jen když ho spíž
              -- kladně potvrdí; „nevíme" se pořád na „bez lepku" nemění.
              when p_tag = 'gluten_free' then
                case when inu.obsahuje_lepek is null then null
                     else not inu.obsahuje_lepek end
              else inu.is_vegetarian
            end
       from public.ingredients_nutrition inu
      where lower(extensions.unaccent(inu.name_cs)) = res.rn
      limit 1) as flag_nutrice,
    -- `bool_and` NULL ignoruje: když jedna shoda ve spíži příznak nemá a druhá
    -- ano, rozhoduje ta posouzená. Když ho nemá žádná, vyjde NULL = „neznama".
    (select bool_and(case
                       when p_tag = 'vegan' then pi.is_vegan
                       when p_tag = 'gluten_free' then
                         case when pi.obsahuje_lepek is null then null
                              else not pi.obsahuje_lepek end
                       else pi.is_vegetarian
                     end)
       from public.pantry_ingredients pi
      where pi.name_normalized = res.rn
         or (position(' ' in pi.name_normalized) > 0
             and res.rn ~ ('(^|[[:space:]])'
                 || regexp_replace(pi.name_normalized, '([.^$|?*+(){}\[\]\\-])', '\\\1', 'g')
                 || '([[:space:]]|$)'))) as flag_pantry
  from res
)
select distinct
  rn,
  case
    when coalesce(flag_nutrice, flag_pantry) is true then 'ok'
    when coalesce(flag_nutrice, flag_pantry) is null then 'neznama'
    else 'konflikt'
  end
from posouzeno;
$function$;

comment on function public.recipe_posouzeni_surovin(jsonb, text) is
  'Verdikt slovniku nad kazdou surovinou receptu: ok / konflikt / neznama. '
  'Jedine misto, kde zije rozpad nazvu, alias a shoda proti spizi.';

-- `recipe_diet_conflicts` beze změny významu, jen postavená nad tou funkcí.
--
-- Brána potřebuje vědět „tag nevznikne", což je `konflikt` i `neznama`
-- dohromady — tedy přesně původní `coalesce(...) is distinct from true`.
-- Volající se nemění: 20260803130000, 20260824100000 i 20260824120000 ji dál
-- volají stejně.
create or replace function public.recipe_diet_conflicts(p_ingredients jsonb, p_tag text)
returns text[]
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    array_agg(distinct p.surovina) filter (where p.verdikt <> 'ok'),
    '{}'::text[]
  )
  from public.recipe_posouzeni_surovin(p_ingredients, p_tag) p;
$function$;

comment on function public.recipe_diet_conflicts(jsonb, text) is
  'Suroviny, kvuli kterym tag nevznikne (konflikt i neznama). '
  'Tenka nadstavba nad recipe_posouzeni_surovin.';

-- ------------------------------------------------------- pracovní seznam

-- Které neznámé suroviny komu berou tag.
--
-- Zrno je (tag, surovina, recept), aby šlo spočítat obojí, na čem záleží:
-- kolik receptů shodila jedna surovina, i kolik receptů je celkem postižených
-- (recept se dvěma neznámými surovinami se nesmí počítat dvakrát).
--
-- Rolovaný seznam pro člověka:
--   select tag, surovina, count(*) as receptu
--   from public.dietni_tag_neznama_surovina
--   group by tag, surovina order by receptu desc, surovina;
create or replace view public.dietni_tag_neznama_surovina as
with tagy as (
  -- Zatím jen odvozený tag. U `vegan` a `vegetarian` se tag OVĚŘUJE, takže
  -- neznámá surovina rovnou deaktivuje celý recept (podmínka f) v bráně) —
  -- to je jiná porucha, hlučná, a hlásí se jinudy. Další ODVOZENÝ tag se
  -- přidá sem jedním prvkem.
  select unnest(array['gluten_free']) as tag
),
posouzeni as (
  select r.id as recipe_id, r.meal_type, t.tag, p.surovina, p.verdikt
  from public.recipes_catalog r
  cross join tagy t
  cross join lateral public.recipe_posouzeni_surovin(r.ingredients, t.tag) p
  where r.active
),
kandidati as (
  -- Jen recepty, kterým tag shazuje VÝHRADNĚ neznámá surovina. Recept, který
  -- má i skutečný zdroj lepku, se doplněním slovníku stejně nevrátí — na
  -- pracovním seznamu by byl šum. Změřeno 24. 8. 2026: z 27 receptů, které
  -- o tag přišly, jich je takhle zachranitelných 25.
  select recipe_id, tag
  from posouzeni
  group by recipe_id, tag
  having count(*) filter (where verdikt = 'neznama') > 0
     and count(*) filter (where verdikt = 'konflikt') = 0
)
select p.tag, p.surovina, p.recipe_id, p.meal_type
from posouzeni p
join kandidati k on k.recipe_id = p.recipe_id and k.tag = p.tag
where p.verdikt = 'neznama';

alter view public.dietni_tag_neznama_surovina set (security_invoker = true);

comment on view public.dietni_tag_neznama_surovina is
  'Pracovni seznam pro slovnik: suroviny, ktere shodily odvozeny dietni tag, '
  'protoze je slovnik neumi posoudit. Zrno (tag, surovina, recept). '
  'Cisti se sam - doplnenim suroviny do ingredients_nutrition radek zmizi.';

-- ------------------------------------------------------- watchdog větev

-- Aby z toho byl pracovní seznam, ne jen dotaz, který nikdo nespustí.
--
-- SEVERITY 'info' schválně. Změřeno 24. 8. 2026: po přepočtu vychází
-- bezlepkových 59 snídaní, 116 svačin, 125 obědů a 151 večeří — mnohonásobek
-- prahu 7 na slot. Není to výpadek nabídky, je to dluh ve slovníku. Kdyby
-- nabídka spadla, ozve se `dieta_pod_kritickym_poctem` jako warning.
--
-- STROP 15 NÁZVŮ V DETAILU. Watchdog chodí e-mailem a seznam má dnes dlouhý
-- ocas (změřeno: 77 různých názvů nad 44 recepty, většina po jednom receptu).
-- Useknuté se NEZAMLČÍ — kolik jich zbylo, je na konci detailu vidět.
create or replace view public.system_health_alerts_surovina_blokuje_tag as
with poradi as (
  select
    b.tag,
    b.surovina,
    count(*) as receptu,
    row_number() over (order by count(*) desc, b.surovina) as poradi
  from public.dietni_tag_neznama_surovina b
  group by b.tag, b.surovina
)
select
  'info'::text as severity,
  'surovina_blokuje_dietni_tag'::text as kod,
  'Surovina neni ve slovniku a shazuje dietni tag - doplnit do ingredients_nutrition'::text as popis,
  (
    string_agg(p.surovina || ' (' || p.receptu || 'x)', ', ' order by p.poradi)
      filter (where p.poradi <= 15)
    || case when count(*) > 15
            then ', + dalsich ' || (count(*) - 15)::text
            else '' end
  ) as detail,
  -- Kolik receptů kvůli tomu opravdu vypadlo. Ne součet přes suroviny —
  -- recept se dvěma neznámými surovinami je pořád jeden recept.
  (select count(distinct recipe_id)::bigint from public.dietni_tag_neznama_surovina) as pocet
from poradi p
having count(*) > 0;

alter view public.system_health_alerts_surovina_blokuje_tag set (security_invoker = true);

-- ------------------------------------------------------------ sjednocení

-- Tenký pohled, nic než union. Nová větev = nový řádek tady.
create or replace view public.system_health_alerts as
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_zaklad
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_dieta_pod_kritickym_poctem
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_surovina_blokuje_tag;

alter view public.system_health_alerts set (security_invoker = true);
