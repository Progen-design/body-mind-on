-- Revert auth.uid() defaults that interfered with server RPC inserts.
ALTER TABLE public.product_events ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE public.beta_feedback ALTER COLUMN user_id DROP DEFAULT;
