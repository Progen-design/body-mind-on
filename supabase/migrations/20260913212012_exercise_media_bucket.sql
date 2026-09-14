-- FÁZE 2 (docs/DALSI_KROK.md 9.12) — bucket pro vlastní animace cviků.
--
-- Vytváří se migrací, ne kliknutím v dashboardu, aby existoval stejně
-- spolehlivě v každém prostředí a šel dohledat v historii. Veřejné čtení
-- (obrázky cviku jsou veřejný obsah appky, ne uživatelská data), zápis jen
-- service_role — žádná INSERT/UPDATE/DELETE policy pro anon/authenticated
-- tu není záměrně: bez povolující policy RLS zápis odmítne, service_role
-- RLS obchází, takže mu stačí service role klíč (viz
-- scripts/nahraj_animace_cviku.py, čte SUPABASE_SERVICE_ROLE_KEY z env).
--
-- APLIKOVÁNO v produkci 13. 9. 2026, razítko 20260913212012 (podle něj je
-- pojmenovaný i tenhle soubor — původní 20260910100000 neodpovídalo).
-- Ověřeno: bucket existuje, public=true, čtecí policy 1×.

INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-media', 'exercise-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "exercise_media_verejne_cteni"
ON storage.objects FOR SELECT
USING (bucket_id = 'exercise-media');

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bucket_existuje boolean;
  v_je_verejny boolean;
  v_ma_cteci_policy boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'exercise-media') INTO v_bucket_existuje;
  IF NOT v_bucket_existuje THEN
    RAISE EXCEPTION 'Bucket exercise-media se nevytvořil.';
  END IF;

  SELECT public INTO v_je_verejny FROM storage.buckets WHERE id = 'exercise-media';
  IF NOT v_je_verejny THEN
    RAISE EXCEPTION 'Bucket exercise-media není veřejný pro čtení.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'exercise_media_verejne_cteni'
  ) INTO v_ma_cteci_policy;
  IF NOT v_ma_cteci_policy THEN
    RAISE EXCEPTION 'Chybí policy na veřejné čtení exercise-media.';
  END IF;

  RAISE NOTICE 'Bucket exercise-media je hotový: veřejné čtení, zápis jen service_role.';
END $$;
