SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
