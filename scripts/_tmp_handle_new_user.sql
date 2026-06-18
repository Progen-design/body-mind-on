SELECT proname, pg_get_function_result(oid) AS result FROM pg_proc WHERE proname = 'handle_new_user';
