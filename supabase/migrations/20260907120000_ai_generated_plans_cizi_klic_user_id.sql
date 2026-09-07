-- docs/DALSI_KROK.md 9.1/E: smazání účtu nemazalo plány, protože
-- `ai_generated_plans.user_id` neměl cizí klíč na `auth.users`. `profiles`,
-- `ai_tasks`, `memberships` i `workouts` ho mají (ON DELETE CASCADE) —
-- `ai_generated_plans` na ten seznam nepatřila omylem.
--
-- Ověřeno před touto migrací: po smazání 16 testovacích účtů zůstalo
-- v tabulce 32 osiřelých plánů i s kalorickými cíli a údaji o těch lidech.
-- Není to jen nepořádek, je to GDPR problém — "Smažte můj účet" nesmí nechat
-- plán, který o člověku ví váhu, cíl i jídelníček.
--
-- `api/delete-account.js` plány NEMAŽE ručně — deleguje na
-- `public.delete_user_data()` (viz 20260807090000_odebrani_execute_anon_secdef.sql),
-- která dynamicky projde VŠECHNY veřejné tabulky se sloupcem `user_id`
-- a smaže řádky patřící uživateli, `ai_generated_plans` nevyjímaje. Osiřelé
-- řádky tedy nevznikly touhle cestou, ale nějakým JINÝM smazáním
-- `auth.users` (dashboard, admin skript), které `delete_user_data()` vůbec
-- nevolá — přesně proti tomu je cizí klíč na úrovni DB spolehlivá ochrana,
-- ne aplikační kód. V `api/delete-account.js` proto není žádný mrtvý kód
-- k odstranění.

-- 1) Osiřelé řádky napřed pryč, jinak přidání cizího klíče selže.
DELETE FROM public.ai_generated_plans
WHERE user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = ai_generated_plans.user_id
  );

-- 2) Cizí klíč + cascade, stejně jako u profiles/ai_tasks/memberships/workouts.
ALTER TABLE public.ai_generated_plans
  ADD CONSTRAINT ai_generated_plans_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
