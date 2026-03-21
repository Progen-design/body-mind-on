-- Upsert v aplikaci: .upsert(..., { onConflict: 'user_id,valid_from' })
-- Vyžaduje UNIQUE (user_id, valid_from). Bez constraintu PostgREST upsert selže.

-- Odstranění duplicit (ponechá řádek s nejnovějším created_at, při shodě větší id)
DELETE FROM ai_generated_plans a
WHERE a.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, valid_from
             ORDER BY created_at DESC NULLS LAST, id::text DESC
           ) AS rn
    FROM ai_generated_plans
    WHERE user_id IS NOT NULL
      AND valid_from IS NOT NULL
  ) sub
  WHERE sub.rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_ai_generated_plans_user_valid_from'
  ) THEN
    ALTER TABLE ai_generated_plans
      ADD CONSTRAINT uq_ai_generated_plans_user_valid_from
      UNIQUE (user_id, valid_from);
  END IF;
END $$;
