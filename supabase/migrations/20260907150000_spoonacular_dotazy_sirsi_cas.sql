-- Spoonacular: rozšířit dotazy, ať je z čeho brát — docs/DALSI_KROK.md 9.5.
--
-- Rozhodnutí Honzy 7. 9. 2026: „není důležitý čas, ale jednoduchost."
-- První ostrý běh po 9.3 ukázal, že rotace 66 dotazů je vyčerpaná U ZDROJE,
-- ne v našem stránkování: nejštědřejší dotaz má total_results 44, osm z 22
-- doběhlých vrací dlouhodobě nulu, 121 běhů dalo za celou historii 47
-- receptů. Jediná změna, která zdrojovou množinu zvětší řádově, je uvolnit
-- maxReadyTime (obědy/večeře 20→35, snídaně 20→25, svačiny 15→20).
--
-- POZOR, ČÍSLA JSOU NA DVOU MÍSTECH: tabulka pravidel
-- MEAL_SIMPLICITY_RULES (lib/spoonacular/catalogImportGate.js) platí pro
-- lokální filtr po stažení, ale API dotaz bere maxReadyTime ze sloupce
-- `params` — a buildImportFiltersForMealType dosazuje pravidlo jen tehdy,
-- když filtr v params CHYBÍ. Řádky v DB tedy tabulku přebíjejí; kdo změní
-- jen JS, nezmění nic. Tahle migrace je druhá polovina téže změny (první
-- je commit v catalogImportGate.js).
--
-- RESET next_offset JE NUTNÝ, NE VOLITELNÝ. Širší dotaz vrací JINOU a VĚTŠÍ
-- množinu výsledků v jiném pořadí — staré next_offset (u obědů 44) by
-- ukazovalo doprostřed stránkování něčeho, co už neexistuje, a přeskočilo
-- by recepty, kvůli kterým se rozšíření dělá. Jednorázově to znamená víc
-- duplicit při prvním běhu (známé recepty z první stránky) — to je
-- ZAPLACENÁ CENA, ne chyba. Za měsíc to nikdo „neopravuj" zpátky tím, že
-- reset odstraní nebo offsety vrátí.
--
-- Spolu s offsetem se nuluje i exhausted_at, retired_reason a empty_streak
-- (rozšířený dotaz není vyčerpaný — je nový) a total_results (popisoval
-- výsledek STARÉHO dotazu; první běh ho přepíše čerstvou hodnotou z API —
-- to je nad rámec zadání, ale nechat tam číslo starého dotazu by mátlo).
--
-- Řádky BEZ maxReadyTime v params se nechávají být: API se u nich na čas
-- neptá vůbec, jsou tedy už teď širší než cíl — přidat jim limit by je
-- ZÚŽILO.
--
-- ZE STEJNÉHO DŮVODU SE ČAS JEN ZVYŠUJE, NIKDY NESNIŽUJE (GREATEST níž).
-- Změřeno na produkci 7. 9. 2026: řádek id=2745
-- `main course|carb=40|kcal=400-800|rt=40|slot=obed` má maxReadyTime 40,
-- tedy VÍC než cílových 35. Dosadit mu cíl by ten dotaz zúžilo a navrch
-- shodilo jeho next_offset (36) na nulu — přesně to, čemu se tahle migrace
-- jinde brání. Řádky, které už jsou širší nebo přesně na cíli, se proto
-- nemění vůbec a stránkování si nechávají; do rotace je vrátí běžné
-- třicetidenní znovuotevření (reopenExhaustedImportQueries).
--
-- ROZŠÍŘENÍM MŮŽOU DVA DOTAZY SPLYNOUT V JEDEN. `query_signature` má UNIQUE
-- index (spoonacular_import_queries_signature_key) a `rt=` je jeho součástí,
-- takže jakmile se dva dotazy lišily JEN časem, po zvýšení mají tentýž
-- podpis. Změřeno na produkci 7. 9. 2026 — nastává to jednou:
--   id 2732  main course|di=vegetarian|kcal=350-850|rt=30|slot=vecere
--   id 2754  main course|di=vegetarian|kcal=350-850|rt=35|slot=vecere
-- (2754 je už na cíli, takže se nemění; 2732 by se na něj přepsalo.)
--
-- Přejmenovat se to nedá a spadnout taky ne. Druhý z dvojice se proto
-- TRVALE VYŘADÍ s `retired_reason = 'merged_after_widening'`. To je záměrně
-- důvod MIMO DOCASNE_DUVODY_VYRAZENI (importQueryRotation.js), takže ho
-- třicetidenní znovuotevření nikdy nevzkřísí — přesně k tomu ta hranice
-- mezi automatickými a ručními důvody je. Dotaz nemizí, jen přestal být
-- samostatný: tutéž množinu výsledků teď pokrývá jeho širší dvojče.
--
-- Migrace je idempotentní (guard IS DISTINCT FROM: druhé spuštění nezmění
-- nic, a hlavně znovu nevynuluje offsety rozběhnutého stránkování).

-- ---------------------------------------------------------------------------
-- 0. CHECK na retired_reason musí trvalý důvod vůbec připustit.
--
-- Zjištěno při aplikaci téhle migrace 7. 9. 2026: constraint zněl
--   CHECK (retired_reason IS NULL OR retired_reason IN ('pool_exhausted','pool_empty'))
-- což jsou PŘESNĚ hodnoty z DOCASNE_DUVODY_VYRAZENI. Komentář v
-- lib/spoonacular/importQueryRotation.js přitom slibuje, že „JAKÝKOLI JINÝ
-- důvod znamená trvalé ruční vyřazení a takový dotaz se znovu NEOTVÍRÁ" —
-- jenže žádný jiný důvod do sloupce nešlo zapsat. Ta větev v
-- reopenExhaustedImportQueries hlídala stav, který DB nedovolila vzniknout,
-- takže se po 30 dnech vracelo do rotace úplně všechno.
--
-- Rozšíření o 'merged_after_widening' dělá z toho slibu pravdu a je první
-- skutečný trvalý důvod. Kdo bude přidávat další, přidá ho SEM i do
-- DOCASNE_DUVODY_VYRAZENI se rozhodne, jestli tam patří (nepatří, pokud má
-- být trvalý).
-- ---------------------------------------------------------------------------
ALTER TABLE public.spoonacular_import_queries
  DROP CONSTRAINT IF EXISTS spoonacular_import_queries_retired_reason_chk;

ALTER TABLE public.spoonacular_import_queries
  ADD CONSTRAINT spoonacular_import_queries_retired_reason_chk
  CHECK (
    retired_reason IS NULL
    OR retired_reason = ANY (ARRAY['pool_exhausted', 'pool_empty', 'merged_after_widening'])
  );

DO $$
DECLARE
  r            record;
  slot_podpis  text;
  slot_sloupec text;
  slot         text;
  cilovy       integer;
  novy_podpis  text;
  zmeneno      integer := 0;
  slouceno     integer := 0;
BEGIN
  FOR r IN
    -- Pořadí podle id, ať je při kolizi vždycky stejné, který z dvojice
    -- zůstane samostatný a který se sloučí.
    SELECT id, params, query_signature, catalog_meal_type
    FROM public.spoonacular_import_queries
    WHERE params ? 'maxReadyTime'
    ORDER BY id
  LOOP
    -- Slot je v podpisu za `slot=` i ve sloupci catalog_meal_type — čtou se
    -- oba a nesoulad je chyba dat, ne něco k tichému rozhodnutí.
    slot_podpis  := substring(r.query_signature from 'slot=([a-z]+)');
    slot_sloupec := nullif(lower(btrim(coalesce(r.catalog_meal_type, ''))), '');

    IF slot_podpis IS NOT NULL AND slot_sloupec IS NOT NULL AND slot_podpis <> slot_sloupec THEN
      RAISE EXCEPTION 'dotaz id=%: slot v podpisu (%) nesouhlasi s catalog_meal_type (%) — oprav data, migrace nema jak vybrat', r.id, slot_podpis, slot_sloupec;
    END IF;

    slot := coalesce(slot_podpis, slot_sloupec);
    IF slot IS NULL THEN
      RAISE EXCEPTION 'dotaz id=% ma maxReadyTime v params, ale slot neni v podpisu ani v catalog_meal_type', r.id;
    END IF;

    cilovy := CASE slot
      WHEN 'snidane' THEN 25
      WHEN 'svacina' THEN 20
      WHEN 'obed'    THEN 35
      WHEN 'vecere'  THEN 35
      ELSE NULL
    END;
    IF cilovy IS NULL THEN
      RAISE EXCEPTION 'dotaz id=%: neznamy slot "%" — cilova hodnota maxReadyTime neni definovana', r.id, slot;
    END IF;

    -- Jen nahoru. Dotaz, který už je širší než cíl, se nezužuje (viz hlavička).
    cilovy := GREATEST(cilovy, (r.params ->> 'maxReadyTime')::integer);

    IF (r.params ->> 'maxReadyTime')::integer IS DISTINCT FROM cilovy THEN
      novy_podpis := regexp_replace(r.query_signature, 'rt=[0-9]+', 'rt=' || cilovy::text);

      -- Splynul rozšířením s jiným dotazem? Pak není co rozšiřovat — tutéž
      -- množinu už pokrývá to dvojče. Trvale ven, ne přejmenovat.
      IF EXISTS (
        SELECT 1 FROM public.spoonacular_import_queries x
        WHERE x.query_signature = novy_podpis AND x.id <> r.id
      ) THEN
        UPDATE public.spoonacular_import_queries
        SET retired_reason = 'merged_after_widening',
            exhausted_at   = coalesce(exhausted_at, now())
        WHERE id = r.id;
        slouceno := slouceno + 1;
        RAISE NOTICE 'dotaz id=% (%) splynul rozsirenim s existujicim "%" — trvale vyrazen', r.id, r.query_signature, novy_podpis;
        CONTINUE;
      END IF;

      UPDATE public.spoonacular_import_queries
      SET params          = jsonb_set(params, '{maxReadyTime}', to_jsonb(cilovy)),
          query_signature = novy_podpis,
          next_offset     = 0,
          exhausted_at    = NULL,
          retired_reason  = NULL,
          empty_streak    = 0,
          total_results   = NULL
      WHERE id = r.id;
      zmeneno := zmeneno + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'spoonacular_import_queries: % dotazu rozsireno a vraceno na zacatek strankovani, % slouceno s dvojcetem', zmeneno, slouceno;
END $$;

-- ===========================================================================
-- Kontroly: podpis a params spolu musí souhlasit u VŠECH řádků (v době
-- zadání 66) — rt= v podpisu přesně tam a s tou hodnotou, kde je
-- maxReadyTime v params, a hodnota odpovídá cíli slotu.
-- ===========================================================================
DO $$
DECLARE
  v_celkem integer;
  v_spatne integer;
BEGIN
  SELECT count(*) INTO v_celkem FROM public.spoonacular_import_queries;

  -- a) rt= v podpisu <-> maxReadyTime v params, se shodnou hodnotou.
  SELECT count(*) INTO v_spatne
  FROM public.spoonacular_import_queries q
  WHERE CASE
    WHEN q.params ? 'maxReadyTime'
      THEN q.query_signature !~ ('(^|\|)rt=' || (q.params ->> 'maxReadyTime') || '(\||$)')
    ELSE q.query_signature ~ '(^|\|)rt=[0-9]+'
  END;
  IF v_spatne > 0 THEN
    RAISE EXCEPTION '% radku ma rt= v podpisu v nesouladu s params->>maxReadyTime', v_spatne;
  END IF;

  -- b) kde maxReadyTime je, musí být ASPOŇ na cílové hodnotě podle slotu.
  -- Ne přesně: řádek, který byl širší (id=2745, rt=40), zůstává širší.
  -- Sloučené dvojče do rotace nepatří a svůj starý užší čas si nechává —
  -- proto je z kontroly ven.
  SELECT count(*) INTO v_spatne
  FROM public.spoonacular_import_queries q
  WHERE q.params ? 'maxReadyTime'
    AND q.retired_reason IS DISTINCT FROM 'merged_after_widening'
    AND (q.params ->> 'maxReadyTime')::integer <
      CASE coalesce(
             substring(q.query_signature from 'slot=([a-z]+)'),
             nullif(lower(btrim(coalesce(q.catalog_meal_type, ''))), ''))
        WHEN 'snidane' THEN 25
        WHEN 'svacina' THEN 20
        WHEN 'obed'    THEN 35
        WHEN 'vecere'  THEN 35
      END;
  IF v_spatne > 0 THEN
    RAISE EXCEPTION '% radku nema cilovy maxReadyTime podle slotu', v_spatne;
  END IF;

  RAISE NOTICE 'spoonacular_import_queries: % radku, podpisy i params souhlasi', v_celkem;
END $$;
