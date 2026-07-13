-- Direct beta join without invite codes (additive, non-destructive).

-- invite_code_hash nullable for direct_beta_link participants
ALTER TABLE public.beta_participants
  ALTER COLUMN invite_code_hash DROP NOT NULL;

ALTER TABLE public.beta_participants
  DROP CONSTRAINT IF EXISTS beta_participants_invite_code_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS beta_participants_invite_hash_unique
  ON public.beta_participants(invite_code_hash)
  WHERE invite_code_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- join_beta_cohort — transactional direct join (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_beta_cohort(
  p_user_id uuid,
  p_cohort_code text,
  p_beta_terms_version text,
  p_source text DEFAULT 'direct_beta_link'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.join_beta_cohort(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_beta_cohort(uuid, text, text, text) TO service_role;

-- Extend participant lookup for direct join verification
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
    'first_return_at', v_row.first_return_at,
    'source', v_row.source,
    'beta_terms_version', v_row.beta_terms_version,
    'invite_code_hash_set', (v_row.invite_code_hash IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_beta_participant_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beta_participant_for_user(uuid) TO service_role;
