-- Watchdog: vetev `cvik_bez_ceskeho_nazvu` prestane hlasit ceske nazvy.
--
-- PROC. Vetev mela mezi podminkami test na cistou ASCII:
--
--     OR e.display_name_cs ~ '^[A-Za-z0-9 ()/,''-]+$'
--
-- Ten oznaci za "anglicky" kazdy nazev bez diakritiky. Jenze cestina hacky
-- nepotrebuje vzdycky: "Prkno", "Kliky", "Dipy", "Poskoky", "Tlaky nohama",
-- "Shyby podhmatem", "Extenze s gumou" jsou cesky a projdou jako ASCII.
--
-- Zmereno 21. 8. 2026: vetev hlasila 26 cviku z 220. Z toho 15 melo cesky
-- nazev bez diakritiky a chytil je VYHRADNE tenhle test. Skutecne prazdny
-- nazev nemel ani jeden.
--
-- Je to tataz chyba jako u prejatych surovin (mozzarella, ricotta), kterou
-- resi `je_prejata_surovina()`. Hlidka, ktera trvale hlasi zdrave zaznamy,
-- se prestane cist — a pak prehlidne i to skutecne.
--
-- ── CO VETEV HLASI PO OPRAVE ────────────────────────────────────────────────
-- Jen dva stavy, oba jednoznacne:
--   1. `display_name_cs` je prazdny
--   2. `display_name_cs` se DOSLOVA rovna anglickemu zdroji (wger_name_en
--      nebo exercisedb_name) — tedy preklad nikdy neprobehl
-- a ani jeden z nich neni v seznamu prejatych termínu.
--
-- Ocekavany vysledek hned po nasazeni: 0. Vetev neni zbytecna — chytne novy
-- import, ktery prijde neprelozeny, a prazdny nazev.

-- ── Prejate nazvy cviku ─────────────────────────────────────────────────────
-- Termíny, ktere se v ceske posilovne rikaji anglicky a cesky ekvivalent se
-- nepouziva. Shoda `display_name_cs = wger_name_en` je u nich spravny stav,
-- ne chybejici preklad.
--
-- SEZNAM JE POSTAVENY NA DATECH, ne na dohadech: vsech jedenact je presne to,
-- co v registru k 21. 8. 2026 skutecne leží se shodnym ceskym a anglickym
-- nazvem. Pridano je jen nekolik dalsich, ktere chodi ze stejnych zdroju.
--
-- CO SE SEM VEDOME NEDAVA: plank, push-up, sit-up, deadlift, squat, lunge.
-- Pro ty cesky nazev mame a pouzivame ho ("Prkno", "Kliky", "Mrtvy tah",
-- "Drep", "Vypady"). Kdyby dorazil import s anglickym tvarem, vetev ho ma
-- nahlasit — presne o to jde.
CREATE OR REPLACE FUNCTION public.je_prejaty_nazev_cviku(nazev text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT lower(btrim(nazev)) = ANY (ARRAY[
    -- Namereno v registru: display_name_cs se rovna anglickemu zdroji
    'bench press', 'box jump', 'burpee', 'chest press', 'dead bug',
    'face pull', 'hip thrust', 'mountain climber', 'russian twist',
    'step up', 'superman',
    -- Ze stejnych zdroju, stejne pouzivani v ceskych posilovnach
    'farmer carry', 'farmer walk', 'good morning', 'kettlebell swing',
    'thruster', 'pull over', 'shrug', 'kickback', 'crunch', 'leg raise'
  ]);
$fn$;

COMMENT ON FUNCTION public.je_prejaty_nazev_cviku(text) IS
  'True pro nazvy cviku, ktere se cesky rikaji anglicky (burpee, hip thrust...). Pouziva vetev cvik_bez_ceskeho_nazvu, aby je nehlasila jako neprelozene.';

DO $$
DECLARE
  puvodni text;
  nova    text;
  stara_podminka text;
  nova_podminka  text;
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE EXCEPTION 'system_health_alerts neexistuje — migrace by tise neudelala nic';
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  -- Idempotence: druhy beh uz nema co menit.
  IF puvodni LIKE '%je_prejaty_nazev_cviku%' THEN
    RAISE NOTICE 'oprava uz je zavedena, preskakuji';
    RETURN;
  END IF;

  stara_podminka :=
    'WHERE NULLIF(btrim(e.display_name_cs), ''''::text) IS NULL'
    || ' OR NULLIF(btrim(e.wger_name_en), ''''::text) IS NOT NULL'
    || ' AND lower(btrim(e.display_name_cs)) = lower(btrim(e.wger_name_en))'
    || ' OR e.display_name_cs ~ ''^[A-Za-z0-9 ()/,''''-]+$''::text';

  -- Kdyby definice view nesedela, migrace spadne tady a neupravi nic jineho.
  IF position(stara_podminka in puvodni) = 0 THEN
    RAISE EXCEPTION 'podminka vetve cvik_bez_ceskeho_nazvu nenalezena — definice view se zmenila';
  END IF;

  nova_podminka :=
    'WHERE NULLIF(btrim(e.display_name_cs), ''''::text) IS NULL'
    || ' OR (NOT public.je_prejaty_nazev_cviku(e.display_name_cs)'
    || ' AND ((NULLIF(btrim(e.wger_name_en), ''''::text) IS NOT NULL'
    || ' AND lower(btrim(e.display_name_cs)) = lower(btrim(e.wger_name_en)))'
    || ' OR (NULLIF(btrim(e.exercisedb_name), ''''::text) IS NOT NULL'
    || ' AND lower(btrim(e.display_name_cs)) = lower(btrim(e.exercisedb_name)))))';

  nova := replace(puvodni, stara_podminka, nova_podminka);
  IF nova = puvodni THEN
    RAISE EXCEPTION 'nahrazeni podminky se nepovedlo';
  END IF;

  -- security_invoker se obnovuje explicitne — CREATE OR REPLACE VIEW ho jinak
  -- prepise na vychozi a view by obchazel RLS zdrojovych tabulek.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Od 21. 8. 2026 hlida i konzistenci obsahu; cvik_bez_ceskeho_nazvu uz netestuje ASCII (hlasilo to ceske nazvy bez diakritiky), ale doslovnou shodu s anglickym zdrojem mimo prejate termíny. Zavaznost: critical = vidi to platici uzivatel v aktivnim planu, warning = je to v katalogu, info = prehled.';
