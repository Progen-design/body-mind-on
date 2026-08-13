-- KROK 1: jediná kanonická řada vážení.
--
-- PROBLÉM. `body_metrics` drží 43 řádků na 43 uživatelů — registrační snímek
-- a aktuální kalorický cíl v jednom řádku. Váha se tam nedá aktualizovat, aniž
-- by se přepsal registrační stav, takže data ze zařízení nemají kam téct.
--
-- ROZHODNUTÍ: POUŽÍT `body_measurements`, NEZAKLÁDAT NOVOU.
-- Tabulka existuje (migrace 20260713210000), je PRÁZDNÁ (0 řádků) a už má
-- přesně požadovaný tvar: user_id, measured_at, weight_kg, source,
-- source_record_id + rozumné rozsahové CHECKy, FK s ON DELETE CASCADE, index
-- (user_id, measured_at DESC) a čtyři RLS politiky. Navíc ji už čte
-- `pages/api/profile.js` a `lib/progressIntegrity.js`. Nová tabulka by tohle
-- všechno duplikovala a nechala tu prázdnou návnadu, do které by dřív nebo
-- později někdo začal psát. `source_record_id` je požadovaný `source_ref` —
-- nepřejmenovávám ho, protože na něj sahá existující API.
--
-- CO TU CHYBĚLO: (a) `apple_health` nebyl mezi povolenými zdroji,
-- (b) nic nebránilo tomu, aby druhý sync založil tentýž řádek podruhé,
-- (c) data ze zařízení do tabulky nikdo nepřeléval.
--
-- PROČ TRIGGERY A NE KÓD. Apple Health teče přes Edge Function v Denu
-- (`apple-health-ingest`), Withings přes Node (`lib/withingsServer.js`).
-- Sdílený JS helper by musel existovat dvakrát a kterýkoli další zapisovatel
-- by ho mohl obejít. Trigger je jedno místo, platí pro oba zdroje a nejde
-- obejít. Idempotenci drží unikátní index, ne aplikace.
--
-- `body_metrics` ZŮSTÁVÁ REGISTRAČNÍM SNÍMKEM a tahle migrace na něj nesahá.

-- ── (a) Apple Health mezi povolené zdroje ───────────────────────────────────
-- Původní hodnoty zůstávají: 'integration' používá starší import, mazat ho by
-- znamenalo rozbít data, která ještě můžou přijít.
ALTER TABLE public.body_measurements
  DROP CONSTRAINT IF EXISTS body_measurements_source_check;

ALTER TABLE public.body_measurements
  ADD CONSTRAINT body_measurements_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'withings'::text, 'apple_health'::text, 'integration'::text]));

-- ── (b) Idempotence ─────────────────────────────────────────────────────────
-- Dvojí sync téhož měření nesmí založit druhý řádek. Klíčem je trojice
-- (uživatel, zdroj, ID záznamu u zdroje). Ruční zápis `source_record_id` nemá,
-- proto je index částečný — jinak by dva ruční zápisy kolidovaly na NULL.
CREATE UNIQUE INDEX IF NOT EXISTS body_measurements_zdroj_zaznam_uniq
  ON public.body_measurements (user_id, source, source_record_id)
  WHERE source_record_id IS NOT NULL;

COMMENT ON INDEX public.body_measurements_zdroj_zaznam_uniq IS
  'Idempotence syncu ze zarizeni: druhy sync tehoz mereni updatuje, nezaklada novy radek.';

-- ── (c) Přelévání ze zařízení ───────────────────────────────────────────────

/**
 * Withings → body_measurements.
 *
 * `withings_body_snapshots` už drží normalizovanou váhu; klíčem u zdroje je
 * `withings_measure_group_id`. Když chybí (starší řádky), použije se čas
 * měření — pořád to jednoznačně identifikuje jedno vážení.
 */
CREATE OR REPLACE FUNCTION public.zrcadli_withings_vahu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  klic text;
BEGIN
  -- Bez váhy nebo bez času měření není co zrcadlit.
  IF NEW.weight_kg IS NULL OR NEW.measured_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Rozsahový CHECK cílové tabulky (20–400 kg) tu MUSÍ být zopakovaný.
  -- Kdyby trigger poslal nesmysl, výjimka by shodila celý zápis snapshotu —
  -- tedy vlastní sync Withings. Radši měření zahodit než rozbít ingest.
  IF NEW.weight_kg <= 20 OR NEW.weight_kg >= 400 THEN
    RETURN NEW;
  END IF;

  klic := COALESCE(
    NULLIF(NEW.withings_measure_group_id, ''),
    to_char(NEW.measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ')
  );

  INSERT INTO public.body_measurements (user_id, measured_at, weight_kg, source, source_record_id)
  VALUES (NEW.user_id, NEW.measured_at, NEW.weight_kg, 'withings', klic)
  ON CONFLICT (user_id, source, source_record_id) WHERE source_record_id IS NOT NULL
  DO UPDATE SET
    weight_kg = EXCLUDED.weight_kg,
    measured_at = EXCLUDED.measured_at;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.zrcadli_withings_vahu() IS
  'Preleva vahu z withings_body_snapshots do kanonicke rady body_measurements. Idempotentni pres unikatni index.';

DROP TRIGGER IF EXISTS zrcadli_withings_vahu_trg ON public.withings_body_snapshots;
CREATE TRIGGER zrcadli_withings_vahu_trg
  AFTER INSERT OR UPDATE OF weight_kg, measured_at ON public.withings_body_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.zrcadli_withings_vahu();

/**
 * Apple Health → body_measurements.
 *
 * Váha chodí jako metrika `weight_body_mass` s kanonickou jednotkou kg
 * (viz apple_health_metric_defs). Hodnota je v `qty`; u agregovaných metrik
 * může být místo ní `avg_value`. Klíčem u zdroje je (metrika, čas měření) —
 * přesně to, na čem má idempotenci i samotný ingest
 * (`onConflict: user_id,metric_name,measured_at`).
 */
CREATE OR REPLACE FUNCTION public.zrcadli_apple_health_vahu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hodnota numeric;
BEGIN
  IF NEW.metric_name IS DISTINCT FROM 'weight_body_mass' OR NEW.measured_at IS NULL THEN
    RETURN NEW;
  END IF;

  hodnota := COALESCE(NEW.qty, NEW.avg_value);
  IF hodnota IS NULL THEN
    RETURN NEW;
  END IF;

  -- Health Auto Export umí poslat libry. Def říká, že kanonická jednotka je
  -- kg; když dorazí něco jiného, měření se zahodí, protože přepočet patří
  -- do ingestu, ne do triggeru. Tiché uložení liber jako kilogramů by
  -- posunulo kalorický cíl o desítky procent.
  IF NEW.unit IS NOT NULL AND lower(NEW.unit) NOT IN ('kg', 'kilogram', 'kilograms') THEN
    RETURN NEW;
  END IF;

  IF hodnota <= 20 OR hodnota >= 400 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.body_measurements (user_id, measured_at, weight_kg, source, source_record_id)
  VALUES (
    NEW.user_id,
    NEW.measured_at,
    hodnota,
    'apple_health',
    NEW.metric_name || '|' || to_char(NEW.measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ')
  )
  ON CONFLICT (user_id, source, source_record_id) WHERE source_record_id IS NOT NULL
  DO UPDATE SET
    weight_kg = EXCLUDED.weight_kg,
    measured_at = EXCLUDED.measured_at;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.zrcadli_apple_health_vahu() IS
  'Preleva metriku weight_body_mass z apple_health_metrics do kanonicke rady body_measurements. Idempotentni pres unikatni index.';

DROP TRIGGER IF EXISTS zrcadli_apple_health_vahu_trg ON public.apple_health_metrics;
CREATE TRIGGER zrcadli_apple_health_vahu_trg
  AFTER INSERT OR UPDATE OF qty, avg_value, measured_at ON public.apple_health_metrics
  FOR EACH ROW EXECUTE FUNCTION public.zrcadli_apple_health_vahu();

COMMENT ON TABLE public.body_measurements IS
  'Kanonicka rada vazeni. Jediny zdroj pravdy pro aktualni vahu. body_metrics zustava registracnim snimkem a neprepisuje se. Zarizeni sem tecou pres triggery, rucni zapis pres /api/body-measurements.';
