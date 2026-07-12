-- Membership status contract: canonical lifecycle incl. pending_payment / past_due / canceled (US spelling)

ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_status_check;

UPDATE public.memberships
SET status = 'canceled'
WHERE status = 'cancelled';

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_status_check
  CHECK (status IN (
    'trial',
    'pending_payment',
    'active',
    'past_due',
    'canceled',
    'expired'
  ));

COMMENT ON CONSTRAINT memberships_status_check ON public.memberships IS
  'Canonical membership lifecycle: trial, pending_payment, active, past_due, canceled, expired.';
