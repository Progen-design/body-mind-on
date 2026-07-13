-- Beta lifecycle email automation (zero-cost queue). Additive, non-destructive.

-- ---------------------------------------------------------------------------
-- beta_email_automation_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_email_automation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.beta_participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  welcome_sent_at timestamptz NULL,
  plan_ready_sent_at timestamptz NULL,
  no_plan_view_sent_at timestamptz NULL,
  no_first_action_sent_at timestamptz NULL,
  day3_feedback_sent_at timestamptz NULL,
  day7_feedback_sent_at timestamptz NULL,
  last_email_sent_at timestamptz NULL,
  next_action_at timestamptz NULL,
  automation_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_email_automation_state_participant_unique UNIQUE (participant_id)
);

CREATE INDEX IF NOT EXISTS idx_beta_email_automation_state_user
  ON public.beta_email_automation_state(user_id);

ALTER TABLE public.beta_email_automation_state ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- beta_email_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.beta_participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  scheduled_at timestamptz NOT NULL,
  processing_started_at timestamptz NULL,
  sent_at timestamptz NULL,
  failed_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  error_code text NULL,
  provider_message_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_email_messages_trigger_key_check CHECK (
    trigger_key IN (
      'beta_welcome',
      'beta_plan_ready',
      'beta_no_plan_view_24h',
      'beta_no_first_action_48h',
      'beta_day3_feedback',
      'beta_day7_feedback'
    )
  ),
  CONSTRAINT beta_email_messages_status_check CHECK (
    status IN ('queued', 'processing', 'sent', 'failed', 'skipped', 'canceled')
  ),
  CONSTRAINT beta_email_messages_participant_trigger_unique UNIQUE (participant_id, trigger_key)
);

CREATE INDEX IF NOT EXISTS idx_beta_email_messages_status_scheduled
  ON public.beta_email_messages(status, scheduled_at)
  WHERE status IN ('queued', 'processing');

ALTER TABLE public.beta_email_messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.beta_email_automation_state IS 'Per-participant beta lifecycle email state. No PII.';
COMMENT ON TABLE public.beta_email_messages IS 'Beta lifecycle email queue. No recipient address stored.';

-- ---------------------------------------------------------------------------
-- queue_beta_email_message — idempotent insert (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_beta_email_message(
  p_participant_id uuid,
  p_user_id uuid,
  p_trigger_key text,
  p_scheduled_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.queue_beta_email_message(uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_beta_email_message(uuid, uuid, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- claim_beta_email_batch — atomic claim (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_beta_email_batch(
  p_limit integer DEFAULT 20,
  p_stale_minutes integer DEFAULT 15
)
RETURNS SETOF public.beta_email_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.claim_beta_email_batch(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_beta_email_batch(integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- mark_beta_email_sent / failed / canceled
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_beta_email_sent(
  p_message_id uuid,
  p_provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.mark_beta_email_sent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_beta_email_sent(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_beta_email_failed(
  p_message_id uuid,
  p_error_code text,
  p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.mark_beta_email_failed(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_beta_email_failed(uuid, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_beta_participant_emails(p_participant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.cancel_beta_participant_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_beta_participant_emails(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_beta_email_skipped(
  p_message_id uuid,
  p_error_code text DEFAULT 'skipped'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.mark_beta_email_skipped(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_beta_email_skipped(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- list_beta_email_participants — evaluation payload (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_beta_email_participants(p_cohort_code text DEFAULT 'START-C1')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.list_beta_email_participants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_beta_email_participants(text) TO service_role;
