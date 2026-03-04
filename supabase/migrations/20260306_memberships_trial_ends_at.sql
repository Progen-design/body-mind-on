-- Přidání sloupce trial_ends_at pro 7denní zkušební dobu START programu
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Pro existující START záznamy bez trial_ends_at: nastavit started_at + 7 dní (retroaktivně)
UPDATE memberships
SET trial_ends_at = started_at + interval '7 days'
WHERE tier = 'START' AND trial_ends_at IS NULL;
