


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."block_ai_task_inserts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- POVOLENÉ task types
  IF NEW.task_type IN ('initial_plan', 'onboarding_message') THEN
    RETURN NEW;
  END IF;
  
  -- BLOKOVÁNO: weekly_plan_update, motivation_message, atd.
  RAISE EXCEPTION 'Task type "%" is BLOCKED in current safe mode (no auto-loops). User: %. Allowed: initial_plan, onboarding_message.', 
    NEW.task_type, NEW.user_id;
END;
$$;


ALTER FUNCTION "public"."block_ai_task_inserts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bm_fill_calculated_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  bmr numeric;
  v_gender_input text := lower(coalesce(new.gender, ''));
  v_gender_norm  text;
  act_factor numeric := case new.activity
    when 'sedavy'  then 1.2
    when 'lehce'   then 1.375
    when 'stredne' then 1.55
    when 'velmi'   then 1.725
    when 'extra'   then 1.9
    else 1.2
  end;
  sessions_from_stress int := case new.stress_level
    when 'low' then 5 when 'medium' then 4 when 'high' then 3 else 4 end;
  sessions_from_user int := case new.freq_choice
    when '0-1'  then 1
    when '2-3'  then 3
    when '4plus' then 5
    else null
  end;
begin
  -- 1) normalizace genderu do 'male' / 'female'
  if v_gender_input in ('male','muz','m') then
    v_gender_norm := 'male';
  elsif v_gender_input in ('female','zena','žena','f') then
    v_gender_norm := 'female';
  else
    v_gender_norm := null;
  end if;

  if v_gender_norm is not null then
    new.gender := v_gender_norm; -- zapíše normalizovanou hodnotu, projde CHECK
  end if;

  -- 2) BMI
  if new.height_cm is not null and new.weight_kg is not null then
    new.bmi := round(new.weight_kg / power(new.height_cm/100.0, 2), 2);
  end if;

  -- 3) BMR/TDEE (Mifflin–St Jeor)
  if new.gender in ('male','female')
     and new.weight_kg is not null
     and new.height_cm is not null
     and new.age is not null then
    if new.gender = 'male' then
      bmr := 10*new.weight_kg + 6.25*new.height_cm - 5*new.age + 5;
    else
      bmr := 10*new.weight_kg + 6.25*new.height_cm - 5*new.age - 161;
    end if;
    new.tdee := round(bmr * act_factor);
  end if;

  -- 4) Frekvence tréninků
  if new.weekly_sessions_user is null then
    new.weekly_sessions_user := sessions_from_user;
  end if;

  if new.weekly_sessions is null then
    if new.weekly_sessions_user is null then
      new.weekly_sessions := sessions_from_stress;
    else
      new.weekly_sessions := least(sessions_from_stress, new.weekly_sessions_user);
    end if;
  end if;

  -- 5) Objem a kardio
  if new.volume_modifier is null then
    new.volume_modifier := case new.stress_level
      when 'low' then 1.0
      when 'medium' then 0.85
      when 'high' then 0.7
      else 0.85
    end;
  end if;

  if new.cardio_minutes is null then
    new.cardio_minutes := case new.occupation
      when 'office_it'      then 90
      when 'driver'         then 60
      when 'warehouse'      then 45
      when 'manual'         then 45
      when 'healthcare'     then 45
      when 'teacher_sales'  then 60
      when 'gastronomy'     then 45
      else 60
    end;
  end if;

  -- 6) Kalorický cíl dle cíle
  if new.calories_target is null and new.tdee is not null then
    new.calories_target := case new.goal
      when 'redukce'        then greatest(0, round(new.tdee - 500))
      when 'nabirani_svaly' then round(new.tdee + 300)
      else round(new.tdee)
    end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."bm_fill_calculated_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_bmi"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.weight_kg is not null and new.height_cm is not null then
    new.bmi := round( (new.weight_kg / power(new.height_cm / 100, 2))::numeric, 2 );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."calculate_bmi"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_tdee"("weight_kg" numeric, "height_cm" numeric, "age" integer, "gender" character varying, "activity_level" character varying DEFAULT 'moderately_active'::character varying) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  bmr decimal;
  activity_multiplier decimal;
begin
  if gender = 'male' then
    bmr := 88.362 + (13.397 * weight_kg) + (4.799 * height_cm) - (5.677 * age);
  else
    bmr := 447.593 + (9.247 * weight_kg) + (3.098 * height_cm) - (4.330 * age);
  end if;

  activity_multiplier := case activity_level
    when 'sedentary' then 1.2
    when 'lightly_active' then 1.375
    when 'moderately_active' then 1.55
    when 'very_active' then 1.725
    when 'extremely_active' then 1.9
    else 1.55
  end;

  return round(bmr * activity_multiplier);
end;
$$;


ALTER FUNCTION "public"."calculate_tdee"("weight_kg" numeric, "height_cm" numeric, "age" integer, "gender" character varying, "activity_level" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_beta_participant_emails"("p_participant_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.beta_email_messages
  SET status = 'canceled', updated_at = now()
  WHERE participant_id = p_participant_id AND status IN ('queued', 'processing');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.beta_email_automation_state
  SET automation_paused = true, updated_at = now()
  WHERE participant_id = p_participant_id;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."cancel_beta_participant_emails"("p_participant_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."beta_email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trigger_key" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "processing_started_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "error_code" "text",
    "provider_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_email_messages_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text", 'canceled'::"text"]))),
    CONSTRAINT "beta_email_messages_trigger_key_check" CHECK (("trigger_key" = ANY (ARRAY['beta_welcome'::"text", 'beta_plan_ready'::"text", 'beta_no_plan_view_24h'::"text", 'beta_no_first_action_48h'::"text", 'beta_day3_feedback'::"text", 'beta_day7_feedback'::"text"])))
);


ALTER TABLE "public"."beta_email_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_email_messages" IS 'Beta lifecycle email queue. No recipient address stored.';



CREATE OR REPLACE FUNCTION "public"."claim_beta_email_batch"("p_limit" integer DEFAULT 20, "p_stale_minutes" integer DEFAULT 15) RETURNS SETOF "public"."beta_email_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH pick AS (
    SELECT m.id
    FROM public.beta_email_messages m
    WHERE (
      m.status = 'queued' AND m.scheduled_at <= now()
    ) OR (
      m.status = 'processing'
      AND m.processing_started_at IS NOT NULL
      AND m.processing_started_at < now() - make_interval(mins => GREATEST(p_stale_minutes, 1))
      AND m.attempt_count < 3
    )
    ORDER BY m.scheduled_at ASC
    LIMIT GREATEST(LEAST(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.beta_email_messages m
  SET
    status = 'processing',
    processing_started_at = now(),
    attempt_count = m.attempt_count + 1,
    updated_at = now()
  FROM pick
  WHERE m.id = pick.id
  RETURNING m.*;
END;
$$;


ALTER FUNCTION "public"."claim_beta_email_batch"("p_limit" integer, "p_stale_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_beta_invite"("p_invite_hash" "text", "p_user_id" "uuid", "p_beta_terms_version" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant public.beta_participants%ROWTYPE;
  v_cohort public.beta_cohorts%ROWTYPE;
  v_registered_count integer;
  v_existing public.beta_participants%ROWTYPE;
BEGIN
  IF p_invite_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_request');
  END IF;

  SELECT * INTO v_existing
  FROM public.beta_participants
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    SELECT * INTO v_cohort FROM public.beta_cohorts WHERE id = v_existing.cohort_id;
    IF v_existing.invite_code_hash = p_invite_hash THEN
      RETURN jsonb_build_object(
        'ok', true,
        'error_code', null,
        'cohort_code', v_cohort.code,
        'already_claimed', true
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error_code', 'already_in_cohort');
  END IF;

  SELECT * INTO v_participant
  FROM public.beta_participants
  WHERE invite_code_hash = p_invite_hash
  FOR UPDATE;

  IF v_participant.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_invite');
  END IF;

  IF v_participant.user_id IS NOT NULL AND v_participant.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_used');
  END IF;

  SELECT * INTO v_cohort
  FROM public.beta_cohorts
  WHERE id = v_participant.cohort_id
  FOR UPDATE;

  IF v_cohort.status NOT IN ('recruiting', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'cohort_closed');
  END IF;

  SELECT count(*)::integer INTO v_registered_count
  FROM public.beta_participants
  WHERE cohort_id = v_cohort.id
    AND user_id IS NOT NULL
    AND status NOT IN ('excluded', 'dropped');

  IF v_participant.user_id IS NULL AND v_registered_count >= v_cohort.max_participants THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'cohort_full');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.beta_participants
    WHERE cohort_id = v_cohort.id AND user_id = p_user_id AND id <> v_participant.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'already_in_cohort');
  END IF;

  UPDATE public.beta_participants
  SET
    user_id = p_user_id,
    status = 'registered',
    registered_at = COALESCE(registered_at, now()),
    beta_terms_accepted_at = now(),
    beta_terms_version = COALESCE(p_beta_terms_version, beta_terms_version),
    updated_at = now()
  WHERE id = v_participant.id;

  RETURN jsonb_build_object(
    'ok', true,
    'error_code', null,
    'cohort_code', v_cohort.code,
    'already_claimed', false
  );
END;
$$;


ALTER FUNCTION "public"."claim_beta_invite"("p_invite_hash" "text", "p_user_id" "uuid", "p_beta_terms_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_data"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."delete_user_data"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_beta_participant_for_user"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.beta_participants%ROWTYPE;
  v_code text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_row
  FROM public.beta_participants
  WHERE user_id = p_user_id
    AND status NOT IN ('excluded', 'dropped')
  ORDER BY registered_at DESC NULLS LAST
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT code INTO v_code FROM public.beta_cohorts WHERE id = v_row.cohort_id;

  RETURN jsonb_build_object(
    'found', true,
    'id', v_row.id,
    'cohort_id', v_row.cohort_id,
    'cohort_code', v_code,
    'cohort_name', (SELECT name FROM public.beta_cohorts WHERE id = v_row.cohort_id),
    'cohort_status', (SELECT status FROM public.beta_cohorts WHERE id = v_row.cohort_id),
    'status', v_row.status,
    'registered_at', v_row.registered_at,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'first_plan_viewed_at', v_row.first_plan_viewed_at,
    'first_action_at', v_row.first_action_at,
    'first_return_at', v_row.first_return_at,
    'source', v_row.source,
    'beta_terms_version', v_row.beta_terms_version,
    'invite_code_hash_set', (v_row.invite_code_hash IS NOT NULL)
  );
END;
$$;


ALTER FUNCTION "public"."get_beta_participant_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_force_regenerate_task"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Pokud je task initial_plan s force_regenerate: true
  IF NEW.task_type = 'initial_plan' 
     AND NEW.status = 'pending'
     AND (NEW.payload->>'force_regenerate')::boolean = true THEN
    -- Deaktivuj existující aktivní plán pro tohoto uživatele
    UPDATE public.ai_generated_plans
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_force_regenerate_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer DEFAULT 1, "p_properties" "jsonb" DEFAULT '{}'::"jsonb", "p_page_path" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT NULL::"text", "p_utm_source" "text" DEFAULT NULL::"text", "p_utm_medium" "text" DEFAULT NULL::"text", "p_utm_campaign" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id';
  END IF;

  IF p_event_name NOT IN (
    'onboarding_started',
    'onboarding_completed',
    'plan_generation_started',
    'plan_generation_completed',
    'plan_generation_failed',
    'plan_viewed',
    'daily_plan_viewed',
    'meal_completed',
    'workout_completed',
    'habit_completed',
    'meal_replaced',
    'daily_checkin_completed',
    'feedback_submitted',
    'paywall_viewed',
    'checkout_started',
    'subscription_activated'
  ) THEN
    RAISE EXCEPTION 'unknown_event';
  END IF;

  INSERT INTO public.product_events (
    user_id,
    event_name,
    event_version,
    properties,
    page_path,
    source,
    utm_source,
    utm_medium,
    utm_campaign
  ) VALUES (
    p_user_id,
    p_event_name,
    COALESCE(p_event_version, 1),
    COALESCE(p_properties, '{}'::jsonb),
    p_page_path,
    p_source,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer, "p_properties" "jsonb", "p_page_path" "text", "p_source" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer, "p_properties" "jsonb", "p_page_path" "text", "p_source" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") IS 'Server-only product event insert with explicit user_id. SECURITY DEFINER bypasses RLS.';



CREATE OR REPLACE FUNCTION "public"."join_beta_cohort"("p_user_id" "uuid", "p_cohort_code" "text", "p_beta_terms_version" "text", "p_source" "text" DEFAULT 'direct_beta_link'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cohort public.beta_cohorts%ROWTYPE;
  v_existing public.beta_participants%ROWTYPE;
  v_registered_count integer;
  v_alias text;
BEGIN
  IF p_user_id IS NULL OR p_cohort_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_request');
  END IF;

  SELECT * INTO v_cohort
  FROM public.beta_cohorts
  WHERE code = p_cohort_code
  FOR UPDATE;

  IF v_cohort.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'cohort_not_found');
  END IF;

  IF v_cohort.status NOT IN ('recruiting', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'cohort_closed');
  END IF;

  SELECT * INTO v_existing
  FROM public.beta_participants
  WHERE cohort_id = v_cohort.id
    AND user_id = p_user_id
    AND status NOT IN ('excluded', 'dropped')
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'error_code', null,
      'cohort_code', v_cohort.code,
      'already_joined', true
    );
  END IF;

  SELECT count(*)::integer INTO v_registered_count
  FROM public.beta_participants
  WHERE cohort_id = v_cohort.id
    AND user_id IS NOT NULL
    AND status NOT IN ('excluded', 'dropped');

  IF v_registered_count >= v_cohort.max_participants THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'cohort_full');
  END IF;

  v_alias := 'C1-P' || lpad((v_registered_count + 1)::text, 2, '0');

  INSERT INTO public.beta_participants (
    cohort_id,
    user_id,
    invite_code_hash,
    internal_alias,
    status,
    registered_at,
    source,
    beta_terms_accepted_at,
    beta_terms_version,
    created_at,
    updated_at
  ) VALUES (
    v_cohort.id,
    p_user_id,
    NULL,
    v_alias,
    'registered',
    now(),
    COALESCE(NULLIF(trim(p_source), ''), 'direct_beta_link'),
    now(),
    COALESCE(p_beta_terms_version, '2026-07-cohort-1'),
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'error_code', null,
    'cohort_code', v_cohort.code,
    'already_joined', false
  );
END;
$$;


ALTER FUNCTION "public"."join_beta_cohort"("p_user_id" "uuid", "p_cohort_code" "text", "p_beta_terms_version" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_beta_email_participants"("p_cohort_code" "text" DEFAULT 'START-C1'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.registered_at NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.id,
      p.user_id,
      p.status AS participant_status,
      p.registered_at,
      p.onboarding_completed_at,
      p.first_plan_viewed_at,
      p.first_action_at,
      c.code AS cohort_code,
      c.status AS cohort_status,
      s.id AS state_id,
      s.welcome_sent_at,
      s.plan_ready_sent_at,
      s.no_plan_view_sent_at,
      s.no_first_action_sent_at,
      s.day3_feedback_sent_at,
      s.day7_feedback_sent_at,
      s.last_email_sent_at,
      s.next_action_at,
      coalesce(s.automation_paused, false) AS automation_paused
    FROM public.beta_participants p
    JOIN public.beta_cohorts c ON c.id = p.cohort_id
    LEFT JOIN public.beta_email_automation_state s ON s.participant_id = p.id
    WHERE c.code = p_cohort_code
      AND p.user_id IS NOT NULL
      AND p.status IN ('registered', 'onboarding', 'active', 'completed')
      AND c.status IN ('recruiting', 'active')
  ) t;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."list_beta_email_participants"("p_cohort_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_beta_email_failed"("p_message_id" "uuid", "p_error_code" "text", "p_retry_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.beta_email_messages%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM public.beta_email_messages WHERE id = p_message_id;
  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_row.attempt_count >= 3 OR p_retry_at IS NULL THEN
    UPDATE public.beta_email_messages
    SET status = 'failed', failed_at = v_now, error_code = left(coalesce(p_error_code, 'send_failed'), 64), updated_at = v_now
    WHERE id = p_message_id;
  ELSE
    UPDATE public.beta_email_messages
    SET
      status = 'queued',
      processing_started_at = NULL,
      error_code = left(coalesce(p_error_code, 'send_failed'), 64),
      scheduled_at = p_retry_at,
      updated_at = v_now
    WHERE id = p_message_id;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."mark_beta_email_failed"("p_message_id" "uuid", "p_error_code" "text", "p_retry_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_beta_email_sent"("p_message_id" "uuid", "p_provider_message_id" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.beta_email_messages%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  UPDATE public.beta_email_messages
  SET status = 'sent', sent_at = v_now, provider_message_id = p_provider_message_id, updated_at = v_now
  WHERE id = p_message_id AND status = 'processing'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.beta_email_automation_state (
    participant_id, user_id, created_at, updated_at
  ) VALUES (v_row.participant_id, v_row.user_id, v_now, v_now)
  ON CONFLICT (participant_id) DO NOTHING;

  UPDATE public.beta_email_automation_state
  SET
    welcome_sent_at = CASE WHEN v_row.trigger_key = 'beta_welcome' AND welcome_sent_at IS NULL THEN v_now ELSE welcome_sent_at END,
    plan_ready_sent_at = CASE WHEN v_row.trigger_key = 'beta_plan_ready' AND plan_ready_sent_at IS NULL THEN v_now ELSE plan_ready_sent_at END,
    no_plan_view_sent_at = CASE WHEN v_row.trigger_key = 'beta_no_plan_view_24h' AND no_plan_view_sent_at IS NULL THEN v_now ELSE no_plan_view_sent_at END,
    no_first_action_sent_at = CASE WHEN v_row.trigger_key = 'beta_no_first_action_48h' AND no_first_action_sent_at IS NULL THEN v_now ELSE no_first_action_sent_at END,
    day3_feedback_sent_at = CASE WHEN v_row.trigger_key = 'beta_day3_feedback' AND day3_feedback_sent_at IS NULL THEN v_now ELSE day3_feedback_sent_at END,
    day7_feedback_sent_at = CASE WHEN v_row.trigger_key = 'beta_day7_feedback' AND day7_feedback_sent_at IS NULL THEN v_now ELSE day7_feedback_sent_at END,
    last_email_sent_at = v_now,
    updated_at = v_now
  WHERE participant_id = v_row.participant_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."mark_beta_email_sent"("p_message_id" "uuid", "p_provider_message_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_beta_email_skipped"("p_message_id" "uuid", "p_error_code" "text" DEFAULT 'skipped'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.beta_email_messages
  SET status = 'skipped', error_code = left(coalesce(p_error_code, 'skipped'), 64), updated_at = now()
  WHERE id = p_message_id AND status IN ('queued', 'processing')
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."mark_beta_email_skipped"("p_message_id" "uuid", "p_error_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patch_beta_participant_milestone"("p_user_id" "uuid", "p_patch" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN false;
  END IF;

  SELECT id INTO v_id
  FROM public.beta_participants
  WHERE user_id = p_user_id
    AND status NOT IN ('excluded', 'dropped')
  ORDER BY registered_at DESC NULLS LAST
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.beta_participants
  SET
    onboarding_completed_at = CASE
      WHEN (p_patch ? 'onboarding_completed_at') AND onboarding_completed_at IS NULL
        THEN (p_patch->>'onboarding_completed_at')::timestamptz
      ELSE onboarding_completed_at
    END,
    first_plan_viewed_at = CASE
      WHEN (p_patch ? 'first_plan_viewed_at') AND first_plan_viewed_at IS NULL
        THEN (p_patch->>'first_plan_viewed_at')::timestamptz
      ELSE first_plan_viewed_at
    END,
    first_action_at = CASE
      WHEN (p_patch ? 'first_action_at') AND first_action_at IS NULL
        THEN (p_patch->>'first_action_at')::timestamptz
      ELSE first_action_at
    END,
    first_return_at = CASE
      WHEN (p_patch ? 'first_return_at') AND first_return_at IS NULL
        THEN (p_patch->>'first_return_at')::timestamptz
      ELSE first_return_at
    END,
    status = COALESCE(p_patch->>'status', status),
    updated_at = now()
  WHERE id = v_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."patch_beta_participant_milestone"("p_user_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_task_without_metrics"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Pouze pro initial_plan tasky
  IF NEW.task_type = 'initial_plan' AND NEW.status = 'pending' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.body_metrics WHERE user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Cannot create initial_plan task: user % has no body_metrics', NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_task_without_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_beta_email_message"("p_participant_id" "uuid", "p_user_id" "uuid", "p_trigger_key" "text", "p_scheduled_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_participant_id IS NULL OR p_user_id IS NULL OR p_trigger_key IS NULL OR p_scheduled_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_request');
  END IF;

  INSERT INTO public.beta_email_messages (
    participant_id, user_id, trigger_key, status, scheduled_at, created_at, updated_at
  ) VALUES (
    p_participant_id, p_user_id, p_trigger_key, 'queued', p_scheduled_at, now(), now()
  )
  ON CONFLICT (participant_id, trigger_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'queued', false, 'already_exists', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'queued', true, 'message_id', v_id);
END;
$$;


ALTER FUNCTION "public"."queue_beta_email_message"("p_participant_id" "uuid", "p_user_id" "uuid", "p_trigger_key" "text", "p_scheduled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_beta_invite"("p_invite_hash" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant public.beta_participants%ROWTYPE;
  v_cohort public.beta_cohorts%ROWTYPE;
  v_registered_count integer;
BEGIN
  IF p_invite_hash IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO v_participant
  FROM public.beta_participants
  WHERE invite_code_hash = p_invite_hash;

  IF v_participant.id IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_participant.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO v_cohort FROM public.beta_cohorts WHERE id = v_participant.cohort_id;

  IF v_cohort.status NOT IN ('recruiting', 'active') THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT count(*)::integer INTO v_registered_count
  FROM public.beta_participants
  WHERE cohort_id = v_cohort.id
    AND user_id IS NOT NULL
    AND status NOT IN ('excluded', 'dropped');

  RETURN jsonb_build_object(
    'valid', v_registered_count < v_cohort.max_participants,
    'cohort_code', v_cohort.code,
    'cohort_name', v_cohort.name,
    'remaining_slots', GREATEST(v_cohort.max_participants - v_registered_count, 0)
  );
END;
$$;


ALTER FUNCTION "public"."validate_beta_invite"("p_invite_hash" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_ai_agents" (
    "id" "uuid",
    "slug" "text",
    "name" "text",
    "model" "text",
    "system_prompt" "text",
    "temperature" numeric,
    "enabled" boolean,
    "created_at" timestamp without time zone,
    "updated_at" timestamp without time zone,
    "version" integer,
    "prompt_version" integer,
    "context_profile_slug" "text",
    "default_output_contract" "jsonb",
    "executor_group" "text",
    "artifact_type" "text",
    "is_published" boolean,
    "web_search_enabled" boolean
);


ALTER TABLE "public"."_backup_2026_06_02_ai_agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_body_metrics" (
    "id" "uuid",
    "user_id" "uuid",
    "height_cm" numeric(5,2),
    "weight_kg" numeric(5,2),
    "age" integer,
    "bmi" numeric(4,2),
    "tdee" integer,
    "notes" "text",
    "created_at" timestamp without time zone,
    "email" "text",
    "name" "text",
    "gender" character varying(10),
    "stress_level" "text",
    "occupation" "text",
    "weekly_sessions" integer,
    "volume_modifier" numeric,
    "cardio_minutes" integer,
    "activity" "text",
    "goal" "text",
    "freq_choice" "text",
    "weekly_sessions_user" integer,
    "calories_target" integer,
    "plan" "text",
    "lead_source" "text",
    "program" "text",
    "diet_type" "text",
    "dietary_restrictions" "text",
    "foods_to_avoid" "text",
    "workout_days" "text"
);


ALTER TABLE "public"."_backup_2026_06_02_body_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_exercise_cache" (
    "id" "uuid",
    "exercise_name" "text",
    "image_url" "text",
    "gif_url" "text",
    "body_part" "text",
    "target" "text",
    "equipment" "text",
    "source" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."_backup_2026_06_02_exercise_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_meal_cache" (
    "id" "uuid",
    "meal_name" "text",
    "image_url" "text",
    "calories" numeric,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "source" "text",
    "created_at" timestamp without time zone,
    "name_key" "text",
    "name" "text",
    "image_trust_level" "text",
    "exact_source" "text",
    "illustrative_source" "text",
    "confidence_score" numeric(5,4),
    "updated_at" timestamp without time zone,
    "fiber_g" numeric,
    "sugar_g" numeric,
    "saturated_fat_g" numeric,
    "sodium_mg" numeric,
    "cholesterol_mg" numeric,
    "vitamin_c_mg" numeric,
    "vitamin_d_ug" numeric,
    "vitamin_b12_ug" numeric,
    "calcium_mg" numeric,
    "iron_mg" numeric,
    "potassium_mg" numeric,
    "magnesium_mg" numeric,
    "zinc_mg" numeric,
    "health_score" numeric,
    "ready_in_minutes" integer,
    "servings" integer,
    "price_per_serving" numeric,
    "diets" "jsonb",
    "dish_types" "jsonb",
    "ingredients" "jsonb",
    "spoonacular_id" integer,
    "nutrition_json" "jsonb"
);


ALTER TABLE "public"."_backup_2026_06_02_meal_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_memberships" (
    "id" "uuid",
    "user_id" "uuid",
    "tier" "text",
    "status" "text",
    "started_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text"
);


ALTER TABLE "public"."_backup_2026_06_02_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_plans" (
    "id" "uuid",
    "user_id" "uuid",
    "plan_type" "text",
    "workout_plan" "jsonb",
    "exercises_data" "jsonb",
    "daily_calories" integer,
    "macros" "jsonb",
    "meal_plan" "jsonb",
    "generated_by" "text",
    "generation_prompt" "text",
    "user_context" "jsonb",
    "valid_from" "date",
    "valid_until" "date",
    "is_active" boolean,
    "created_at" timestamp without time zone,
    "plan_markdown" "text",
    "plan_html" "text",
    "email_sent" boolean,
    "email" "text",
    "structured_plan_json" "jsonb",
    "nutrition_daily_targets" "jsonb",
    "shopping_list_structured" "jsonb"
);


ALTER TABLE "public"."_backup_2026_06_02_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_profiles" (
    "id" "uuid",
    "email" "text",
    "name" "text",
    "created_at" timestamp with time zone,
    "daily_email" boolean,
    "avatar_url" "text",
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."_backup_2026_06_02_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_user_habits" (
    "id" "uuid",
    "user_id" "uuid",
    "habit_id" "text",
    "is_positive" boolean,
    "sort_order" integer,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."_backup_2026_06_02_user_habits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_2026_06_02_users" (
    "instance_id" "uuid",
    "id" "uuid",
    "aud" character varying(255),
    "role" character varying(255),
    "email" character varying(255),
    "encrypted_password" character varying(255),
    "email_confirmed_at" timestamp with time zone,
    "invited_at" timestamp with time zone,
    "confirmation_token" character varying(255),
    "confirmation_sent_at" timestamp with time zone,
    "recovery_token" character varying(255),
    "recovery_sent_at" timestamp with time zone,
    "email_change_token_new" character varying(255),
    "email_change" character varying(255),
    "email_change_sent_at" timestamp with time zone,
    "last_sign_in_at" timestamp with time zone,
    "raw_app_meta_data" "jsonb",
    "raw_user_meta_data" "jsonb",
    "is_super_admin" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "phone" "text",
    "phone_confirmed_at" timestamp with time zone,
    "phone_change" "text",
    "phone_change_token" character varying(255),
    "phone_change_sent_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "email_change_token_current" character varying(255),
    "email_change_confirm_status" smallint,
    "banned_until" timestamp with time zone,
    "reauthentication_token" character varying(255),
    "reauthentication_sent_at" timestamp with time zone,
    "is_sso_user" boolean,
    "deleted_at" timestamp with time zone,
    "is_anonymous" boolean
);


ALTER TABLE "public"."_backup_2026_06_02_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_slug" "text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_agent_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_tools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_slug" "text" NOT NULL,
    "tool_name" "text" NOT NULL,
    "enabled" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_agent_tools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_slug" "text" NOT NULL,
    "version" integer NOT NULL,
    "system_prompt" "text",
    "model" "text",
    "temperature" numeric,
    "notes" "text",
    "published_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_agent_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "model" "text" DEFAULT 'gpt-4.1'::"text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "temperature" numeric DEFAULT 0.2,
    "enabled" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "version" integer DEFAULT 1,
    "prompt_version" integer DEFAULT 1,
    "context_profile_slug" "text",
    "default_output_contract" "jsonb",
    "executor_group" "text",
    "artifact_type" "text",
    "is_published" boolean DEFAULT true,
    "web_search_enabled" boolean DEFAULT false
);


ALTER TABLE "public"."ai_agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agents_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "agent_type" character varying(30),
    "action_type" character varying(50),
    "input_data" "jsonb",
    "output_data" "jsonb",
    "api_used" character varying(20),
    "tokens_used" integer,
    "cost_usd" numeric(8,4),
    "execution_time_ms" integer,
    "success" boolean DEFAULT true,
    "error_message" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "run_id" "uuid" DEFAULT "gen_random_uuid"(),
    "notes" "text"
);


ALTER TABLE "public"."ai_agents_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model" "text" DEFAULT 'gpt-4.1'::"text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "temperature" numeric DEFAULT 0.2,
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_content_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "agent_slug" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "title" "text",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_content_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_context_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "sources_json" "jsonb" DEFAULT '["body_metrics", "ai_generated_plans", "user_ai_memory", "user_checkins"]'::"jsonb",
    "include_progress" boolean DEFAULT true,
    "include_checkins" boolean DEFAULT true,
    "include_plans" boolean DEFAULT true,
    "include_memory" boolean DEFAULT true,
    "runtime_capabilities_json" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_context_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payload" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "result" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "processed_at" timestamp without time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp without time zone,
    "last_error" "text",
    "dead_lettered_at" timestamp without time zone,
    "max_attempts" integer DEFAULT 5 NOT NULL
);


ALTER TABLE "public"."ai_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_executor_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "side_effect_type" "text" NOT NULL,
    "executor_slug" "text" NOT NULL,
    "artifact_table" "text",
    "artifact_kind" "text",
    "enabled" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_executor_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generated_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plan_type" "text",
    "workout_plan" "jsonb",
    "exercises_data" "jsonb",
    "daily_calories" integer,
    "macros" "jsonb",
    "meal_plan" "jsonb",
    "generated_by" "text",
    "generation_prompt" "text",
    "user_context" "jsonb",
    "valid_from" "date" DEFAULT CURRENT_DATE,
    "valid_until" "date" DEFAULT (CURRENT_DATE + '7 days'::interval),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "plan_markdown" "text",
    "plan_html" "text" DEFAULT 'null'::"text",
    "email_sent" boolean DEFAULT false,
    "email" "text",
    "structured_plan_json" "jsonb",
    "nutrition_daily_targets" "jsonb",
    "shopping_list_structured" "jsonb"
);


ALTER TABLE "public"."ai_generated_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_generated_plans" IS 'AI generované plány (OpenAI Assistant) – jídelníček, trénink, makra.';



COMMENT ON COLUMN "public"."ai_generated_plans"."structured_plan_json" IS 'Canonical structured plan (days, targets, meals, workouts). HTML is rendered from this.';



COMMENT ON COLUMN "public"."ai_generated_plans"."shopping_list_structured" IS 'Nákupní seznam agregovaný ze Spoonacular ingrediencí, seskupený dle aisle';



CREATE TABLE IF NOT EXISTS "public"."ai_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "user_id" "uuid",
    "agent_slug" "text",
    "status" "text" NOT NULL,
    "cache_hit" boolean DEFAULT false NOT NULL,
    "duration_ms" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    "estimated_cost_usd" numeric(12,6),
    "message" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "action" "text",
    "payload" "jsonb",
    "result" "jsonb",
    "error" "text"
);


ALTER TABLE "public"."ai_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_slug" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "title" "text",
    "content" "text" NOT NULL,
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "delivery_channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp without time zone,
    "task_id" "uuid",
    "payload" "jsonb"
);


ALTER TABLE "public"."ai_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_supporting_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "key_facts" "jsonb" DEFAULT '[]'::"jsonb",
    "source_id" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_supporting_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_task_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_slug" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "description" "text",
    "output_schema_json" "jsonb",
    "side_effect_type" "text" NOT NULL,
    "retry_policy" "text" DEFAULT 'exponential'::"text",
    "cooldown_hours" numeric DEFAULT 0,
    "enabled" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_task_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "agent_slug" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "payload" "jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "result" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "processed_at" timestamp without time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp without time zone,
    "last_error" "text",
    "dead_lettered_at" timestamp without time zone,
    "idempotency_key" "text",
    "source_event_id" "uuid",
    "processing_started_at" timestamp without time zone,
    "artifact_id" "uuid",
    "max_attempts" integer DEFAULT 5 NOT NULL
);


ALTER TABLE "public"."ai_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_trigger_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trigger_type" "text" NOT NULL,
    "trigger_value" "text",
    "agent_slug" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "priority" integer DEFAULT 100,
    "conditions_json" "jsonb",
    "enabled" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_trigger_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apple_health_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_label" "text" DEFAULT 'iPhone'::"text" NOT NULL,
    "api_key_hash" "text" NOT NULL,
    "api_key_prefix" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_error" "text",
    "sync_count" bigint DEFAULT 0 NOT NULL,
    "revoked_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "apple_health_connections_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."apple_health_connections" OWNER TO "postgres";


COMMENT ON TABLE "public"."apple_health_connections" IS 'Apple Health (Health Auto Export) pripojeni. API klic ulozen jen jako SHA-256 hash.';



CREATE TABLE IF NOT EXISTS "public"."apple_health_metric_defs" (
    "metric_name" "text" NOT NULL,
    "label_cs" "text" NOT NULL,
    "category" "text" NOT NULL,
    "agg" "text" DEFAULT 'avg'::"text" NOT NULL,
    "canonical_unit" "text",
    "from_unit" "text",
    "factor" numeric,
    "is_key" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "apple_health_metric_defs_agg_check" CHECK (("agg" = ANY (ARRAY['sum'::"text", 'avg'::"text", 'last'::"text", 'max'::"text", 'min'::"text"]))),
    CONSTRAINT "apple_health_metric_defs_category_check" CHECK (("category" = ANY (ARRAY['aktivita'::"text", 'srdce'::"text", 'telo'::"text", 'dychani'::"text", 'pohyb'::"text", 'prostredi'::"text", 'spanek'::"text", 'ostatni'::"text"])))
);


ALTER TABLE "public"."apple_health_metric_defs" OWNER TO "postgres";


COMMENT ON TABLE "public"."apple_health_metric_defs" IS 'Registr metrik Apple Health: pravidla agregace, prepocet jednotek, ceske nazvy. Nova metrika bez zaznamu se agreguje heuristicky (avg) a objevi se v apple_health_unknown_metrics.';



CREATE TABLE IF NOT EXISTS "public"."apple_health_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "metric_name" "text" NOT NULL,
    "unit" "text",
    "measured_at" timestamp with time zone NOT NULL,
    "local_date" "date" NOT NULL,
    "qty" numeric,
    "min_value" numeric,
    "max_value" numeric,
    "avg_value" numeric,
    "source" "text" DEFAULT ''::"text" NOT NULL,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apple_health_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."apple_health_metrics" IS 'Bodove metriky z Apple Health (long format). Idempotentni upsert.';



CREATE OR REPLACE VIEW "public"."apple_health_metrics_daily" WITH ("security_invoker"='true') AS
 WITH "conv" AS (
         SELECT "m"."user_id",
            "m"."local_date",
            "m"."metric_name",
            COALESCE("d"."label_cs", "m"."metric_name") AS "label_cs",
            COALESCE("d"."category", 'ostatni'::"text") AS "category",
            COALESCE("d"."agg", 'avg'::"text") AS "agg",
            COALESCE("d"."canonical_unit", "m"."unit") AS "unit",
            COALESCE("d"."is_key", false) AS "is_key",
                CASE
                    WHEN (("d"."from_unit" IS NOT NULL) AND ("lower"("m"."unit") = "lower"("d"."from_unit")) AND ("d"."factor" IS NOT NULL)) THEN ("m"."qty" * "d"."factor")
                    ELSE "m"."qty"
                END AS "qty",
            "m"."min_value",
            "m"."max_value",
            "m"."measured_at"
           FROM ("public"."apple_health_metrics" "m"
             LEFT JOIN "public"."apple_health_metric_defs" "d" ON (("d"."metric_name" = "m"."metric_name")))
        )
 SELECT "user_id",
    "local_date",
    "metric_name",
    "label_cs",
    "category",
    "unit",
    "agg",
    "is_key",
        CASE "agg"
            WHEN 'sum'::"text" THEN "sum"("qty")
            WHEN 'max'::"text" THEN "max"("qty")
            WHEN 'min'::"text" THEN "min"("qty")
            WHEN 'last'::"text" THEN ("array_agg"("qty" ORDER BY "measured_at" DESC))[1]
            ELSE "avg"("qty")
        END AS "value",
    "min"(COALESCE("min_value", "qty")) AS "min_value",
    "max"(COALESCE("max_value", "qty")) AS "max_value",
    "count"(*) AS "samples"
   FROM "conv"
  GROUP BY "user_id", "local_date", "metric_name", "label_cs", "category", "unit", "agg", "is_key";


ALTER VIEW "public"."apple_health_metrics_daily" OWNER TO "postgres";


COMMENT ON VIEW "public"."apple_health_metrics_daily" IS 'Vsechny metriky Apple Health po dnech, agregovane dle apple_health_metric_defs. Zadny whitelist - nova metrika projde automaticky.';



CREATE TABLE IF NOT EXISTS "public"."apple_health_sleep" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sleep_start" timestamp with time zone NOT NULL,
    "sleep_end" timestamp with time zone,
    "local_date" "date" NOT NULL,
    "in_bed_min" numeric,
    "asleep_min" numeric,
    "core_min" numeric,
    "deep_min" numeric,
    "rem_min" numeric,
    "awake_min" numeric,
    "efficiency_pct" numeric,
    "source" "text" DEFAULT ''::"text" NOT NULL,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apple_health_sleep" OWNER TO "postgres";


COMMENT ON TABLE "public"."apple_health_sleep" IS 'Spankove relace z Apple Watch. local_date = den probuzeni.';



CREATE TABLE IF NOT EXISTS "public"."apple_health_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "workout_type" "text",
    "started_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "local_date" "date" NOT NULL,
    "duration_s" numeric,
    "active_kcal" numeric,
    "total_kcal" numeric,
    "distance_m" numeric,
    "avg_hr" numeric,
    "max_hr" numeric,
    "elevation_m" numeric,
    "source" "text" DEFAULT ''::"text",
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apple_health_workouts" OWNER TO "postgres";


COMMENT ON TABLE "public"."apple_health_workouts" IS 'Treninky z Apple Watch. Oddelene od public.workouts (planovane treninky v appce).';



CREATE TABLE IF NOT EXISTS "public"."workout_type_map" (
    "raw_type" "text" NOT NULL,
    "canonical" "text" NOT NULL,
    "label_cs" "text" NOT NULL,
    "category" "text" NOT NULL,
    CONSTRAINT "workout_type_map_category_check" CHECK (("category" = ANY (ARRAY['kardio'::"text", 'sila'::"text", 'plavani'::"text", 'kolo'::"text", 'chuze'::"text", 'beh'::"text", 'jina'::"text"])))
);


ALTER TABLE "public"."workout_type_map" OWNER TO "postgres";


COMMENT ON TABLE "public"."workout_type_map" IS 'Mapovani lokalizovanych nazvu treninku z Health Auto Export na stabilni kanonicke klice. HAE lokalizuje podle jazyka iOS - bez tohoto se analytika rozpadne pri zmene jazyka.';



CREATE OR REPLACE VIEW "public"."apple_health_daily" WITH ("security_invoker"='true') AS
 WITH "p" AS (
         SELECT "apple_health_metrics_daily"."user_id",
            "apple_health_metrics_daily"."local_date",
            "apple_health_metrics_daily"."metric_name",
            "apple_health_metrics_daily"."label_cs",
            "apple_health_metrics_daily"."category",
            "apple_health_metrics_daily"."unit",
            "apple_health_metrics_daily"."agg",
            "apple_health_metrics_daily"."is_key",
            "apple_health_metrics_daily"."value",
            "apple_health_metrics_daily"."min_value",
            "apple_health_metrics_daily"."max_value",
            "apple_health_metrics_daily"."samples"
           FROM "public"."apple_health_metrics_daily"
        ), "w" AS (
         SELECT "wk"."user_id",
            "wk"."local_date",
            "count"(*) AS "workout_count",
            "round"(("sum"("wk"."duration_s") / 60.0)) AS "workout_min",
            "round"("sum"(COALESCE("wk"."active_kcal", "wk"."total_kcal"))) AS "workout_kcal",
            "round"("max"("wk"."max_hr")) AS "workout_max_hr",
            "round"("avg"("wk"."avg_hr"), 1) AS "workout_avg_hr",
            "round"(("sum"("wk"."distance_m") / 1000.0), 2) AS "workout_km",
            "array_agg"(DISTINCT COALESCE("m"."canonical", 'unmapped'::"text")) AS "workout_types",
            "string_agg"(DISTINCT COALESCE("m"."label_cs", "wk"."workout_type"), ', '::"text") AS "workout_labels",
            "array_agg"(DISTINCT COALESCE("m"."category", 'jina'::"text")) AS "workout_categories"
           FROM ("public"."apple_health_workouts" "wk"
             LEFT JOIN "public"."workout_type_map" "m" ON (("m"."raw_type" = "wk"."workout_type")))
          GROUP BY "wk"."user_id", "wk"."local_date"
        ), "s" AS (
         SELECT "apple_health_sleep"."user_id",
            "apple_health_sleep"."local_date",
            "round"("sum"("apple_health_sleep"."asleep_min")) AS "sleep_asleep_min",
            "round"("sum"("apple_health_sleep"."deep_min")) AS "sleep_deep_min",
            "round"("sum"("apple_health_sleep"."rem_min")) AS "sleep_rem_min",
            "round"("sum"("apple_health_sleep"."core_min")) AS "sleep_core_min",
            "round"("avg"("apple_health_sleep"."efficiency_pct"), 1) AS "sleep_efficiency_pct"
           FROM "public"."apple_health_sleep"
          GROUP BY "apple_health_sleep"."user_id", "apple_health_sleep"."local_date"
        ), "days" AS (
         SELECT DISTINCT "p_1"."user_id",
            "p_1"."local_date"
           FROM "p" "p_1"
        UNION
         SELECT "w_1"."user_id",
            "w_1"."local_date"
           FROM "w" "w_1"
        UNION
         SELECT "s_1"."user_id",
            "s_1"."local_date"
           FROM "s" "s_1"
        )
 SELECT "d"."user_id",
    "d"."local_date",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'step_count'::"text"))) AS "steps",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'active_energy'::"text"))) AS "active_kcal",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'basal_energy_burned'::"text"))) AS "basal_kcal",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'apple_exercise_time'::"text"))) AS "exercise_min",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'apple_stand_hour'::"text"))) AS "stand_hours",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'flights_climbed'::"text"))) AS "flights",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'time_in_daylight'::"text"))) AS "daylight_min",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'walking_running_distance'::"text")), 2) AS "distance_km",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'cycling_distance'::"text")), 2) AS "cycling_km",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'swimming_distance'::"text")), 1) AS "swimming_m",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'resting_heart_rate'::"text"))) AS "resting_hr",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'heart_rate'::"text")), 1) AS "avg_hr",
    "round"("max"("p"."max_value") FILTER (WHERE ("p"."metric_name" = 'heart_rate'::"text"))) AS "max_hr",
    "round"("min"("p"."min_value") FILTER (WHERE ("p"."metric_name" = 'heart_rate'::"text"))) AS "min_hr",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'heart_rate_variability'::"text")), 1) AS "hrv_ms",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'walking_heart_rate_average'::"text")), 1) AS "walking_hr",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'cardio_recovery'::"text")), 1) AS "cardio_recovery",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'vo2_max'::"text")), 1) AS "vo2max",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'respiratory_rate'::"text")), 1) AS "respiratory_rate",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'blood_oxygen_saturation'::"text")), 1) AS "spo2",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'weight_body_mass'::"text")), 2) AS "ah_weight_kg",
    "round"("max"("p"."value") FILTER (WHERE ("p"."metric_name" = 'body_fat_percentage'::"text")), 2) AS "ah_body_fat_pct",
    "s"."sleep_asleep_min",
    "s"."sleep_deep_min",
    "s"."sleep_rem_min",
    "s"."sleep_core_min",
    "s"."sleep_efficiency_pct",
    "w"."workout_count",
    "w"."workout_min",
    "w"."workout_kcal",
    "w"."workout_avg_hr",
    "w"."workout_max_hr",
    "w"."workout_km",
    "w"."workout_types",
    "w"."workout_labels",
    "w"."workout_categories"
   FROM ((("days" "d"
     LEFT JOIN "p" ON ((("p"."user_id" = "d"."user_id") AND ("p"."local_date" = "d"."local_date"))))
     LEFT JOIN "s" ON ((("s"."user_id" = "d"."user_id") AND ("s"."local_date" = "d"."local_date"))))
     LEFT JOIN "w" ON ((("w"."user_id" = "d"."user_id") AND ("w"."local_date" = "d"."local_date"))))
  GROUP BY "d"."user_id", "d"."local_date", "s"."sleep_asleep_min", "s"."sleep_deep_min", "s"."sleep_rem_min", "s"."sleep_core_min", "s"."sleep_efficiency_pct", "w"."workout_count", "w"."workout_min", "w"."workout_kcal", "w"."workout_avg_hr", "w"."workout_max_hr", "w"."workout_km", "w"."workout_types", "w"."workout_labels", "w"."workout_categories";


ALTER VIEW "public"."apple_health_daily" OWNER TO "postgres";


COMMENT ON VIEW "public"."apple_health_daily" IS 'SEKCE APPLE WATCH: denni souhrn. workout_types = stabilni kanonicke klice pro AI, workout_labels = ceske nazvy pro UI. Neobsahuje vahu z Withings.';



CREATE TABLE IF NOT EXISTS "public"."apple_health_raw_payloads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "connection_id" "uuid",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "byte_size" integer,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone,
    "process_error" "text",
    "metrics_count" integer DEFAULT 0 NOT NULL,
    "workouts_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."apple_health_raw_payloads" OWNER TO "postgres";


COMMENT ON TABLE "public"."apple_health_raw_payloads" IS 'Syrove payloady z Health Auto Export. Audit + moznost replay pri zmene parseru.';



CREATE OR REPLACE VIEW "public"."apple_health_recovery" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "d"."user_id",
            "d"."local_date",
            "d"."hrv_ms",
            "d"."resting_hr",
            "d"."sleep_asleep_min",
            "d"."steps",
            "d"."active_kcal",
            "d"."exercise_min",
            "d"."workout_count",
            "d"."workout_min",
            "d"."workout_labels",
            "avg"("d"."hrv_ms") OVER "w7" AS "hrv_baseline7",
            "avg"("d"."resting_hr") OVER "w7" AS "rhr_baseline7",
            "count"("d"."hrv_ms") OVER "w7" AS "hrv_dnu",
            "count"("d"."resting_hr") OVER "w7" AS "rhr_dnu"
           FROM "public"."apple_health_daily" "d"
          WINDOW "w7" AS (PARTITION BY "d"."user_id" ORDER BY "d"."local_date" ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING)
        ), "calc" AS (
         SELECT "b"."user_id",
            "b"."local_date",
            "b"."hrv_ms",
            "b"."resting_hr",
            "b"."sleep_asleep_min",
            "b"."steps",
            "b"."active_kcal",
            "b"."exercise_min",
            "b"."workout_count",
            "b"."workout_min",
            "b"."workout_labels",
            "b"."hrv_baseline7",
            "b"."rhr_baseline7",
            "b"."hrv_dnu",
            "b"."rhr_dnu",
                CASE
                    WHEN ("b"."hrv_baseline7" > (0)::numeric) THEN ((("b"."hrv_ms" - "b"."hrv_baseline7") / "b"."hrv_baseline7") * (100)::numeric)
                    ELSE NULL::numeric
                END AS "hrv_delta_pct",
            ("b"."resting_hr" - "b"."rhr_baseline7") AS "rhr_delta_bpm",
            ("b"."sleep_asleep_min" / 480.0) AS "sleep_ratio"
           FROM "base" "b"
        )
 SELECT "user_id",
    "local_date",
    "hrv_ms",
    "resting_hr",
    "sleep_asleep_min",
    "steps",
    "active_kcal",
    "exercise_min",
    "workout_count",
    "workout_min",
    "workout_labels",
    "round"("hrv_baseline7", 1) AS "hrv_baseline7",
    "round"("rhr_baseline7", 1) AS "rhr_baseline7",
    "round"("hrv_delta_pct", 1) AS "hrv_delta_pct",
    "round"("rhr_delta_bpm", 1) AS "rhr_delta_bpm",
        CASE
            WHEN (("hrv_dnu" < 3) OR ("rhr_dnu" < 3)) THEN NULL::numeric
            WHEN (("hrv_ms" IS NULL) OR ("resting_hr" IS NULL)) THEN NULL::numeric
            ELSE "round"((((((40)::numeric * LEAST(GREATEST(((1)::numeric + (COALESCE("hrv_delta_pct", (0)::numeric) / (100)::numeric)), (0)::numeric), 1.25)) / 1.25) + ((30)::numeric * LEAST(GREATEST(((1)::numeric - (COALESCE("rhr_delta_bpm", (0)::numeric) / (10)::numeric)), (0)::numeric), (1)::numeric))) + ((30)::numeric * LEAST(GREATEST(COALESCE("sleep_ratio", (0)::numeric), (0)::numeric), (1)::numeric))))
        END AS "recovery_score",
        CASE
            WHEN (("hrv_dnu" < 3) OR ("rhr_dnu" < 3)) THEN 'nedostatek_dat'::"text"
            WHEN ("hrv_ms" IS NULL) THEN 'chybi_hrv'::"text"
            WHEN ("resting_hr" IS NULL) THEN 'chybi_klidovy_tep'::"text"
            WHEN ("sleep_asleep_min" IS NULL) THEN 'chybi_spanek'::"text"
            ELSE 'ok'::"text"
        END AS "recovery_status"
   FROM "calc";


ALTER VIEW "public"."apple_health_recovery" OWNER TO "postgres";


COMMENT ON VIEW "public"."apple_health_recovery" IS 'Orientacni skore regenerace (0-100) z Apple Health. NENI zdravotni diagnostika.';



CREATE OR REPLACE VIEW "public"."apple_health_unknown_metrics" WITH ("security_invoker"='true') AS
 SELECT "m"."metric_name",
    "min"("m"."unit") AS "unit",
    "count"(*) AS "radku",
    "max"("m"."local_date") AS "naposledy"
   FROM ("public"."apple_health_metrics" "m"
     LEFT JOIN "public"."apple_health_metric_defs" "d" ON (("d"."metric_name" = "m"."metric_name")))
  WHERE ("d"."metric_name" IS NULL)
  GROUP BY "m"."metric_name";


ALTER VIEW "public"."apple_health_unknown_metrics" OWNER TO "postgres";


COMMENT ON VIEW "public"."apple_health_unknown_metrics" IS 'Metriky, ktere dorazily z Apple Health, ale nejsou v registru. Doplnit do apple_health_metric_defs.';



CREATE TABLE IF NOT EXISTS "public"."beta_cohorts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "max_participants" integer DEFAULT 5 NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_cohorts_max_participants_check" CHECK ((("max_participants" >= 1) AND ("max_participants" <= 100))),
    CONSTRAINT "beta_cohorts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'recruiting'::"text", 'active'::"text", 'analyzing'::"text", 'completed'::"text", 'canceled'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."beta_cohorts" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_cohorts" IS 'Closed beta cohort definitions. Admin/service role only.';



CREATE TABLE IF NOT EXISTS "public"."beta_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "decision" "text" NOT NULL,
    "rationale" "text" NOT NULL,
    "evidence_summary" "text",
    "decided_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."beta_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_email_automation_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "welcome_sent_at" timestamp with time zone,
    "plan_ready_sent_at" timestamp with time zone,
    "no_plan_view_sent_at" timestamp with time zone,
    "no_first_action_sent_at" timestamp with time zone,
    "day3_feedback_sent_at" timestamp with time zone,
    "day7_feedback_sent_at" timestamp with time zone,
    "last_email_sent_at" timestamp with time zone,
    "next_action_at" timestamp with time zone,
    "automation_paused" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."beta_email_automation_state" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_email_automation_state" IS 'Per-participant beta lifecycle email state. No PII.';



CREATE TABLE IF NOT EXISTS "public"."beta_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "context" "text" NOT NULL,
    "score" integer,
    "category" "text",
    "message" "text",
    "app_version" "text",
    "resolved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_feedback_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['confusing'::"text", 'unrealistic'::"text", 'missing_feature'::"text", 'technical_problem'::"text", 'useful'::"text", 'other'::"text"])))),
    CONSTRAINT "beta_feedback_context_check" CHECK (("context" = ANY (ARRAY['onboarding'::"text", 'first_plan'::"text", 'meal_plan'::"text", 'workout_plan'::"text", 'daily_use'::"text", 'general'::"text"]))),
    CONSTRAINT "beta_feedback_message_length" CHECK ((("message" IS NULL) OR ("char_length"("message") <= 1000))),
    CONSTRAINT "beta_feedback_score_check" CHECK ((("score" IS NULL) OR (("score" >= 1) AND ("score" <= 5))))
);


ALTER TABLE "public"."beta_feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_feedback" IS 'In-app beta feedback. Message is private; not exposed to other users.';



CREATE TABLE IF NOT EXISTS "public"."beta_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "participant_id" "uuid",
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "evidence" "text",
    "affected_step" "text",
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "owner" "text",
    "resolution" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "beta_issues_category_check" CHECK (("category" = ANY (ARRAY['onboarding'::"text", 'plan_generation'::"text", 'meal_plan'::"text", 'workout_plan'::"text", 'daily_use'::"text", 'feedback'::"text", 'technical'::"text", 'trust'::"text", 'content'::"text", 'other'::"text"]))),
    CONSTRAINT "beta_issues_evidence_length" CHECK ((("evidence" IS NULL) OR ("char_length"("evidence") <= 1500))),
    CONSTRAINT "beta_issues_severity_check" CHECK (("severity" = ANY (ARRAY['blocker'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "beta_issues_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'investigating'::"text", 'planned'::"text", 'fixed'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."beta_issues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "internal_alias" "text",
    "invite_code_hash" "text",
    "status" "text" NOT NULL,
    "invited_at" timestamp with time zone,
    "registered_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone,
    "first_plan_viewed_at" timestamp with time zone,
    "first_action_at" timestamp with time zone,
    "first_return_at" timestamp with time zone,
    "session_completed_at" timestamp with time zone,
    "exited_at" timestamp with time zone,
    "exit_reason" "text",
    "source" "text",
    "beta_terms_accepted_at" timestamp with time zone,
    "beta_terms_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_participants_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'registered'::"text", 'onboarding'::"text", 'active'::"text", 'completed'::"text", 'dropped'::"text", 'excluded'::"text"])))
);


ALTER TABLE "public"."beta_participants" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_participants" IS 'Beta invite participants. Plain invite codes never stored.';



CREATE TABLE IF NOT EXISTS "public"."beta_research_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "mode" "text" DEFAULT 'remote'::"text" NOT NULL,
    "recording_consent" boolean DEFAULT false NOT NULL,
    "recording_reference" "text",
    "moderator_notes" "text",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_research_sessions_mode_check" CHECK (("mode" = ANY (ARRAY['remote'::"text", 'in_person'::"text", 'unmoderated'::"text"]))),
    CONSTRAINT "beta_research_sessions_notes_length" CHECK ((("moderator_notes" IS NULL) OR ("char_length"("moderator_notes") <= 5000))),
    CONSTRAINT "beta_research_sessions_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'confirmed'::"text", 'completed'::"text", 'no_show'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."beta_research_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."body_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weight_kg" numeric,
    "waist_cm" numeric,
    "hips_cm" numeric,
    "chest_cm" numeric,
    "arm_cm" numeric,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_record_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "body_measurements_arm_range" CHECK ((("arm_cm" IS NULL) OR (("arm_cm" > (20)::numeric) AND ("arm_cm" < (300)::numeric)))),
    CONSTRAINT "body_measurements_chest_range" CHECK ((("chest_cm" IS NULL) OR (("chest_cm" > (20)::numeric) AND ("chest_cm" < (300)::numeric)))),
    CONSTRAINT "body_measurements_has_value" CHECK ((("weight_kg" IS NOT NULL) OR ("waist_cm" IS NOT NULL) OR ("hips_cm" IS NOT NULL) OR ("chest_cm" IS NOT NULL) OR ("arm_cm" IS NOT NULL))),
    CONSTRAINT "body_measurements_hips_range" CHECK ((("hips_cm" IS NULL) OR (("hips_cm" > (20)::numeric) AND ("hips_cm" < (300)::numeric)))),
    CONSTRAINT "body_measurements_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'withings'::"text", 'integration'::"text"]))),
    CONSTRAINT "body_measurements_waist_range" CHECK ((("waist_cm" IS NULL) OR (("waist_cm" > (20)::numeric) AND ("waist_cm" < (300)::numeric)))),
    CONSTRAINT "body_measurements_weight_range" CHECK ((("weight_kg" IS NULL) OR (("weight_kg" > (20)::numeric) AND ("weight_kg" < (400)::numeric))))
);


ALTER TABLE "public"."body_measurements" OWNER TO "postgres";


COMMENT ON TABLE "public"."body_measurements" IS 'User body measurements with source tracking; no modeled values.';



CREATE TABLE IF NOT EXISTS "public"."body_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "height_cm" numeric(5,2) NOT NULL,
    "weight_kg" numeric(5,2) NOT NULL,
    "age" integer NOT NULL,
    "bmi" numeric(4,2),
    "tdee" integer,
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "email" "text",
    "name" "text",
    "gender" character varying(10),
    "stress_level" "text",
    "occupation" "text",
    "weekly_sessions" integer,
    "volume_modifier" numeric,
    "cardio_minutes" integer,
    "activity" "text",
    "goal" "text",
    "freq_choice" "text",
    "weekly_sessions_user" integer,
    "calories_target" integer,
    "plan" "text",
    "lead_source" "text",
    "program" "text",
    "diet_type" "text",
    "dietary_restrictions" "text",
    "foods_to_avoid" "text",
    "workout_days" "text",
    "birth_date" "date",
    CONSTRAINT "body_metrics_activity_check" CHECK ((("activity" IS NULL) OR ("activity" = ANY (ARRAY['sedavy'::"text", 'lehce'::"text", 'stredne'::"text", 'velmi'::"text", 'extra'::"text"])))),
    CONSTRAINT "body_metrics_goal_check" CHECK ((("goal" IS NULL) OR ("goal" = ANY (ARRAY['redukce'::"text", 'nabirani_svaly'::"text", 'udrzovani'::"text"])))),
    CONSTRAINT "body_metrics_occupation_check" CHECK ((("occupation" IS NULL) OR ("occupation" = ANY (ARRAY['office_it'::"text", 'manual'::"text", 'teacher_sales'::"text"]))))
);


ALTER TABLE "public"."body_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."body_metrics" IS 'Metriky uživatelů (váha, výška, aktivita, cíl, strava) – z registrace a profilu.';



COMMENT ON COLUMN "public"."body_metrics"."occupation" IS 'Canonical: office_it | manual | teacher_sales. Sedavé | Aktivní | Kombinované.';



COMMENT ON COLUMN "public"."body_metrics"."foods_to_avoid" IS 'Konkrétní potraviny k vynechání z jídelníčku (např. avokádo, brokolice, banány) – oddělené čárkou';



CREATE TABLE IF NOT EXISTS "public"."community_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."community_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."community_categories" IS 'Kategorie fóra (Trénink, Jídlo, Motivace, Obecné).';



CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_id" "uuid"
);


ALTER TABLE "public"."community_posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."community_posts" IS 'Příspěvky v sekci Komunita – zkušenosti, recenze (přístup jen pro přihlášené).';



CREATE TABLE IF NOT EXISTS "public"."community_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_replies" OWNER TO "postgres";


COMMENT ON TABLE "public"."community_replies" IS 'Odpovědi v rámci témat (vláken).';



CREATE TABLE IF NOT EXISTS "public"."daily_activity_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "plan_day" integer NOT NULL,
    "activity_type" "text" NOT NULL,
    "activity_key" "text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_activity_completions_type_check" CHECK (("activity_type" = ANY (ARRAY['meal'::"text", 'workout'::"text", 'habit'::"text"])))
);


ALTER TABLE "public"."daily_activity_completions" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_activity_completions" IS 'Idempotent daily meal/workout completion from plan UI.';



CREATE TABLE IF NOT EXISTS "public"."daily_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "checkin_date" "date" NOT NULL,
    "rating" "text" NOT NULL,
    "blocker" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_checkins_blocker_check" CHECK ((("blocker" IS NULL) OR ("blocker" = ANY (ARRAY['no_time'::"text", 'food_mismatch'::"text", 'workout_too_hard'::"text", 'workout_too_easy'::"text", 'no_motivation'::"text", 'technical_problem'::"text", 'other'::"text"])))),
    CONSTRAINT "daily_checkins_rating_check" CHECK (("rating" = ANY (ARRAY['great'::"text", 'good'::"text", 'partial'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."daily_checkins" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_checkins" IS 'One check-in per user per calendar day (Europe/Prague).';



CREATE TABLE IF NOT EXISTS "public"."exercise_asset_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canonical_key" "text" NOT NULL,
    "display_name_cs" "text",
    "exercisedb_name" "text",
    "gif_url" "text",
    "image_url" "text",
    "body_part" "text",
    "target" "text",
    "equipment" "text",
    "source" "text" DEFAULT 'none'::"text",
    "trust_level" "text" DEFAULT 'exact'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "wger_exercise_id" integer,
    "wger_name_en" "text",
    "wger_category" "text",
    "wger_exercise_image_url" "text"
);


ALTER TABLE "public"."exercise_asset_registry" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exercise_asset_registry"."wger_exercise_id" IS 'ID cviku ve wger';



COMMENT ON COLUMN "public"."exercise_asset_registry"."wger_name_en" IS 'Anglický název cviku';



CREATE TABLE IF NOT EXISTS "public"."exercise_metadata_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_name" "text" NOT NULL,
    "image_url" "text",
    "gif_url" "text",
    "body_part" "text",
    "target" "text",
    "equipment" "text",
    "source" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_metadata_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fitness_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "primary_goal" character varying(50) NOT NULL,
    "target_weight_kg" numeric(5,2),
    "target_body_fat_percentage" numeric(4,2),
    "target_muscle_mass_kg" numeric(5,2),
    "target_date" "date",
    "weekly_goal_kg" numeric(3,2),
    "activity_level" character varying(20),
    "workouts_per_week" integer DEFAULT 3,
    "preferred_workout_duration" integer DEFAULT 45,
    "dietary_restrictions" "text"[],
    "allergies" "text"[],
    "created_at" timestamp without time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."fitness_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."habit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "log_date" "date" NOT NULL,
    "habit_id" "text" NOT NULL,
    "completed" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."habit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lifecycle_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trigger_key" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "error_code" "text",
    "provider_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lifecycle_emails_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."lifecycle_emails" OWNER TO "postgres";


COMMENT ON TABLE "public"."lifecycle_emails" IS 'Fronta lifecycle e-mailů (aktivace + trial). Adresát se neukládá — bere se z auth.users při odeslání.';



CREATE TABLE IF NOT EXISTS "public"."meal_metadata_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_name" "text" NOT NULL,
    "image_url" "text",
    "calories" numeric,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "source" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "name_key" "text",
    "name" "text",
    "image_trust_level" "text" DEFAULT 'none'::"text",
    "exact_source" "text",
    "illustrative_source" "text",
    "confidence_score" numeric(5,4) DEFAULT 0,
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "fiber_g" numeric,
    "sugar_g" numeric,
    "saturated_fat_g" numeric,
    "sodium_mg" numeric,
    "cholesterol_mg" numeric,
    "vitamin_c_mg" numeric,
    "vitamin_d_ug" numeric,
    "vitamin_b12_ug" numeric,
    "calcium_mg" numeric,
    "iron_mg" numeric,
    "potassium_mg" numeric,
    "magnesium_mg" numeric,
    "zinc_mg" numeric,
    "health_score" numeric,
    "ready_in_minutes" integer,
    "servings" integer,
    "price_per_serving" numeric,
    "diets" "jsonb" DEFAULT '[]'::"jsonb",
    "dish_types" "jsonb" DEFAULT '[]'::"jsonb",
    "ingredients" "jsonb" DEFAULT '[]'::"jsonb",
    "spoonacular_id" integer,
    "nutrition_json" "jsonb"
);


ALTER TABLE "public"."meal_metadata_cache" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meal_metadata_cache"."health_score" IS 'Spoonacular health score 0-100';



COMMENT ON COLUMN "public"."meal_metadata_cache"."diets" IS 'Array of diet labels: vegetarian, vegan, gluten free, etc.';



COMMENT ON COLUMN "public"."meal_metadata_cache"."ingredients" IS 'Array of {id, name, amount, unit, aisle} pro nákupní seznam';



COMMENT ON COLUMN "public"."meal_metadata_cache"."nutrition_json" IS 'Plný nutriční profil a ingredience z Spoonacular (JSON), volitelné.';



CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier" "text" DEFAULT 'START'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    CONSTRAINT "memberships_status_check" CHECK (("status" = ANY (ARRAY['trial'::"text", 'pending_payment'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"]))),
    CONSTRAINT "memberships_tier_check" CHECK (("tier" = ANY (ARRAY['START'::"text", 'ON_CLUB'::"text", 'VIP'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


COMMENT ON CONSTRAINT "memberships_status_check" ON "public"."memberships" IS 'Canonical membership lifecycle: trial, pending_payment, active, past_due, canceled, expired.';



CREATE TABLE IF NOT EXISTS "public"."nutrition_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "meal_type" character varying(20),
    "food_item" character varying NOT NULL,
    "quantity" numeric(6,2),
    "unit" character varying(20),
    "calories" numeric(6,2),
    "protein_g" numeric(5,2),
    "carbs_g" numeric(5,2),
    "fat_g" numeric(5,2),
    "fiber_g" numeric(4,2),
    "sugar_g" numeric(5,2),
    "sodium_mg" numeric(6,2),
    "czech_food_id" character varying,
    "meal_date" "date" DEFAULT CURRENT_DATE,
    "logged_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutrition_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."openai_daily_usage" (
    "usage_date" "date" NOT NULL,
    "spent_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "input_tokens" bigint DEFAULT 0 NOT NULL,
    "output_tokens" bigint DEFAULT 0 NOT NULL,
    "requests_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."openai_daily_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."openai_response_cache" (
    "cache_key" "text" NOT NULL,
    "raw_content" "text" NOT NULL,
    "expires_at" timestamp without time zone NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."openai_response_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "anonymous_id" "text",
    "session_id" "text",
    "event_name" "text" NOT NULL,
    "event_version" integer DEFAULT 1 NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "page_path" "text",
    "source" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_events_event_name_check" CHECK (("event_name" = ANY (ARRAY['onboarding_started'::"text", 'onboarding_completed'::"text", 'plan_generation_started'::"text", 'plan_generation_completed'::"text", 'plan_generation_failed'::"text", 'plan_viewed'::"text", 'daily_plan_viewed'::"text", 'meal_completed'::"text", 'workout_completed'::"text", 'habit_completed'::"text", 'meal_replaced'::"text", 'daily_checkin_completed'::"text", 'feedback_submitted'::"text", 'paywall_viewed'::"text", 'checkout_started'::"text", 'subscription_activated'::"text"])))
);


ALTER TABLE "public"."product_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_events" IS 'Low-risk product funnel events. No PII in properties.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "daily_email" boolean DEFAULT true NOT NULL,
    "avatar_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Profil uživatele – avatar a další údaje zobrazené v celém systému.';



COMMENT ON COLUMN "public"."profiles"."daily_email" IS 'true = posílat denní digest e-mailem, false = neposílat';



COMMENT ON COLUMN "public"."profiles"."avatar_url" IS 'URL avataru uživatele (Supabase Storage nebo externí)';



CREATE TABLE IF NOT EXISTS "public"."progress_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "weight_kg" numeric(5,2),
    "body_fat_percentage" numeric(4,2),
    "muscle_mass_kg" numeric(5,2),
    "bmi" numeric(4,2),
    "front_photo_url" "text",
    "side_photo_url" "text",
    "back_photo_url" "text",
    "energy_level" integer,
    "mood" integer,
    "sleep_quality" integer,
    "motivation" integer,
    "strength_score" integer,
    "endurance_score" integer,
    "flexibility_score" integer,
    "ai_analysis" "text",
    "recommendations" "text",
    "date_recorded" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "progress_tracking_energy_level_check" CHECK ((("energy_level" >= 1) AND ("energy_level" <= 10))),
    CONSTRAINT "progress_tracking_mood_check" CHECK ((("mood" >= 1) AND ("mood" <= 10))),
    CONSTRAINT "progress_tracking_motivation_check" CHECK ((("motivation" >= 1) AND ("motivation" <= 10))),
    CONSTRAINT "progress_tracking_sleep_quality_check" CHECK ((("sleep_quality" >= 1) AND ("sleep_quality" <= 10)))
);


ALTER TABLE "public"."progress_tracking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes_catalog" (
    "id" bigint NOT NULL,
    "source" "text" DEFAULT 'spoonacular'::"text" NOT NULL,
    "source_id" "text",
    "name_cs" "text" NOT NULL,
    "name_en" "text",
    "meal_type" "text" NOT NULL,
    "kcal" integer NOT NULL,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "diet_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "servings" integer DEFAULT 1,
    "ingredients" "jsonb",
    "instructions" "jsonb",
    "spoonacular_url" "text",
    "image_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "instructions_cs" "jsonb"
);


ALTER TABLE "public"."recipes_catalog" OWNER TO "postgres";


COMMENT ON TABLE "public"."recipes_catalog" IS 'Lokální katalog receptů pro generování plánu bez runtime Spoonacular API.';



COMMENT ON COLUMN "public"."recipes_catalog"."instructions_cs" IS 'České kroky postupu (jsonb pole stringů). Runtime render: instructions_cs ?? instructions.';



ALTER TABLE "public"."recipes_catalog" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."recipes_catalog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."registrations" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "gender" "text",
    "age" "text",
    "height" "text",
    "weight" "text",
    "activity" "text",
    "stress" "text",
    "worktype" "text",
    "goal" "text",
    "frequency" "text",
    "notes" "text",
    "program" "text"
);


ALTER TABLE "public"."registrations" OWNER TO "postgres";


ALTER TABLE "public"."registrations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."registrations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "handler_result" "text",
    "error_message" "text",
    "processing_started_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_events" IS 'Processed Stripe webhook event ids for idempotent handling.';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plan_name" character varying(20),
    "price_czk" integer,
    "billing_cycle" character varying(10),
    "stripe_subscription_id" character varying,
    "stripe_customer_id" character varying,
    "status" character varying(20),
    "current_period_start" timestamp without time zone,
    "current_period_end" timestamp without time zone,
    "cancel_at_period_end" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainer_alert_state" (
    "key" "text" NOT NULL,
    "value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trainer_alert_state" OWNER TO "postgres";


COMMENT ON TABLE "public"."trainer_alert_state" IS 'Stav alertů pro trenéra – např. last_alert_sent_at pro rate limiting';



CREATE TABLE IF NOT EXISTS "public"."trainer_calendar_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "access_token" "text",
    "refresh_token" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "calendar_id" "text" DEFAULT 'primary'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trainer_calendar_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."trainer_calendar_tokens" IS 'OAuth tokeny pro Google Kalendář trenéra (info@). Pouze jeden záznam.';



CREATE TABLE IF NOT EXISTS "public"."user_ai_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "agent_slug" "text" NOT NULL,
    "memory_type" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "source_agent_slug" "text"
);


ALTER TABLE "public"."user_ai_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight" numeric,
    "stress_level" "text",
    "adherence_score" numeric,
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_habits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "habit_id" "text" NOT NULL,
    "is_positive" boolean NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_habits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_meal_pins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "meal_type" "text" NOT NULL,
    "meal_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_meal_pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" character varying NOT NULL,
    "password_hash" character varying,
    "name" character varying NOT NULL,
    "surname" character varying,
    "phone" character varying,
    "date_of_birth" "date",
    "gender" character varying(10),
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "subscription_plan" character varying DEFAULT 'free'::character varying,
    "subscription_expires_at" timestamp without time zone,
    CONSTRAINT "users_gender_check" CHECK ((("gender")::"text" = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'other'::character varying])::"text"[])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_membership_funnel" WITH ("security_invoker"='true') AS
 SELECT "tier",
    "status",
    "count"(*) AS "count",
    "min"("started_at") AS "first_started",
    "max"("started_at") AS "last_started"
   FROM "public"."memberships"
  GROUP BY "tier", "status"
  ORDER BY
        CASE "tier"
            WHEN 'VIP'::"text" THEN 1
            WHEN 'ON_CLUB'::"text" THEN 2
            WHEN 'START'::"text" THEN 3
            ELSE NULL::integer
        END,
        CASE "status"
            WHEN 'active'::"text" THEN 1
            WHEN 'trial'::"text" THEN 2
            WHEN 'cancelled'::"text" THEN 3
            WHEN 'expired'::"text" THEN 4
            ELSE NULL::integer
        END;


ALTER VIEW "public"."v_membership_funnel" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_plan_quality_dashboard" WITH ("security_invoker"='true') AS
 SELECT "date"("created_at") AS "plan_date",
    "count"(*) AS "plans_generated",
    "avg"(((("structured_plan_json" -> '_diagnostics'::"text") ->> 'meals_resolved'::"text"))::numeric) AS "avg_meals_resolved",
    "avg"(((("structured_plan_json" -> '_diagnostics'::"text") ->> 'exercises_resolved'::"text"))::numeric) AS "avg_ex_resolved",
    "avg"(((("structured_plan_json" -> '_diagnostics'::"text") ->> 'spoonacular_requests_total'::"text"))::numeric) AS "avg_spoon_req",
    "count"(
        CASE
            WHEN (((("structured_plan_json" -> '_diagnostics'::"text") ->> 'meals_resolved'::"text"))::integer >= 15) THEN 1
            ELSE NULL::integer
        END) AS "plans_high_quality",
    "count"(
        CASE
            WHEN (((((("structured_plan_json" -> 'days'::"text") -> 0) -> 'meals'::"text") -> 0) ->> 'display_name_cs'::"text") = 'Jídlo'::"text") THEN 1
            ELSE NULL::integer
        END) AS "plans_with_jidlo_bug",
    "sum"(((("structured_plan_json" -> '_diagnostics'::"text") ->> 'spoonacular_requests_total'::"text"))::numeric) AS "total_spoon_requests"
   FROM "public"."ai_generated_plans"
  WHERE ("structured_plan_json" IS NOT NULL)
  GROUP BY ("date"("created_at"))
  ORDER BY ("date"("created_at")) DESC;


ALTER VIEW "public"."v_plan_quality_dashboard" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_user_plan_status" WITH ("security_invoker"='true') AS
 SELECT "bm"."user_id",
    "bm"."email",
    "p"."id" AS "plan_id",
    "p"."is_active",
    "p"."created_at" AS "plan_created_at",
    "p"."plan_type",
    "p"."daily_calories",
    "t"."id" AS "task_id",
    "t"."status" AS "task_status",
    "t"."attempts" AS "task_attempts",
    "t"."last_error" AS "task_error",
    "t"."created_at" AS "task_created_at",
        CASE
            WHEN (("p"."id" IS NOT NULL) AND ("p"."is_active" = true)) THEN 'ready'::"text"
            WHEN ("t"."status" = 'processing'::"text") THEN 'generating'::"text"
            WHEN ("t"."status" = 'pending'::"text") THEN 'pending'::"text"
            WHEN ("t"."status" = 'failed'::"text") THEN 'failed'::"text"
            WHEN (("t"."status" = 'dead_letter'::"text") OR ("t"."status" = 'dlq'::"text")) THEN 'failed'::"text"
            ELSE 'unknown'::"text"
        END AS "plan_status"
   FROM (("public"."body_metrics" "bm"
     LEFT JOIN LATERAL ( SELECT "ai_generated_plans"."id",
            "ai_generated_plans"."is_active",
            "ai_generated_plans"."created_at",
            "ai_generated_plans"."plan_type",
            "ai_generated_plans"."daily_calories"
           FROM "public"."ai_generated_plans"
          WHERE (("ai_generated_plans"."user_id" = "bm"."user_id") AND ("ai_generated_plans"."is_active" = true))
          ORDER BY "ai_generated_plans"."created_at" DESC
         LIMIT 1) "p" ON (true))
     LEFT JOIN LATERAL ( SELECT "ai_tasks"."id",
            "ai_tasks"."status",
            "ai_tasks"."attempts",
            "ai_tasks"."last_error",
            "ai_tasks"."created_at"
           FROM "public"."ai_tasks"
          WHERE (("ai_tasks"."user_id" = "bm"."user_id") AND ("ai_tasks"."task_type" = 'initial_plan'::"text"))
          ORDER BY "ai_tasks"."created_at" DESC
         LIMIT 1) "t" ON (true));


ALTER VIEW "public"."v_user_plan_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "device_preference" "text"
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withings_body_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "connection_id" "uuid",
    "withings_measure_group_id" "text",
    "measured_at" timestamp with time zone NOT NULL,
    "weight_kg" numeric,
    "fat_percent" numeric,
    "fat_mass_kg" numeric,
    "muscle_mass_kg" numeric,
    "bone_mass_kg" numeric,
    "hydration_kg" numeric,
    "hydration_percent" numeric,
    "bmi" numeric,
    "basal_metabolic_rate" numeric,
    "visceral_fat" numeric,
    "pulse" numeric,
    "source" "text" DEFAULT 'withings'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."withings_body_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withings_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "withings_userid" "text",
    "scope" "text",
    "token_type" "text" DEFAULT 'Bearer'::"text" NOT NULL,
    "access_token_ciphertext" "jsonb" NOT NULL,
    "refresh_token_ciphertext" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "refresh_token_expires_at" timestamp with time zone,
    "csrf_token" "text",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."withings_connections" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."withings_daily" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("user_id", ((("measured_at" AT TIME ZONE 'Europe/Prague'::"text"))::"date")) "user_id",
    (("measured_at" AT TIME ZONE 'Europe/Prague'::"text"))::"date" AS "local_date",
    "measured_at",
    "weight_kg",
    "fat_percent" AS "body_fat_pct",
    "fat_mass_kg",
    "muscle_mass_kg",
    "bone_mass_kg",
    "hydration_percent",
    "bmi",
    "basal_metabolic_rate" AS "bmr_kcal",
    "visceral_fat",
    "pulse"
   FROM "public"."withings_body_snapshots"
  ORDER BY "user_id", ((("measured_at" AT TIME ZONE 'Europe/Prague'::"text"))::"date"), "measured_at" DESC;


ALTER VIEW "public"."withings_daily" OWNER TO "postgres";


COMMENT ON VIEW "public"."withings_daily" IS 'SEKCE VAHA (Withings): telesne slozeni po dnech, posledni mereni dne. Oddelene od Apple Health.';



CREATE TABLE IF NOT EXISTS "public"."withings_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "withings_userid" "text",
    "withings_measure_group_id" "text" NOT NULL,
    "measure_type" integer NOT NULL,
    "measure_type_label" "text" NOT NULL,
    "unit" "text",
    "value" numeric NOT NULL,
    "measured_at" timestamp with time zone NOT NULL,
    "category" integer,
    "attrib" integer,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."withings_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withings_oauth_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_hash" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "return_to" "text" DEFAULT '/profil'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."withings_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_replacements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plan_day" "text" NOT NULL,
    "original_workout" "jsonb" NOT NULL,
    "replacement_workout" "jsonb" NOT NULL,
    "selected_muscle_groups" "text"[] NOT NULL,
    "location" "text",
    "duration_minutes" integer,
    "intensity" "text",
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "generation_attempt" integer DEFAULT 1 NOT NULL,
    "prompt_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "restored_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "training_location" "text",
    "equipment_level" "text",
    CONSTRAINT "workout_replacements_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'confirmed'::"text", 'restored'::"text", 'expired'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."workout_replacements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workout_replacements"."training_location" IS 'home | gym | outdoor';



COMMENT ON COLUMN "public"."workout_replacements"."equipment_level" IS 'bodyweight | basic | full_gym';



CREATE OR REPLACE VIEW "public"."workout_types_unmapped" WITH ("security_invoker"='true') AS
 SELECT "w"."workout_type",
    "count"(*) AS "pocet",
    "max"("w"."local_date") AS "naposledy"
   FROM ("public"."apple_health_workouts" "w"
     LEFT JOIN "public"."workout_type_map" "m" ON (("m"."raw_type" = "w"."workout_type")))
  WHERE (("m"."raw_type" IS NULL) AND ("w"."workout_type" IS NOT NULL))
  GROUP BY "w"."workout_type";


ALTER VIEW "public"."workout_types_unmapped" OWNER TO "postgres";


COMMENT ON VIEW "public"."workout_types_unmapped" IS 'Typy treninku, ktere dorazily ale nejsou v workout_type_map. Doplnit.';



CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plan_id" "uuid",
    "workout_name" character varying NOT NULL,
    "workout_type" character varying(30),
    "duration_minutes" integer,
    "calories_burned" integer,
    "exercises" "jsonb",
    "difficulty_rating" integer,
    "completion_percentage" integer DEFAULT 100,
    "user_notes" "text",
    "ai_feedback" "text",
    "form_analysis" "jsonb",
    "form_score" numeric(3,1),
    "workout_date" "date" DEFAULT CURRENT_DATE,
    "started_at" timestamp without time zone,
    "completed_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "duration_min" integer,
    "notes" "text",
    "perceived_difficulty" "text",
    CONSTRAINT "workouts_difficulty_rating_check" CHECK ((("difficulty_rating" >= 1) AND ("difficulty_rating" <= 10)))
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_agent_settings"
    ADD CONSTRAINT "ai_agent_settings_agent_slug_key_key" UNIQUE ("agent_slug", "key");



ALTER TABLE ONLY "public"."ai_agent_settings"
    ADD CONSTRAINT "ai_agent_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_tools"
    ADD CONSTRAINT "ai_agent_tools_agent_slug_tool_name_key" UNIQUE ("agent_slug", "tool_name");



ALTER TABLE ONLY "public"."ai_agent_tools"
    ADD CONSTRAINT "ai_agent_tools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agents_logs"
    ADD CONSTRAINT "ai_agents_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."ai_config"
    ADD CONSTRAINT "ai_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_content_drafts"
    ADD CONSTRAINT "ai_content_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_context_profiles"
    ADD CONSTRAINT "ai_context_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_context_profiles"
    ADD CONSTRAINT "ai_context_profiles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."ai_events"
    ADD CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_executor_bindings"
    ADD CONSTRAINT "ai_executor_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generated_plans"
    ADD CONSTRAINT "ai_generated_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_logs"
    ADD CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_supporting_documents"
    ADD CONSTRAINT "ai_supporting_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_task_types"
    ADD CONSTRAINT "ai_task_types_agent_slug_task_type_key" UNIQUE ("agent_slug", "task_type");



ALTER TABLE ONLY "public"."ai_task_types"
    ADD CONSTRAINT "ai_task_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_tasks"
    ADD CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_trigger_rules"
    ADD CONSTRAINT "ai_trigger_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apple_health_connections"
    ADD CONSTRAINT "apple_health_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apple_health_metric_defs"
    ADD CONSTRAINT "apple_health_metric_defs_pkey" PRIMARY KEY ("metric_name");



ALTER TABLE ONLY "public"."apple_health_metrics"
    ADD CONSTRAINT "apple_health_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apple_health_raw_payloads"
    ADD CONSTRAINT "apple_health_raw_payloads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apple_health_sleep"
    ADD CONSTRAINT "apple_health_sleep_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apple_health_workouts"
    ADD CONSTRAINT "apple_health_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_cohorts"
    ADD CONSTRAINT "beta_cohorts_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."beta_cohorts"
    ADD CONSTRAINT "beta_cohorts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_decisions"
    ADD CONSTRAINT "beta_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_email_automation_state"
    ADD CONSTRAINT "beta_email_automation_state_participant_unique" UNIQUE ("participant_id");



ALTER TABLE ONLY "public"."beta_email_automation_state"
    ADD CONSTRAINT "beta_email_automation_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_email_messages"
    ADD CONSTRAINT "beta_email_messages_participant_trigger_unique" UNIQUE ("participant_id", "trigger_key");



ALTER TABLE ONLY "public"."beta_email_messages"
    ADD CONSTRAINT "beta_email_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_issues"
    ADD CONSTRAINT "beta_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_participants"
    ADD CONSTRAINT "beta_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_research_sessions"
    ADD CONSTRAINT "beta_research_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_metrics"
    ADD CONSTRAINT "body_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_categories"
    ADD CONSTRAINT "community_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_categories"
    ADD CONSTRAINT "community_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_activity_completions"
    ADD CONSTRAINT "daily_activity_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_unique_per_day" UNIQUE ("user_id", "checkin_date");



ALTER TABLE ONLY "public"."exercise_asset_registry"
    ADD CONSTRAINT "exercise_asset_registry_canonical_key_key" UNIQUE ("canonical_key");



ALTER TABLE ONLY "public"."exercise_asset_registry"
    ADD CONSTRAINT "exercise_asset_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_metadata_cache"
    ADD CONSTRAINT "exercise_metadata_cache_exercise_name_key" UNIQUE ("exercise_name");



ALTER TABLE ONLY "public"."exercise_metadata_cache"
    ADD CONSTRAINT "exercise_metadata_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fitness_goals"
    ADD CONSTRAINT "fitness_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_user_id_log_date_habit_id_key" UNIQUE ("user_id", "log_date", "habit_id");



ALTER TABLE ONLY "public"."lifecycle_emails"
    ADD CONSTRAINT "lifecycle_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_metadata_cache"
    ADD CONSTRAINT "meal_metadata_cache_meal_name_key" UNIQUE ("meal_name");



ALTER TABLE ONLY "public"."meal_metadata_cache"
    ADD CONSTRAINT "meal_metadata_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."nutrition_logs"
    ADD CONSTRAINT "nutrition_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."openai_daily_usage"
    ADD CONSTRAINT "openai_daily_usage_pkey" PRIMARY KEY ("usage_date");



ALTER TABLE ONLY "public"."openai_response_cache"
    ADD CONSTRAINT "openai_response_cache_pkey" PRIMARY KEY ("cache_key");



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_tracking"
    ADD CONSTRAINT "progress_tracking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes_catalog"
    ADD CONSTRAINT "recipes_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes_catalog"
    ADD CONSTRAINT "recipes_catalog_source_source_id_key" UNIQUE ("source", "source_id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainer_alert_state"
    ADD CONSTRAINT "trainer_alert_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."trainer_calendar_tokens"
    ADD CONSTRAINT "trainer_calendar_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generated_plans"
    ADD CONSTRAINT "uq_ai_generated_plans_user_valid_from" UNIQUE ("user_id", "valid_from");



ALTER TABLE ONLY "public"."user_ai_memory"
    ADD CONSTRAINT "user_ai_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_checkins"
    ADD CONSTRAINT "user_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_habits"
    ADD CONSTRAINT "user_habits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_habits"
    ADD CONSTRAINT "user_habits_user_id_habit_id_key" UNIQUE ("user_id", "habit_id");



ALTER TABLE ONLY "public"."user_meal_pins"
    ADD CONSTRAINT "user_meal_pins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_meal_pins"
    ADD CONSTRAINT "user_meal_pins_user_id_meal_type_meal_text_key" UNIQUE ("user_id", "meal_type", "meal_text");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withings_body_snapshots"
    ADD CONSTRAINT "withings_body_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withings_body_snapshots"
    ADD CONSTRAINT "withings_body_snapshots_unique" UNIQUE ("user_id", "measured_at", "source");



ALTER TABLE ONLY "public"."withings_connections"
    ADD CONSTRAINT "withings_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withings_connections"
    ADD CONSTRAINT "withings_connections_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."withings_measurements"
    ADD CONSTRAINT "withings_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withings_measurements"
    ADD CONSTRAINT "withings_measurements_unique" UNIQUE ("user_id", "withings_measure_group_id", "measure_type");



ALTER TABLE ONLY "public"."withings_oauth_states"
    ADD CONSTRAINT "withings_oauth_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withings_oauth_states"
    ADD CONSTRAINT "withings_oauth_states_state_hash_key" UNIQUE ("state_hash");



ALTER TABLE ONLY "public"."workout_replacements"
    ADD CONSTRAINT "workout_replacements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_type_map"
    ADD CONSTRAINT "workout_type_map_pkey" PRIMARY KEY ("raw_type");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "apple_health_connections_key_hash_uidx" ON "public"."apple_health_connections" USING "btree" ("api_key_hash");



CREATE INDEX "apple_health_connections_user_idx" ON "public"."apple_health_connections" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "apple_health_metrics_date_idx" ON "public"."apple_health_metrics" USING "btree" ("user_id", "local_date" DESC);



CREATE INDEX "apple_health_metrics_lookup_idx" ON "public"."apple_health_metrics" USING "btree" ("user_id", "metric_name", "local_date" DESC);



CREATE UNIQUE INDEX "apple_health_metrics_uidx" ON "public"."apple_health_metrics" USING "btree" ("user_id", "metric_name", "measured_at");



COMMENT ON INDEX "public"."apple_health_metrics_uidx" IS 'Idempotence bez source - HAE generuje nestabilni nazvy zdroju. Re-export stejneho obdobi neduplikuje.';



CREATE INDEX "apple_health_raw_unprocessed_idx" ON "public"."apple_health_raw_payloads" USING "btree" ("received_at") WHERE ("processed_at" IS NULL);



CREATE INDEX "apple_health_raw_user_received_idx" ON "public"."apple_health_raw_payloads" USING "btree" ("user_id", "received_at" DESC);



CREATE INDEX "apple_health_sleep_date_idx" ON "public"."apple_health_sleep" USING "btree" ("user_id", "local_date" DESC);



CREATE UNIQUE INDEX "apple_health_sleep_uidx" ON "public"."apple_health_sleep" USING "btree" ("user_id", "sleep_start");



CREATE INDEX "apple_health_workouts_date_idx" ON "public"."apple_health_workouts" USING "btree" ("user_id", "local_date" DESC);



CREATE UNIQUE INDEX "apple_health_workouts_uidx" ON "public"."apple_health_workouts" USING "btree" ("user_id", "external_id");



CREATE UNIQUE INDEX "beta_participants_cohort_user_unique" ON "public"."beta_participants" USING "btree" ("cohort_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "beta_participants_invite_hash_unique" ON "public"."beta_participants" USING "btree" ("invite_code_hash") WHERE ("invite_code_hash" IS NOT NULL);



CREATE UNIQUE INDEX "daily_activity_completions_unique_coalesce" ON "public"."daily_activity_completions" USING "btree" ("user_id", COALESCE(("plan_id")::"text", ''::"text"), "plan_day", "activity_type", "activity_key");



CREATE INDEX "idx_ai_agent_versions_slug" ON "public"."ai_agent_versions" USING "btree" ("agent_slug", "version" DESC);



CREATE INDEX "idx_ai_agents_type" ON "public"."ai_agents_logs" USING "btree" ("agent_type", "action_type");



CREATE INDEX "idx_ai_agents_user_date" ON "public"."ai_agents_logs" USING "btree" ("user_id", "created_at");



CREATE INDEX "idx_ai_content_drafts_agent" ON "public"."ai_content_drafts" USING "btree" ("agent_slug", "status");



CREATE INDEX "idx_ai_content_drafts_created" ON "public"."ai_content_drafts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_events_attempts" ON "public"."ai_events" USING "btree" ("status", "attempts", "created_at");



CREATE INDEX "idx_ai_events_retry_due" ON "public"."ai_events" USING "btree" ("status", "next_retry_at", "created_at");



CREATE INDEX "idx_ai_events_status_created" ON "public"."ai_events" USING "btree" ("status", "created_at");



CREATE INDEX "idx_ai_events_type" ON "public"."ai_events" USING "btree" ("event_type");



CREATE INDEX "idx_ai_events_user" ON "public"."ai_events" USING "btree" ("user_id");



CREATE INDEX "idx_ai_executor_bindings_side_effect" ON "public"."ai_executor_bindings" USING "btree" ("side_effect_type");



CREATE INDEX "idx_ai_generated_plans_created" ON "public"."ai_generated_plans" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_generated_plans_user" ON "public"."ai_generated_plans" USING "btree" ("user_id");



CREATE INDEX "idx_ai_generated_plans_user_active" ON "public"."ai_generated_plans" USING "btree" ("user_id", "is_active", "created_at" DESC);



CREATE INDEX "idx_ai_generated_plans_user_active_v2" ON "public"."ai_generated_plans" USING "btree" ("user_id", "is_active", "valid_from" DESC);



CREATE INDEX "idx_ai_generated_plans_user_validfrom" ON "public"."ai_generated_plans" USING "btree" ("user_id", "valid_from");



CREATE INDEX "idx_ai_logs_agent" ON "public"."ai_logs" USING "btree" ("agent_slug");



CREATE INDEX "idx_ai_logs_created" ON "public"."ai_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_logs_event" ON "public"."ai_logs" USING "btree" ("event_id");



CREATE INDEX "idx_ai_logs_onboarding" ON "public"."ai_logs" USING "btree" ("agent_slug", "action", "created_at" DESC);



CREATE INDEX "idx_ai_logs_task" ON "public"."ai_logs" USING "btree" ("task_id");



CREATE INDEX "idx_ai_logs_user" ON "public"."ai_logs" USING "btree" ("user_id");



CREATE INDEX "idx_ai_messages_status" ON "public"."ai_messages" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_ai_messages_task" ON "public"."ai_messages" USING "btree" ("task_id");



CREATE INDEX "idx_ai_messages_user" ON "public"."ai_messages" USING "btree" ("user_id");



CREATE INDEX "idx_ai_messages_user_created" ON "public"."ai_messages" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_ai_plans_user_active" ON "public"."ai_generated_plans" USING "btree" ("user_id", "is_active");



CREATE INDEX "idx_ai_plans_validity" ON "public"."ai_generated_plans" USING "btree" ("valid_from", "valid_until");



CREATE INDEX "idx_ai_supporting_documents_agent" ON "public"."ai_supporting_documents" USING "btree" ("agent_slug") WHERE ("enabled" = true);



CREATE INDEX "idx_ai_supporting_documents_sort" ON "public"."ai_supporting_documents" USING "btree" ("agent_slug", "sort_order", "created_at");



CREATE INDEX "idx_ai_task_types_agent" ON "public"."ai_task_types" USING "btree" ("agent_slug");



CREATE INDEX "idx_ai_task_types_enabled" ON "public"."ai_task_types" USING "btree" ("agent_slug", "task_type") WHERE ("enabled" = true);



CREATE INDEX "idx_ai_tasks_agent" ON "public"."ai_tasks" USING "btree" ("agent_slug");



CREATE UNIQUE INDEX "idx_ai_tasks_idempotency" ON "public"."ai_tasks" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_ai_tasks_processing" ON "public"."ai_tasks" USING "btree" ("status", "created_at");



CREATE INDEX "idx_ai_tasks_processing_started" ON "public"."ai_tasks" USING "btree" ("processing_started_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "idx_ai_tasks_retry_due" ON "public"."ai_tasks" USING "btree" ("status", "next_retry_at", "created_at");



CREATE INDEX "idx_ai_tasks_status" ON "public"."ai_tasks" USING "btree" ("status");



CREATE INDEX "idx_ai_tasks_user" ON "public"."ai_tasks" USING "btree" ("user_id");



CREATE INDEX "idx_ai_tasks_user_status" ON "public"."ai_tasks" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "idx_ai_trigger_rules_priority" ON "public"."ai_trigger_rules" USING "btree" ("trigger_type", "priority");



CREATE INDEX "idx_ai_trigger_rules_trigger" ON "public"."ai_trigger_rules" USING "btree" ("trigger_type", "enabled");



CREATE INDEX "idx_beta_cohorts_status" ON "public"."beta_cohorts" USING "btree" ("status");



CREATE INDEX "idx_beta_decisions_cohort" ON "public"."beta_decisions" USING "btree" ("cohort_id");



CREATE INDEX "idx_beta_email_automation_state_user" ON "public"."beta_email_automation_state" USING "btree" ("user_id");



CREATE INDEX "idx_beta_email_messages_status_scheduled" ON "public"."beta_email_messages" USING "btree" ("status", "scheduled_at") WHERE ("status" = ANY (ARRAY['queued'::"text", 'processing'::"text"]));



CREATE INDEX "idx_beta_feedback_created_at" ON "public"."beta_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_beta_feedback_user_id" ON "public"."beta_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_beta_issues_cohort" ON "public"."beta_issues" USING "btree" ("cohort_id", "status");



CREATE INDEX "idx_beta_participants_cohort_id" ON "public"."beta_participants" USING "btree" ("cohort_id");



CREATE INDEX "idx_beta_participants_user_id" ON "public"."beta_participants" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_beta_research_sessions_participant" ON "public"."beta_research_sessions" USING "btree" ("participant_id");



CREATE INDEX "idx_body_measurements_user_measured" ON "public"."body_measurements" USING "btree" ("user_id", "measured_at" DESC);



CREATE INDEX "idx_body_metrics_created_at" ON "public"."body_metrics" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_body_metrics_email" ON "public"."body_metrics" USING "btree" ("email");



CREATE INDEX "idx_body_metrics_user" ON "public"."body_metrics" USING "btree" ("user_id");



CREATE INDEX "idx_body_metrics_user_id" ON "public"."body_metrics" USING "btree" ("user_id");



CREATE INDEX "idx_catalog_active" ON "public"."recipes_catalog" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "idx_catalog_diet" ON "public"."recipes_catalog" USING "gin" ("diet_tags");



CREATE INDEX "idx_catalog_type_kcal" ON "public"."recipes_catalog" USING "btree" ("meal_type", "kcal");



CREATE INDEX "idx_community_categories_sort" ON "public"."community_categories" USING "btree" ("sort_order");



CREATE INDEX "idx_community_posts_category_id" ON "public"."community_posts" USING "btree" ("category_id");



CREATE INDEX "idx_community_posts_created_at" ON "public"."community_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_community_posts_user_id" ON "public"."community_posts" USING "btree" ("user_id");



CREATE INDEX "idx_community_replies_created_at" ON "public"."community_replies" USING "btree" ("created_at");



CREATE INDEX "idx_community_replies_topic_id" ON "public"."community_replies" USING "btree" ("topic_id");



CREATE INDEX "idx_daily_activity_completions_user_day" ON "public"."daily_activity_completions" USING "btree" ("user_id", "plan_day");



CREATE INDEX "idx_daily_checkins_user_date" ON "public"."daily_checkins" USING "btree" ("user_id", "checkin_date" DESC);



CREATE INDEX "idx_exercise_asset_registry_key" ON "public"."exercise_asset_registry" USING "btree" ("canonical_key");



CREATE INDEX "idx_exercise_asset_registry_trust" ON "public"."exercise_asset_registry" USING "btree" ("trust_level");



CREATE INDEX "idx_exercise_cache_name" ON "public"."exercise_metadata_cache" USING "btree" ("exercise_name");



CREATE INDEX "idx_exercise_registry_canonical" ON "public"."exercise_asset_registry" USING "btree" ("canonical_key");



CREATE INDEX "idx_habit_logs_user_date" ON "public"."habit_logs" USING "btree" ("user_id", "log_date" DESC);



CREATE INDEX "idx_meal_cache_name" ON "public"."meal_metadata_cache" USING "btree" ("meal_name");



CREATE INDEX "idx_meal_cache_spoonacular_id" ON "public"."meal_metadata_cache" USING "btree" ("spoonacular_id") WHERE ("spoonacular_id" IS NOT NULL);



CREATE INDEX "idx_meal_metadata_cache_meal_name" ON "public"."meal_metadata_cache" USING "btree" ("meal_name");



CREATE UNIQUE INDEX "idx_meal_metadata_cache_name_key" ON "public"."meal_metadata_cache" USING "btree" ("name_key") WHERE ("name_key" IS NOT NULL);



CREATE INDEX "idx_meal_metadata_cache_trust" ON "public"."meal_metadata_cache" USING "btree" ("image_trust_level");



CREATE INDEX "idx_memberships_stripe_customer" ON "public"."memberships" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_memberships_stripe_subscription" ON "public"."memberships" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_nutrition_user_date" ON "public"."nutrition_logs" USING "btree" ("user_id", "meal_date");



CREATE INDEX "idx_openai_response_cache_expiry" ON "public"."openai_response_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_product_events_created_at" ON "public"."product_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_product_events_event_name_created_at" ON "public"."product_events" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "idx_product_events_user_id_created_at" ON "public"."product_events" USING "btree" ("user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_profiles_id" ON "public"."profiles" USING "btree" ("id");



CREATE INDEX "idx_progress_user_date" ON "public"."progress_tracking" USING "btree" ("user_id", "date_recorded");



CREATE INDEX "idx_stripe_events_processed_at" ON "public"."stripe_events" USING "btree" ("processed_at" DESC);



CREATE INDEX "idx_stripe_events_status" ON "public"."stripe_events" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_stripe" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscriptions_user" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_user_ai_memory_agent" ON "public"."user_ai_memory" USING "btree" ("agent_slug");



CREATE INDEX "idx_user_ai_memory_shared" ON "public"."user_ai_memory" USING "btree" ("user_id", "memory_type", "created_at" DESC);



CREATE INDEX "idx_user_ai_memory_user" ON "public"."user_ai_memory" USING "btree" ("user_id");



CREATE INDEX "idx_user_ai_memory_user_agent" ON "public"."user_ai_memory" USING "btree" ("user_id", "agent_slug", "created_at" DESC);



CREATE UNIQUE INDEX "idx_user_ai_memory_user_type_unique" ON "public"."user_ai_memory" USING "btree" ("user_id", "memory_type") WHERE ("memory_type" IS NOT NULL);



CREATE INDEX "idx_user_checkins_created" ON "public"."user_checkins" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_checkins_user" ON "public"."user_checkins" USING "btree" ("user_id");



CREATE INDEX "idx_user_habits_user" ON "public"."user_habits" USING "btree" ("user_id");



CREATE INDEX "idx_user_meal_pins_user" ON "public"."user_meal_pins" USING "btree" ("user_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_subscription" ON "public"."users" USING "btree" ("subscription_plan", "subscription_expires_at");



CREATE INDEX "idx_withings_body_snapshots_user_measured" ON "public"."withings_body_snapshots" USING "btree" ("user_id", "measured_at" DESC);



CREATE INDEX "idx_withings_connections_user" ON "public"."withings_connections" USING "btree" ("user_id");



CREATE INDEX "idx_withings_measurements_user_measured" ON "public"."withings_measurements" USING "btree" ("user_id", "measured_at" DESC);



CREATE INDEX "idx_withings_measurements_user_type_measured" ON "public"."withings_measurements" USING "btree" ("user_id", "measure_type", "measured_at" DESC);



CREATE INDEX "idx_withings_oauth_states_expiry" ON "public"."withings_oauth_states" USING "btree" ("expires_at") WHERE ("consumed_at" IS NULL);



CREATE INDEX "idx_withings_oauth_states_user_created" ON "public"."withings_oauth_states" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_workout_replacements_status" ON "public"."workout_replacements" USING "btree" ("status");



CREATE INDEX "idx_workout_replacements_user_plan_day" ON "public"."workout_replacements" USING "btree" ("user_id", "plan_id", "plan_day");



CREATE INDEX "idx_workouts_plan_id" ON "public"."workouts" USING "btree" ("plan_id");



CREATE INDEX "idx_workouts_user_date" ON "public"."workouts" USING "btree" ("user_id", "workout_date");



CREATE INDEX "lifecycle_emails_dispatch_idx" ON "public"."lifecycle_emails" USING "btree" ("status", "scheduled_at") WHERE ("status" = ANY (ARRAY['queued'::"text", 'processing'::"text"]));



CREATE UNIQUE INDEX "lifecycle_emails_user_trigger_uidx" ON "public"."lifecycle_emails" USING "btree" ("user_id", "trigger_key");



CREATE INDEX "memberships_user_id_idx" ON "public"."memberships" USING "btree" ("user_id");



CREATE UNIQUE INDEX "waitlist_email_source_key" ON "public"."waitlist" USING "btree" ("lower"(TRIM(BOTH FROM "email")), "source");



CREATE OR REPLACE TRIGGER "BodyMetrics to Make" AFTER INSERT ON "public"."body_metrics" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu2.make.com/xyn3owp6p3cck43r81ei7mmpiumb2cwy', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "block_auto_task_creation" BEFORE INSERT ON "public"."ai_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."block_ai_task_inserts"();



CREATE OR REPLACE TRIGGER "community_posts_updated_at" BEFORE UPDATE ON "public"."community_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "force_regenerate_deactivate_plan" BEFORE INSERT ON "public"."ai_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."handle_force_regenerate_task"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ahc_touch" BEFORE UPDATE ON "public"."apple_health_connections" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ahm_touch" BEFORE UPDATE ON "public"."apple_health_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ahs_touch" BEFORE UPDATE ON "public"."apple_health_sleep" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ahw_touch" BEFORE UPDATE ON "public"."apple_health_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bm_calcs" BEFORE INSERT OR UPDATE ON "public"."body_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."bm_fill_calculated_fields"();



CREATE OR REPLACE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_task_before_insert" BEFORE INSERT ON "public"."ai_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_task_without_metrics"();



CREATE OR REPLACE TRIGGER "trigger_calculate_bmi" BEFORE INSERT OR UPDATE ON "public"."body_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_bmi"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "users_insert" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu2.make.com/xyn3owp6p3cck43r81ei7mmpiumb2cwy', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



ALTER TABLE ONLY "public"."ai_agents_logs"
    ADD CONSTRAINT "ai_agents_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_tasks"
    ADD CONSTRAINT "ai_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_decisions"
    ADD CONSTRAINT "beta_decisions_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."beta_cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_email_automation_state"
    ADD CONSTRAINT "beta_email_automation_state_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."beta_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_email_automation_state"
    ADD CONSTRAINT "beta_email_automation_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_email_messages"
    ADD CONSTRAINT "beta_email_messages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."beta_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_email_messages"
    ADD CONSTRAINT "beta_email_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_issues"
    ADD CONSTRAINT "beta_issues_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."beta_cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_issues"
    ADD CONSTRAINT "beta_issues_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."beta_participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beta_participants"
    ADD CONSTRAINT "beta_participants_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."beta_cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_participants"
    ADD CONSTRAINT "beta_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beta_research_sessions"
    ADD CONSTRAINT "beta_research_sessions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."beta_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_metrics"
    ADD CONSTRAINT "body_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."community_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_activity_completions"
    ADD CONSTRAINT "daily_activity_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_goals"
    ADD CONSTRAINT "fitness_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lifecycle_emails"
    ADD CONSTRAINT "lifecycle_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_logs"
    ADD CONSTRAINT "nutrition_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_tracking"
    ADD CONSTRAINT "progress_tracking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habits"
    ADD CONSTRAINT "user_habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_meal_pins"
    ADD CONSTRAINT "user_meal_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withings_body_snapshots"
    ADD CONSTRAINT "withings_body_snapshots_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."withings_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withings_body_snapshots"
    ADD CONSTRAINT "withings_body_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withings_connections"
    ADD CONSTRAINT "withings_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withings_measurements"
    ADD CONSTRAINT "withings_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withings_oauth_states"
    ADD CONSTRAINT "withings_oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_replacements"
    ADD CONSTRAINT "workout_replacements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."ai_generated_plans"("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "AI plans policy" ON "public"."ai_generated_plans" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Fitness goals policy" ON "public"."fitness_goals" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Nutrition policy" ON "public"."nutrition_logs" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Progress policy" ON "public"."progress_tracking" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Subscriptions policy" ON "public"."subscriptions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can CRUD own habit_logs" ON "public"."habit_logs" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can CRUD own user_habits" ON "public"."user_habits" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own meal pins" ON "public"."user_meal_pins" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own data" ON "public"."users" USING (("auth"."uid"() = "id"));



CREATE POLICY "Workouts policy" ON "public"."workouts" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."_backup_2026_06_02_ai_agents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_body_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_exercise_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_meal_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_user_habits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_backup_2026_06_02_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ahc_select_own" ON "public"."apple_health_connections" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "ahm_select_own" ON "public"."apple_health_metrics" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "ahmd_read_all" ON "public"."apple_health_metric_defs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ahs_select_own" ON "public"."apple_health_sleep" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "ahw_select_own" ON "public"."apple_health_workouts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."ai_agent_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_tools" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agents_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_content_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_context_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_executor_bindings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_generated_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_supporting_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_task_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_trigger_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_health_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_health_metric_defs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_health_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_health_raw_payloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_health_sleep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_health_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_cohorts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_email_automation_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_email_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "beta_feedback_insert_own" ON "public"."beta_feedback" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."beta_issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_research_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."body_measurements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "body_measurements_delete_own" ON "public"."body_measurements" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("source" = 'manual'::"text")));



CREATE POLICY "body_measurements_insert_own" ON "public"."body_measurements" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "body_measurements_select_own" ON "public"."body_measurements" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "body_measurements_update_own" ON "public"."body_measurements" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."body_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "body_metrics_delete_own" ON "public"."body_metrics" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "body_metrics_insert_own" ON "public"."body_metrics" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "body_metrics_select_own" ON "public"."body_metrics" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "body_metrics_update_own" ON "public"."body_metrics" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."community_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_posts_delete_own" ON "public"."community_posts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_posts_insert_authenticated" ON "public"."community_posts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "community_posts_select_authenticated" ON "public"."community_posts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "community_posts_update_own" ON "public"."community_posts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."community_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_replies_delete_own" ON "public"."community_replies" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_replies_insert_authenticated" ON "public"."community_replies" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "community_replies_select_authenticated" ON "public"."community_replies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "community_replies_update_own" ON "public"."community_replies" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."daily_activity_completions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_activity_completions_delete_own" ON "public"."daily_activity_completions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "daily_activity_completions_insert_own" ON "public"."daily_activity_completions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "daily_activity_completions_select_own" ON "public"."daily_activity_completions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."daily_checkins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_checkins_insert_own" ON "public"."daily_checkins" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "daily_checkins_select_own" ON "public"."daily_checkins" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "daily_checkins_update_own" ON "public"."daily_checkins" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."exercise_asset_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_metadata_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."habit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lifecycle_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_metadata_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_select_own" ON "public"."memberships" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."nutrition_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."openai_daily_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."openai_response_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_events_insert_own" ON "public"."product_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."progress_tracking" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_catalog_public_read" ON "public"."recipes_catalog" FOR SELECT TO "authenticated", "anon" USING ((COALESCE("active", true) = true));



ALTER TABLE "public"."registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainer_alert_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainer_calendar_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_ai_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_habits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_meal_pins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_self_select" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users_self_update" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."withings_body_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "withings_body_snapshots_select_own" ON "public"."withings_body_snapshots" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "withings_body_snapshots_service_role_all" ON "public"."withings_body_snapshots" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."withings_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "withings_connections_service_role_all" ON "public"."withings_connections" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."withings_measurements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "withings_measurements_service_role_all" ON "public"."withings_measurements" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."withings_oauth_states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "withings_oauth_states_service_role_all" ON "public"."withings_oauth_states" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."workout_replacements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_replacements_select_own" ON "public"."workout_replacements" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workout_type_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wtm_read" ON "public"."workout_type_map" FOR SELECT TO "authenticated" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."block_ai_task_inserts"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_ai_task_inserts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_ai_task_inserts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bm_fill_calculated_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."bm_fill_calculated_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bm_fill_calculated_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_bmi"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_bmi"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_bmi"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_tdee"("weight_kg" numeric, "height_cm" numeric, "age" integer, "gender" character varying, "activity_level" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_tdee"("weight_kg" numeric, "height_cm" numeric, "age" integer, "gender" character varying, "activity_level" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_tdee"("weight_kg" numeric, "height_cm" numeric, "age" integer, "gender" character varying, "activity_level" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_beta_participant_emails"("p_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_beta_participant_emails"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_beta_participant_emails"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_beta_participant_emails"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."beta_email_messages" TO "anon";
GRANT ALL ON TABLE "public"."beta_email_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_email_messages" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_beta_email_batch"("p_limit" integer, "p_stale_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_beta_email_batch"("p_limit" integer, "p_stale_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_beta_email_batch"("p_limit" integer, "p_stale_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_beta_email_batch"("p_limit" integer, "p_stale_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_beta_invite"("p_invite_hash" "text", "p_user_id" "uuid", "p_beta_terms_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_beta_invite"("p_invite_hash" "text", "p_user_id" "uuid", "p_beta_terms_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_beta_invite"("p_invite_hash" "text", "p_user_id" "uuid", "p_beta_terms_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_beta_invite"("p_invite_hash" "text", "p_user_id" "uuid", "p_beta_terms_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_data"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_data"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_beta_participant_for_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_beta_participant_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_beta_participant_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_beta_participant_for_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_force_regenerate_task"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_force_regenerate_task"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer, "p_properties" "jsonb", "p_page_path" "text", "p_source" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer, "p_properties" "jsonb", "p_page_path" "text", "p_source" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer, "p_properties" "jsonb", "p_page_path" "text", "p_source" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_product_event_server"("p_user_id" "uuid", "p_event_name" "text", "p_event_version" integer, "p_properties" "jsonb", "p_page_path" "text", "p_source" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_beta_cohort"("p_user_id" "uuid", "p_cohort_code" "text", "p_beta_terms_version" "text", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_beta_cohort"("p_user_id" "uuid", "p_cohort_code" "text", "p_beta_terms_version" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_beta_cohort"("p_user_id" "uuid", "p_cohort_code" "text", "p_beta_terms_version" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_beta_cohort"("p_user_id" "uuid", "p_cohort_code" "text", "p_beta_terms_version" "text", "p_source" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_beta_email_participants"("p_cohort_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_beta_email_participants"("p_cohort_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."list_beta_email_participants"("p_cohort_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_beta_email_participants"("p_cohort_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_beta_email_failed"("p_message_id" "uuid", "p_error_code" "text", "p_retry_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_beta_email_failed"("p_message_id" "uuid", "p_error_code" "text", "p_retry_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_beta_email_failed"("p_message_id" "uuid", "p_error_code" "text", "p_retry_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_beta_email_failed"("p_message_id" "uuid", "p_error_code" "text", "p_retry_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_beta_email_sent"("p_message_id" "uuid", "p_provider_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_beta_email_sent"("p_message_id" "uuid", "p_provider_message_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_beta_email_sent"("p_message_id" "uuid", "p_provider_message_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_beta_email_sent"("p_message_id" "uuid", "p_provider_message_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_beta_email_skipped"("p_message_id" "uuid", "p_error_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_beta_email_skipped"("p_message_id" "uuid", "p_error_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_beta_email_skipped"("p_message_id" "uuid", "p_error_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_beta_email_skipped"("p_message_id" "uuid", "p_error_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."patch_beta_participant_milestone"("p_user_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patch_beta_participant_milestone"("p_user_id" "uuid", "p_patch" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."patch_beta_participant_milestone"("p_user_id" "uuid", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."patch_beta_participant_milestone"("p_user_id" "uuid", "p_patch" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_task_without_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_task_without_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_task_without_metrics"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_beta_email_message"("p_participant_id" "uuid", "p_user_id" "uuid", "p_trigger_key" "text", "p_scheduled_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_beta_email_message"("p_participant_id" "uuid", "p_user_id" "uuid", "p_trigger_key" "text", "p_scheduled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."queue_beta_email_message"("p_participant_id" "uuid", "p_user_id" "uuid", "p_trigger_key" "text", "p_scheduled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_beta_email_message"("p_participant_id" "uuid", "p_user_id" "uuid", "p_trigger_key" "text", "p_scheduled_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_beta_invite"("p_invite_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_beta_invite"("p_invite_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_beta_invite"("p_invite_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_beta_invite"("p_invite_hash" "text") TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_ai_agents" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_body_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_exercise_cache" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_meal_cache" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_plans" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_user_habits" TO "service_role";



GRANT ALL ON TABLE "public"."_backup_2026_06_02_users" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_settings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_tools" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_tools" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_tools" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_versions" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_versions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agents" TO "anon";
GRANT ALL ON TABLE "public"."ai_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agents" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agents_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_agents_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agents_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_config" TO "anon";
GRANT ALL ON TABLE "public"."ai_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_config" TO "service_role";



GRANT ALL ON TABLE "public"."ai_content_drafts" TO "anon";
GRANT ALL ON TABLE "public"."ai_content_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_content_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."ai_context_profiles" TO "anon";
GRANT ALL ON TABLE "public"."ai_context_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_context_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ai_events" TO "anon";
GRANT ALL ON TABLE "public"."ai_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_events" TO "service_role";



GRANT ALL ON TABLE "public"."ai_executor_bindings" TO "anon";
GRANT ALL ON TABLE "public"."ai_executor_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_executor_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generated_plans" TO "anon";
GRANT ALL ON TABLE "public"."ai_generated_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generated_plans" TO "service_role";



GRANT ALL ON TABLE "public"."ai_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_messages" TO "anon";
GRANT ALL ON TABLE "public"."ai_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ai_supporting_documents" TO "anon";
GRANT ALL ON TABLE "public"."ai_supporting_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_supporting_documents" TO "service_role";



GRANT ALL ON TABLE "public"."ai_task_types" TO "anon";
GRANT ALL ON TABLE "public"."ai_task_types" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_task_types" TO "service_role";



GRANT ALL ON TABLE "public"."ai_tasks" TO "anon";
GRANT ALL ON TABLE "public"."ai_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."ai_trigger_rules" TO "anon";
GRANT ALL ON TABLE "public"."ai_trigger_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_trigger_rules" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_connections" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_connections" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_metric_defs" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_metric_defs" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_metric_defs" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_metrics" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_metrics_daily" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_metrics_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_metrics_daily" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_sleep" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_sleep" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_sleep" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_workouts" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."workout_type_map" TO "anon";
GRANT ALL ON TABLE "public"."workout_type_map" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_type_map" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_daily" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_daily" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_raw_payloads" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_raw_payloads" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_raw_payloads" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_recovery" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_recovery" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_recovery" TO "service_role";



GRANT ALL ON TABLE "public"."apple_health_unknown_metrics" TO "anon";
GRANT ALL ON TABLE "public"."apple_health_unknown_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_health_unknown_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."beta_cohorts" TO "anon";
GRANT ALL ON TABLE "public"."beta_cohorts" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_cohorts" TO "service_role";



GRANT ALL ON TABLE "public"."beta_decisions" TO "anon";
GRANT ALL ON TABLE "public"."beta_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."beta_email_automation_state" TO "anon";
GRANT ALL ON TABLE "public"."beta_email_automation_state" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_email_automation_state" TO "service_role";



GRANT ALL ON TABLE "public"."beta_feedback" TO "anon";
GRANT ALL ON TABLE "public"."beta_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."beta_issues" TO "anon";
GRANT ALL ON TABLE "public"."beta_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_issues" TO "service_role";



GRANT ALL ON TABLE "public"."beta_participants" TO "anon";
GRANT ALL ON TABLE "public"."beta_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_participants" TO "service_role";



GRANT ALL ON TABLE "public"."beta_research_sessions" TO "anon";
GRANT ALL ON TABLE "public"."beta_research_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_research_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."body_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."body_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."body_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."body_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."community_categories" TO "anon";
GRANT ALL ON TABLE "public"."community_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."community_categories" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON TABLE "public"."community_replies" TO "anon";
GRANT ALL ON TABLE "public"."community_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."community_replies" TO "service_role";



GRANT ALL ON TABLE "public"."daily_activity_completions" TO "anon";
GRANT ALL ON TABLE "public"."daily_activity_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_activity_completions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checkins" TO "anon";
GRANT ALL ON TABLE "public"."daily_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_asset_registry" TO "anon";
GRANT ALL ON TABLE "public"."exercise_asset_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_asset_registry" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_metadata_cache" TO "anon";
GRANT ALL ON TABLE "public"."exercise_metadata_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_metadata_cache" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_goals" TO "anon";
GRANT ALL ON TABLE "public"."fitness_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_goals" TO "service_role";



GRANT ALL ON TABLE "public"."habit_logs" TO "anon";
GRANT ALL ON TABLE "public"."habit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."habit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."lifecycle_emails" TO "anon";
GRANT ALL ON TABLE "public"."lifecycle_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."lifecycle_emails" TO "service_role";



GRANT ALL ON TABLE "public"."meal_metadata_cache" TO "anon";
GRANT ALL ON TABLE "public"."meal_metadata_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_metadata_cache" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_logs" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_logs" TO "service_role";



GRANT ALL ON TABLE "public"."openai_daily_usage" TO "anon";
GRANT ALL ON TABLE "public"."openai_daily_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."openai_daily_usage" TO "service_role";



GRANT ALL ON TABLE "public"."openai_response_cache" TO "anon";
GRANT ALL ON TABLE "public"."openai_response_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."openai_response_cache" TO "service_role";



GRANT ALL ON TABLE "public"."product_events" TO "anon";
GRANT ALL ON TABLE "public"."product_events" TO "authenticated";
GRANT ALL ON TABLE "public"."product_events" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."progress_tracking" TO "anon";
GRANT ALL ON TABLE "public"."progress_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_tracking" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."recipes_catalog" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."recipes_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes_catalog" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recipes_catalog_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recipes_catalog_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recipes_catalog_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."registrations" TO "anon";
GRANT ALL ON TABLE "public"."registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."registrations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registrations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registrations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registrations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."trainer_alert_state" TO "anon";
GRANT ALL ON TABLE "public"."trainer_alert_state" TO "authenticated";
GRANT ALL ON TABLE "public"."trainer_alert_state" TO "service_role";



GRANT ALL ON TABLE "public"."trainer_calendar_tokens" TO "anon";
GRANT ALL ON TABLE "public"."trainer_calendar_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."trainer_calendar_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."user_ai_memory" TO "anon";
GRANT ALL ON TABLE "public"."user_ai_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."user_ai_memory" TO "service_role";



GRANT ALL ON TABLE "public"."user_checkins" TO "anon";
GRANT ALL ON TABLE "public"."user_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."user_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."user_habits" TO "anon";
GRANT ALL ON TABLE "public"."user_habits" TO "authenticated";
GRANT ALL ON TABLE "public"."user_habits" TO "service_role";



GRANT ALL ON TABLE "public"."user_meal_pins" TO "anon";
GRANT ALL ON TABLE "public"."user_meal_pins" TO "authenticated";
GRANT ALL ON TABLE "public"."user_meal_pins" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."v_membership_funnel" TO "service_role";



GRANT ALL ON TABLE "public"."v_plan_quality_dashboard" TO "service_role";



GRANT ALL ON TABLE "public"."v_user_plan_status" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."withings_body_snapshots" TO "service_role";
GRANT SELECT ON TABLE "public"."withings_body_snapshots" TO "authenticated";



GRANT ALL ON TABLE "public"."withings_connections" TO "service_role";



GRANT ALL ON TABLE "public"."withings_daily" TO "anon";
GRANT ALL ON TABLE "public"."withings_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."withings_daily" TO "service_role";



GRANT ALL ON TABLE "public"."withings_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."withings_oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."workout_replacements" TO "anon";
GRANT ALL ON TABLE "public"."workout_replacements" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_replacements" TO "service_role";



GRANT ALL ON TABLE "public"."workout_types_unmapped" TO "anon";
GRANT ALL ON TABLE "public"."workout_types_unmapped" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_types_unmapped" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- =============================================================================
-- SEED DATA (pg_dump schema-only nezahrnuje data)
-- Zdroj: 20260714165550_apple_health_metric_registry, 20260714170721_workout_type_normalization
-- =============================================================================

INSERT INTO "public"."apple_health_metric_defs"
  ("metric_name", "label_cs", "category", "agg", "canonical_unit", "from_unit", "factor", "is_key")
VALUES
  ('step_count',                'Kroky',                    'aktivita','sum','count',  null,   null, true),
  ('active_energy',             'Aktivní energie',          'aktivita','sum','kcal',   'kJ', 1/4.184, true),
  ('basal_energy_burned',       'Bazální energie',          'aktivita','sum','kcal',   'kJ', 1/4.184, true),
  ('apple_exercise_time',       'Čas cvičení',              'aktivita','sum','min',    null,   null, true),
  ('apple_stand_time',          'Čas ve stoje',             'aktivita','sum','min',    null,   null, false),
  ('apple_stand_hour',          'Hodiny ve stoje',          'aktivita','sum','count',  null,   null, true),
  ('apple_move_time',           'Čas pohybu',               'aktivita','sum','min',    null,   null, false),
  ('flights_climbed',           'Vystoupaná patra',         'aktivita','sum','count',  null,   null, false),
  ('physical_effort',           'Fyzická námaha',           'aktivita','avg','kcal/hr·kg', null, null, false),
  ('walking_running_distance',  'Vzdálenost chůze/běhu',    'pohyb','sum','km',    null, null, true),
  ('cycling_distance',          'Vzdálenost na kole',       'pohyb','sum','km',    null, null, false),
  ('swimming_distance',         'Vzdálenost plavání',       'pohyb','sum','m',     null, null, false),
  ('swimming_stroke_count',     'Plavecká tempa',           'pohyb','sum','count', null, null, false),
  ('wheelchair_distance',       'Vzdálenost na vozíku',     'pohyb','sum','km',    null, null, false),
  ('walking_speed',             'Rychlost chůze',           'pohyb','avg','km/hr', null, null, false),
  ('walking_step_length',       'Délka kroku',              'pohyb','avg','cm',    null, null, false),
  ('walking_asymmetry_percentage','Asymetrie chůze',        'pohyb','avg','%',     null, null, false),
  ('walking_double_support_percentage','Dvojitá opora',     'pohyb','avg','%',     null, null, false),
  ('stair_speed_up',            'Rychlost do schodů',       'pohyb','avg','m/s',   null, null, false),
  ('stair_speed_down',          'Rychlost ze schodů',       'pohyb','avg','m/s',   null, null, false),
  ('six_minute_walking_test_distance','6min test chůze',    'pohyb','last','m',    null, null, false),
  ('heart_rate',                'Tepová frekvence',         'srdce','avg','count/min', null, null, true),
  ('resting_heart_rate',        'Klidový tep',              'srdce','avg','count/min', null, null, true),
  ('heart_rate_variability',    'HRV',                      'srdce','avg','ms',        null, null, true),
  ('walking_heart_rate_average','Tep při chůzi',            'srdce','avg','count/min', null, null, false),
  ('cardio_recovery',           'Zotavení tepu (1 min)',    'srdce','avg','count/min', null, null, true),
  ('vo2_max',                   'VO2 max',                  'srdce','last','ml/(kg·min)', null, null, true),
  ('atrial_fibrillation_burden','Fibrilace síní',           'srdce','avg','%',         null, null, false),
  ('respiratory_rate',          'Dechová frekvence',        'dychani','avg','count/min', null, null, true),
  ('blood_oxygen_saturation',   'Okysličení krve',          'dychani','avg','%',         null, null, true),
  ('forced_vital_capacity',     'Vitální kapacita plic',    'dychani','avg','L',         null, null, false),
  ('weight_body_mass',          'Váha',                     'telo','last','kg',    null, null, true),
  ('body_fat_percentage',       'Tělesný tuk',              'telo','last','%',     null, null, true),
  ('lean_body_mass',            'Čistá tělesná hmota',      'telo','last','kg',    null, null, true),
  ('body_mass_index',           'BMI',                      'telo','last','count', null, null, true),
  ('height',                    'Výška',                    'telo','last','cm',    null, null, false),
  ('waist_circumference',       'Obvod pasu',               'telo','last','cm',    null, null, false),
  ('body_temperature',          'Tělesná teplota',          'telo','avg','degC',   null, null, false),
  ('apple_sleeping_wrist_temperature','Teplota zápěstí ve spánku','telo','avg','degC', null, null, false),
  ('blood_glucose',             'Glykémie',                 'telo','avg','mg/dL',  null, null, false),
  ('time_in_daylight',          'Čas na denním světle',     'prostredi','sum','min',    null, null, false),
  ('headphone_audio_exposure',  'Hluk ze sluchátek',        'prostredi','avg','dBASPL', null, null, false),
  ('environmental_audio_exposure','Hluk z okolí',           'prostredi','avg','dBASPL', null, null, false),
  ('underwater_temperature',    'Teplota vody',             'prostredi','avg','degC',   null, null, false),
  ('underwater_depth',          'Hloubka ponoru',           'prostredi','max','m',      null, null, false)
ON CONFLICT ("metric_name") DO UPDATE SET
  "label_cs"       = EXCLUDED."label_cs",
  "category"       = EXCLUDED."category",
  "agg"            = EXCLUDED."agg",
  "canonical_unit" = EXCLUDED."canonical_unit",
  "from_unit"      = EXCLUDED."from_unit",
  "factor"         = EXCLUDED."factor",
  "is_key"         = EXCLUDED."is_key";

INSERT INTO "public"."workout_type_map" ("raw_type", "canonical", "label_cs", "category") VALUES
  ('Bazén Plavat',              'pool_swim',      'Plavání v bazénu',     'plavani'),
  ('Pool Swim',                 'pool_swim',      'Plavání v bazénu',     'plavani'),
  ('Otevěřená voda Plavat',     'open_water_swim','Plavání v přírodě',    'plavani'),
  ('Otevřená voda Plavat',      'open_water_swim','Plavání v přírodě',    'plavani'),
  ('Open Water Swim',           'open_water_swim','Plavání v přírodě',    'plavani'),
  ('Venku Procházka',           'outdoor_walk',   'Procházka venku',      'chuze'),
  ('Outdoor Walk',              'outdoor_walk',   'Procházka venku',      'chuze'),
  ('Uvnitř Procházka',          'indoor_walk',    'Chůze uvnitř',         'chuze'),
  ('Indoor Walk',               'indoor_walk',    'Chůze uvnitř',         'chuze'),
  ('Venku Cyklistika',          'outdoor_cycle',  'Cyklistika venku',     'kolo'),
  ('Outdoor Cycle',             'outdoor_cycle',  'Cyklistika venku',     'kolo'),
  ('Uvnitř Cyklistika',         'indoor_cycle',   'Cyklistika uvnitř',    'kolo'),
  ('Indoor Cycle',              'indoor_cycle',   'Cyklistika uvnitř',    'kolo'),
  ('Venku Běh',                 'outdoor_run',    'Běh venku',            'beh'),
  ('Outdoor Run',               'outdoor_run',    'Běh venku',            'beh'),
  ('Uvnitř Běh',                'indoor_run',     'Běh uvnitř',           'beh'),
  ('Indoor Run',                'indoor_run',     'Běh uvnitř',           'beh'),
  ('Tradiční silový trénink',   'strength',       'Silový trénink',       'sila'),
  ('Traditional Strength Training','strength',    'Silový trénink',       'sila'),
  ('Funkční silový trénink',    'functional',     'Funkční trénink',      'sila'),
  ('Functional Strength Training','functional',   'Funkční trénink',      'sila'),
  ('Vysoce intenzivní intervalový trénink','hiit','HIIT',                 'kardio'),
  ('High Intensity Interval Training','hiit',     'HIIT',                 'kardio'),
  ('Eliptický trenažér',        'elliptical',     'Eliptický trenažér',   'kardio'),
  ('Veslování',                 'rowing',         'Veslování',            'kardio'),
  ('Jóga',                      'yoga',           'Jóga',                 'jina'),
  ('Yoga',                      'yoga',           'Jóga',                 'jina'),
  ('Turistika',                 'hiking',         'Turistika',            'chuze'),
  ('Hiking',                    'hiking',         'Turistika',            'chuze'),
  ('Core Trénink',              'core',           'Core trénink',         'sila'),
  ('Core Training',             'core',           'Core trénink',         'sila')
ON CONFLICT ("raw_type") DO UPDATE SET
  "canonical" = EXCLUDED."canonical",
  "label_cs"  = EXCLUDED."label_cs",
  "category"  = EXCLUDED."category";





