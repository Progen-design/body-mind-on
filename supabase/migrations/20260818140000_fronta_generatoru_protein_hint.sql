-- Hint hlavní bílkoviny pro položku fronty generátoru receptů.
--
-- PROČ. Zadání pro model neslo `meal_type`, `diet_tags`, kalorické pásmo,
-- slovník surovin a `uz_mame` (názvy už existujících receptů). O bílkovině
-- neříkalo nic, a `uz_mame` hlídá jen duplicitu názvů, ne skladbu katalogu.
-- Model tedy volil volně a vracel to, k čemu má výchozí sklon: kuře.
--
-- Změřeno v produkci (recipes_catalog, active, kcal 400–650):
--
--   surovina        obed  vecere
--   kuře + krůta      22      29
--   ryby              12      11
--   luštěniny         12      15
--   hovězí             4       0
--   vepřové            2       1
--
-- Ryby a luštěniny jsou v pořádku — nešlo o plošnou drůbeží monokulturu,
-- ale o dvě konkrétně chybějící suroviny.
--
-- Prostý insert dalších položek do fronty by to nespravil: bez hintu by model
-- vygeneroval další kuře. Sloupec je proto povinná součást opravy, ne kosmetika.
--
-- NULL = bez explicitního zadání. Běh si v tom případě hint odvodí sám
-- z rozložení bílkovin v posledních receptech daného slotu
-- (lib/plan/rotaceBilkovin.js). Chování dosavadních položek se tím nemění.

alter table public.recipe_generation_queue
  add column if not exists protein_hint text;

comment on column public.recipe_generation_queue.protein_hint is
  'Klíč skupiny bílkovin z lib/plan/rotaceBilkovin.js (hovezi, veprove, drubez, ryby, lusteniny, vejce, mlecne). NULL = odvodit z rozložení katalogu.';

-- Hodnoty se drží u kódu; check brání překlepu, který by tiše vypnul rotaci
-- (neznámý klíč = prázdný adresář surovin = hint bez účinku).
alter table public.recipe_generation_queue
  drop constraint if exists recipe_generation_queue_protein_hint_check;

alter table public.recipe_generation_queue
  add constraint recipe_generation_queue_protein_hint_check
  check (protein_hint is null or protein_hint in
    ('hovezi', 'veprove', 'drubez', 'ryby', 'lusteniny', 'vejce', 'mlecne'));
