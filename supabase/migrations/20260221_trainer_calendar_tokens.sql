-- Kalendář trenéra (info@): jeden záznam s OAuth tokeny pro čtení plánovaných tréninků
CREATE TABLE IF NOT EXISTS trainer_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  calendar_id text DEFAULT 'primary',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Pouze jeden řádek; aplikace kontroluje, že vkládáme jen když tabulka prázdná
COMMENT ON TABLE trainer_calendar_tokens IS 'OAuth tokeny pro Google Kalendář trenéra (info@). Pouze jeden záznam.';
