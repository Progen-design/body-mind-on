-- Marketing waitlist (12T, VIP lead capture from bodyandmindon.cz)
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_source_key ON public.waitlist (lower(trim(email)), source);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
