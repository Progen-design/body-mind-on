-- „Zahrnout od dalšího týdne“ musí být svázané s receptem, ne s textem názvu.
--
-- PROČ. `user_meal_pins` ukládá (user_id, meal_type, meal_text). Ten záznam je
-- trvalý, ale k ničemu, jakmile se s ním má porovnávat výběr z katalogu:
-- katalog pracuje s `catalog_id`, kdežto `meal_text` je zobrazovaný název
-- včetně porce („Kuře s bramborem — porce 180/300“). Párovat přes text by
-- znamenalo hádat.
--
-- Sloupec potřebuje vyloučení jídel z minulých týdnů (lib/plan/historieJidel.js):
-- co si uživatel vědomě připnul, se vyloučit NESMÍ, jinak aplikace tiše přepíše
-- jeho rozhodnutí a tlačítko ztratí smysl.
--
-- Staré piny zůstávají s NULL. Nedohledávají se zpětně podle názvu — falešná
-- shoda by tiše připnula cizí recept a byla by hůř odhalitelná než chybějící
-- vazba. Nové piny už `catalog_id` nesou.

alter table public.user_meal_pins
  add column if not exists catalog_id bigint;

comment on column public.user_meal_pins.catalog_id is
  'recipes_catalog.id připnutého receptu. NULL u pinů založených před 18. 8. 2026 — ty se ve vylučování z historie neuplatní.';

create index if not exists user_meal_pins_user_catalog_idx
  on public.user_meal_pins (user_id, catalog_id)
  where catalog_id is not null;
