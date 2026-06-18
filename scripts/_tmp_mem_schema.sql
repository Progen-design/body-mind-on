SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='memberships' ORDER BY ordinal_position;
SELECT conname FROM pg_constraint WHERE conrelid = 'public.memberships'::regclass;
