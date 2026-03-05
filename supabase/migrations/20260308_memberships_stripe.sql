-- Tabulka memberships (pro nová prostředí) + Stripe sloupce (pro existující i nová)
CREATE TABLE IF NOT EXISTS public.memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'START',
  status text NOT NULL DEFAULT 'trial',
  started_at timestamptz,
  trial_ends_at timestamptz,
  notes text,
  updated_at timestamptz DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text
);

-- Přidat Stripe sloupce, pokud tabulka už existovala bez nich
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_memberships_stripe_customer ON public.memberships(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_stripe_subscription ON public.memberships(stripe_subscription_id);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- Uživatel může číst jen svůj záznam; zápis jen service role (webhook, body-metrics)
DROP POLICY IF EXISTS "Users can read own membership" ON public.memberships;
CREATE POLICY "Users can read own membership"
  ON public.memberships FOR SELECT
  USING (auth.uid() = user_id);
