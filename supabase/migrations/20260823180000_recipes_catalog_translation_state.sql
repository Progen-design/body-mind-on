-- STAV PREKLADU SE EVIDUJE, NEHADA SE Z VYSLEDKU.
--
-- Fronta prekladu se ridila heuristikou: surovina, jejiz `name` se rovna
-- `name_en`, je "neprelozena". Jenze spousta ceskych nazvu je s anglictinou
-- shodna -- merene 23. 8. 2026 na produkci: quinoa 15x, paprika 9x, mango 7x,
-- oregano 6x, k tomu tofu, feta, ricotta, mozzarella. Model je prelozil
-- spravne (nechal je), heuristika je precetla jako nedodelanou praci a recept
-- vratila do fronty. Sest behu cronu po sobe zapsalo 19 receptu a `remaining`
-- zustalo na 68 -- nekonecna placena smycka nad stejnymi dvaceti recepty.
alter table public.recipes_catalog
  add column if not exists translated_at timestamptz,
  add column if not exists translation_attempts integer not null default 0,
  add column if not exists translation_prompt_sha text,
  add column if not exists translation_last_error text;

-- Fronta se cte pri kazdem behu cronu; index drzi dotaz levny i pri desitkach
-- tisic receptu.
create index if not exists recipes_catalog_translation_queue_idx
  on public.recipes_catalog (source, translated_at, translation_attempts)
  where translated_at is null;

-- BACKFILL. Bez nej by fronta obsahovala vsech 345 spoonacularovych receptu
-- vcetne hotovych a zaplatili bychom za jejich preklad znovu.
update public.recipes_catalog r
set translated_at = coalesce(r.updated_at, now())
where r.source = 'spoonacular'
  and r.translated_at is null
  and coalesce(btrim(r.name_cs), '') <> ''
  and jsonb_array_length(coalesce(r.instructions_cs, '[]'::jsonb)) > 0
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) e
    where coalesce(btrim(e->>'name'), '') = ''
  );

-- JEDNO POSLEDNI KOLO PRO RECEPTY S ANGLICKYMI SUROVINAMI.
--
-- Mezi surovinami, kde `name` = `name_en`, jsou jak legitimni ceske nazvy
-- (quinoa, paprika, mango), tak opravdu neprelozene anglicke fraze
-- ("salt and pepper", "orange pepper", "broccolini", "t cream"). Rozlisit je
-- bez modelu nelze a hadat se nema. Stara heuristika se proto pouzije JEDNOU
-- -- k urceni, kdo jeste nebyl videny opravenym prekladacem. Po tomhle kole
-- si kazdy zpracovany recept nese `translated_at` a fronta uz se ridi
-- evidenci, ne odhadem. Cena: jedno kolo pres 68 receptu.
update public.recipes_catalog r
set translated_at = null
where r.source = 'spoonacular'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) e
    where coalesce(btrim(e->>'name_en'), '') <> ''
      and lower(btrim(e->>'name')) = lower(btrim(e->>'name_en'))
  );
