-- RPC helpers for beta_participants — PostgREST table access blocked under sb_secret keys.
-- SECURITY DEFINER reads/writes bypass RLS safely (service_role only).

CREATE OR REPLACE FUNCTION public.get_beta_participant_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    'first_return_at', v_row.first_return_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_beta_participant_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beta_participant_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.patch_beta_participant_milestone(
  p_user_id uuid,
  p_patch jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.patch_beta_participant_milestone(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patch_beta_participant_milestone(uuid, jsonb) TO service_role;
