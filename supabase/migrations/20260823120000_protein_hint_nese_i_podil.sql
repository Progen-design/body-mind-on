-- `protein_hint` nese vedle zdroje bílkovin i minimální podíl na kaloriích.
--
-- PROČ. Migrace 20260818140000 počítala jen se zdrojem („udělej to z ryby“)
-- a měla na to CHECK se sedmi klíči skupin. Zbylých 11 % minutí bílkovinového
-- cíle ale nedrží rotace zdrojů — drží ho katalog, ve kterém pro snídaně
-- a svačiny nejsou dost bílkovinné recepty:
--
--   snidane  37 z 163 aktivních má podíl bílkovin >= 25 %
--   svacina  36 z 161
--   obed    138 z 210
--   vecere  116 z 193
--
-- Objednávka proto musí umět říct i „potřebuju aspoň 28 % kalorií
-- z bílkovin“. To je číslo a do CHECKu se sedmi řetězci se nevejde.
--
-- FORMÁT. Buď holý klíč skupiny (zpětná kompatibilita — sedm řádků ve frontě
-- ho má a rotace na nich stojí), nebo JSON s kanonickým pořadím klíčů:
--
--   ryby
--   {"zdroj":"ryby","podil":0.3}
--   {"podil":0.3}
--
-- Podíl je kvantizovaný na násobek 0,05 (KROK_PODILU). Bez toho by unikát
-- fronty nefungoval: porovnává řetězec, takže 0.283 a 0.284 by byly dvě
-- objednávky na tutéž díru. Strop 0,55 se shoduje s MEZE_PODILU.MAX_PODIL.
--
-- Kanonické pořadí je povinné kvůli unikátnímu indexu z 20260818150000,
-- který porovnává `coalesce(protein_hint, '')` jako řetězec. Serializuje
-- jedině lib/plan/proteinHint.js, nikdy JSON.stringify na volajícím místě.
--
-- CHECK se nezahazuje, jen rozšiřuje. Bez něj by překlep v klíči skupiny
-- tiše vypnul rotaci (neznámý klíč = prázdný adresář surovin = hint bez
-- účinku) a rozbitý JSON by prošel do fronty.

alter table public.recipe_generation_queue
  drop constraint if exists recipe_generation_queue_protein_hint_check;

alter table public.recipe_generation_queue
  add constraint recipe_generation_queue_protein_hint_check
  check (
    protein_hint is null
    -- Původní tvar: holý klíč skupiny bílkovin.
    or protein_hint in ('hovezi', 'veprove', 'drubez', 'ryby', 'lusteniny', 'vejce', 'mlecne')
    -- Nový tvar: JSON. Kontroluje se platnost, kanonické pořadí klíčů,
    -- známý zdroj a rozsah podílu (0, 0.55>.
    or (
      protein_hint ~ '^\{("zdroj":"(hovezi|veprove|drubez|ryby|lusteniny|vejce|mlecne)",)?"podil":0\.[0-9]{1,2}\}$'
      and ((protein_hint::jsonb) ->> 'podil')::numeric > 0
      -- 0.55 = MEZE_PODILU.MAX_PODIL z lib/nutrition/cilBilkovinSlotu.js.
      -- Jediná hranice nad touhle veličinou; test `prahShodnySMigraci`
      -- v lib/__tests__/proteinHint.test.mjs hlídá, že se nerozejdou.
      and ((protein_hint::jsonb) ->> 'podil')::numeric <= 0.55
    )
  );

comment on column public.recipe_generation_queue.protein_hint is
  'Zadání bílkovin pro objednávku. Holý klíč skupiny z lib/plan/rotaceBilkovin.js '
  '(hovezi, veprove, drubez, ryby, lusteniny, vejce, mlecne), nebo JSON '
  '{"zdroj":...,"podil":...} s minimálním podílem bílkovin na kaloriích. '
  'Serializuje a parsuje výhradně lib/plan/proteinHint.js — pořadí klíčů je '
  'součást formátu kvůli unikátnímu indexu fronty. NULL = odvodit z katalogu.';
