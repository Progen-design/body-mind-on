-- Watchdog: `recept_neprelozeny_nazev` prestane hlasit rozdil ve velikosti pismen.
--
-- PROC. Vetev porovnavala `lower(name_cs) = lower(name_en)`. Cestina ale pise
-- v nazvech mala pismena tam, kde anglictina velka, takze spravne prelozeny
-- nazev se od originalu casto lisi POUZE velikosti:
--
--     name_cs "Tex-Mex burger"          vs  name_en "Tex-Mex Burger"
--     name_cs "Linguine alla Carbonara" vs  name_en "Linguine Alla Carbonara"
--
-- Obojí je spravna ceska podoba — "burger" je prejate slovo, "Linguine alla
-- Carbonara" je italsky nazev jidla, ktery se neprekladá. Vetev je presto
-- hlasila jako neprelozene, a to na urovni CRITICAL.
--
-- Zmereno 21. 8. 2026: vetev hlasila 3 recepty, z toho 2 byly takhle falesne.
-- Jediny skutecne neprelozeny byl "Skinny Green Monster Smoothie" (id 489),
-- prelozeny rucne na "Zelene smoothie se spenatem a bananem".
--
-- OPRAVA: porovnavat presne, vcetne velikosti. Neprelozeny nazev je z definice
-- BYTE STEJNY jako original — kdyz uz nekdo zmenil aspon velikost pismen,
-- na nazev sahal. Volnejsi porovnani tu jen vyrabelo sum.
--
-- Je to treti vyskyt teze chyby v tomhle view (po `je_prejata_surovina`
-- u jidel a `je_prejaty_nazev_cviku` u cviku): heuristika "vypada jako
-- anglictina" hlasi zdrave zaznamy. Kdyz hlidka trvale krici, prestane se cist.

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

  stara_podminka :=
    'AND (NULLIF(btrim(r.name_cs), ''''::text) IS NULL'
    || ' OR lower(btrim(r.name_cs)) = lower(btrim(r.name_en)))';

  nova_podminka :=
    'AND (NULLIF(btrim(r.name_cs), ''''::text) IS NULL'
    || ' OR btrim(r.name_cs) = btrim(r.name_en))';

  -- Idempotence: druhy beh uz nema co menit.
  IF position(stara_podminka in puvodni) = 0 THEN
    IF position(nova_podminka in puvodni) > 0 THEN
      RAISE NOTICE 'oprava uz je zavedena, preskakuji';
      RETURN;
    END IF;
    RAISE EXCEPTION 'podminka vetve recept_neprelozeny_nazev nenalezena — definice view se zmenila';
  END IF;

  nova := replace(puvodni, stara_podminka, nova_podminka);
  IF nova = puvodni THEN
    RAISE EXCEPTION 'nahrazeni podminky se nepovedlo';
  END IF;

  -- security_invoker se obnovuje explicitne — CREATE OR REPLACE VIEW ho jinak
  -- prepise na vychozi a view by obchazel RLS zdrojovych tabulek.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;
