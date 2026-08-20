-- Vlastní jídlo v jídelníčku a vlastní položka v nákupním seznamu.
--
-- PROČ DVĚ TABULKY A NE SLOUPEC V PLÁNU. Plán (`ai_generated_plans`) je výstup
-- generátoru — přepisuje se při každém týdenním běhu. Kdyby v něm seděly ruční
-- záznamy uživatele, zmizely by s další generací. Tohle jsou uživatelská data,
-- žijí vedle plánu a odkazují se na něj.
--
-- VLASTNÍ JÍDLO NEMÁ OVĚŘENOU NUTRICI. Sloupce `kcal_rucne` a makra jsou proto
-- NULLABLE a NULL je výchozí stav. Aplikace takové jídlo do denních součtů
-- NEZAPOČÍTÁ — započítá ho teprve, když uživatel kalorie sám vyplní. Dopočítávat
-- je odhadem by znamenalo míchat měřená čísla s hádanými v jednom součtu, což je
-- přesně chyba, kterou řešíme u nutrice receptů (viz CLAUDE.md, sekce o metrice
-- `complete`).
--
-- NULL ≠ 0. `kcal_rucne = 0` je platný údaj („nulové kalorie“, např. čaj bez
-- cukru) a do součtu se započítá. NULL znamená „uživatel nevyplnil“ a nezapočítá
-- se. Proto ne DEFAULT 0 a proto CHECK povoluje nulu.

create table if not exists public.user_custom_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.ai_generated_plans (id) on delete set null,
  local_date date not null,
  meal_type text,
  title text not null,
  kcal_rucne numeric check (kcal_rucne is null or kcal_rucne >= 0),
  protein_g numeric check (protein_g is null or protein_g >= 0),
  carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  fat_g numeric check (fat_g is null or fat_g >= 0),
  created_at timestamptz not null default now()
);

comment on table public.user_custom_meals is
  'Jídla, která si uživatel přidal ručně. Nemají ověřenou nutrici — do denních součtů vstupují jen s vyplněným kcal_rucne.';
comment on column public.user_custom_meals.kcal_rucne is
  'Kalorie zadané uživatelem. NULL = nevyplněno, jídlo se do denního součtu nezapočítá. 0 je platná hodnota a započítá se.';

create index if not exists user_custom_meals_user_date_idx
  on public.user_custom_meals (user_id, local_date desc);

alter table public.user_custom_meals enable row level security;

drop policy if exists "user_custom_meals_own" on public.user_custom_meals;
create policy "user_custom_meals_own" on public.user_custom_meals
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- Vlastní položka nákupního seznamu. Prostý text — uživatel si dopisuje věci,
-- které v plánu nejsou (drogerie, koření, co doma zrovna došlo). Nic se z toho
-- neparsuje ani nenormalizuje: kdybychom se pokusili text mapovat na suroviny
-- katalogu, tiše bychom mu měnili, co si napsal.

create table if not exists public.user_shopping_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.ai_generated_plans (id) on delete cascade,
  polozka text not null check (length(btrim(polozka)) between 1 and 200),
  created_at timestamptz not null default now()
);

comment on table public.user_shopping_extras is
  'Ručně dopsané položky nákupního seznamu. Prostý text, váže se k plánu, negeneruje se z receptů.';

create index if not exists user_shopping_extras_user_plan_idx
  on public.user_shopping_extras (user_id, plan_id);

alter table public.user_shopping_extras enable row level security;

drop policy if exists "user_shopping_extras_own" on public.user_shopping_extras;
create policy "user_shopping_extras_own" on public.user_shopping_extras
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
