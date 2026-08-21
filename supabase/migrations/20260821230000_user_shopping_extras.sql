-- Vlastní položky nákupního seznamu.
--
-- Proč samostatná tabulka a ne sloupec v plánu: plán se při týdenní generaci
-- přepisuje celý, takže ručně přidané položky by zmizely. Odvozená část
-- seznamu se dopočítává z jídelníčku, tahle tabulka drží jen to, co si
-- uživatel dopsal sám.
create table if not exists public.user_shopping_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  amount text check (length(amount) <= 60),
  category text not null default 'Ořechy, Tuky & Ostatní'
    check (category in ('Maso & Ryby','Mléčné výrobky & Vejce','Přílohy & Pečivo',
                        'Zelenina & Ovoce','Ořechy, Tuky & Ostatní')),
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_shopping_extras_user_idx
  on public.user_shopping_extras (user_id, created_at desc);

alter table public.user_shopping_extras enable row level security;

-- Každý vidí a mění jen svoje řádky.
drop policy if exists user_shopping_extras_select on public.user_shopping_extras;
create policy user_shopping_extras_select on public.user_shopping_extras
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists user_shopping_extras_insert on public.user_shopping_extras;
create policy user_shopping_extras_insert on public.user_shopping_extras
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists user_shopping_extras_update on public.user_shopping_extras;
create policy user_shopping_extras_update on public.user_shopping_extras
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_shopping_extras_delete on public.user_shopping_extras;
create policy user_shopping_extras_delete on public.user_shopping_extras
  for delete to authenticated using ((select auth.uid()) = user_id);
