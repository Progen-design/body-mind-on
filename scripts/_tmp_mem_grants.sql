SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='memberships';
