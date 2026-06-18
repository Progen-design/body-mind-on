SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE '%new_user%' OR tgname LIKE '%auth%';
