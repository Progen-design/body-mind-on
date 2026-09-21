-- PROMPT_DNES_HERO.md (21. 9. 2026) — pozdrav na hero „Tvůj den" potřebuje
-- oslovení v 5. pádu („Dobrý večer, Honzo"). Automatické skloňování jmen
-- chybuje u příjmení, cizích a zdrobnělých jmen, proto appka jméno
-- neskloňuje — uživatel napíše rovnou tvar, jakým chce být osloven.
--
-- SLOUPEC JDE NA `public.profiles`, NE NA `auth.users`. Dnešní jméno
-- (`profile.name`) se čte z `auth.users.raw_user_meta_data.name`
-- (`api/profile.js`, `user.user_metadata`) — to je systémová tabulka Supabase
-- Auth, kterou appka jinak nerozšiřuje. `public.profiles` je už dnes místo
-- pro uživatelem editovatelné UI preference vázané na `id` (avatar_url,
-- daily_email, viz `api/profile-settings.js`) — nové pole patří sem, ne do
-- auth schématu.
--
-- Prázdné/NULL = pole není vyplněné. UI (`src/lib/pozdrav.ts`) na to reaguje
-- pozdravem BEZ jména („Dobrý večer.", nikdy „Dobrý večer, Jan" — 1. pád by
-- byl česky špatně).
--
-- NEAPLIKUJI tuhle migraci — píšu soubor, pouští ji Honza.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_address text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_address_length
  CHECK (preferred_address IS NULL OR char_length(preferred_address) <= 40);

COMMENT ON COLUMN public.profiles.preferred_address IS
  'Jak appka uživatele oslovuje v pozdravu na Dnes (5. pád, "Honzo", ne 1. pád "Honza") — vyplňuje sám v nastavení/nenápadné výzvě na Dnes. NULL = pozdrav bez jména. PROMPT_DNES_HERO.md, src/lib/pozdrav.ts.';
