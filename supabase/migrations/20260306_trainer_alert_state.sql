-- Ukládání posledního odeslání alertu trenérovi (aby se neposílal opakovaně)
CREATE TABLE IF NOT EXISTS public.trainer_alert_state (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trainer_alert_state IS 'Stav alertů pro trenéra – např. last_alert_sent_at pro rate limiting';
