-- Tabulka pro evidenci členství uživatelů (START / ON_CLUB / VIP)
CREATE TABLE IF NOT EXISTS memberships (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        text        NOT NULL DEFAULT 'START'
                CHECK (tier IN ('START', 'ON_CLUB', 'VIP')),
  status      text        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Index pro rychlé vyhledávání dle user_id
CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships(user_id);

-- RLS – uživatel vidí pouze své členství
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own membership"
  ON memberships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage memberships"
  ON memberships FOR ALL
  USING (true)
  WITH CHECK (true);
