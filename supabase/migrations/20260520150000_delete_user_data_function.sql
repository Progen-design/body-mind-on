create or replace function public.delete_user_data(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  n int;
begin
  delete from public.habit_logs where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('habit_logs', n);

  delete from public.user_habits where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('user_habits', n);

  delete from public.workouts where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('workouts', n);

  delete from public.user_checkins where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('user_checkins', n);

  delete from public.user_ai_memory where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('user_ai_memory', n);

  delete from public.ai_messages where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ai_messages', n);

  delete from public.ai_tasks where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ai_tasks', n);

  delete from public.ai_generated_plans where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ai_generated_plans', n);

  delete from public.body_metrics where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('body_metrics', n);

  delete from public.memberships where user_id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('memberships', n);

  delete from public.profiles where id = target_user_id;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('profiles', n);

  return result;
end;
$$;

revoke all on function public.delete_user_data(uuid) from public;
revoke all on function public.delete_user_data(uuid) from anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
