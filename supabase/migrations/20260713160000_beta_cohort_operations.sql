-- Closed beta cohort operations: cohorts, participants, research sessions, issues, decisions.
-- Additive only — no changes to existing tables or data.

-- ---------------------------------------------------------------------------
-- beta_cohorts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL,
  max_participants integer NOT NULL DEFAULT 5,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_cohorts_status_check CHECK (
    status IN ('draft', 'recruiting', 'active', 'analyzing', 'completed', 'canceled', 'paused')
  ),
  CONSTRAINT beta_cohorts_max_participants_check CHECK (max_participants >= 1 AND max_participants <= 100)
);

CREATE INDEX IF NOT EXISTS idx_beta_cohorts_status ON public.beta_cohorts(status);

ALTER TABLE public.beta_cohorts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.beta_cohorts IS 'Closed beta cohort definitions. Admin/service role only.';

-- ---------------------------------------------------------------------------
-- beta_participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.beta_cohorts(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_alias text NULL,
  invite_code_hash text NOT NULL UNIQUE,
  status text NOT NULL,
  invited_at timestamptz NULL,
  registered_at timestamptz NULL,
  onboarding_completed_at timestamptz NULL,
  first_plan_viewed_at timestamptz NULL,
  first_action_at timestamptz NULL,
  first_return_at timestamptz NULL,
  session_completed_at timestamptz NULL,
  exited_at timestamptz NULL,
  exit_reason text NULL,
  source text NULL,
  beta_terms_accepted_at timestamptz NULL,
  beta_terms_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_participants_status_check CHECK (
    status IN ('invited', 'registered', 'onboarding', 'active', 'completed', 'dropped', 'excluded')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_participants_cohort_user_unique
  ON public.beta_participants(cohort_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beta_participants_cohort_id ON public.beta_participants(cohort_id);
CREATE INDEX IF NOT EXISTS idx_beta_participants_user_id ON public.beta_participants(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.beta_participants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.beta_participants IS 'Beta invite participants. Plain invite codes never stored.';

-- ---------------------------------------------------------------------------
-- beta_research_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_research_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.beta_participants(id) ON DELETE CASCADE,
  scheduled_at timestamptz NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  mode text NOT NULL DEFAULT 'remote',
  recording_consent boolean NOT NULL DEFAULT false,
  recording_reference text NULL,
  moderator_notes text NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_research_sessions_mode_check CHECK (
    mode IN ('remote', 'in_person', 'unmoderated')
  ),
  CONSTRAINT beta_research_sessions_status_check CHECK (
    status IN ('planned', 'confirmed', 'completed', 'no_show', 'canceled')
  ),
  CONSTRAINT beta_research_sessions_notes_length CHECK (
    moderator_notes IS NULL OR char_length(moderator_notes) <= 5000
  )
);

CREATE INDEX IF NOT EXISTS idx_beta_research_sessions_participant ON public.beta_research_sessions(participant_id);

ALTER TABLE public.beta_research_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- beta_issues
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.beta_cohorts(id) ON DELETE CASCADE,
  participant_id uuid NULL REFERENCES public.beta_participants(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  evidence text NULL,
  affected_step text NULL,
  occurrence_count integer NOT NULL DEFAULT 1,
  owner text NULL,
  resolution text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT beta_issues_category_check CHECK (
    category IN (
      'onboarding', 'plan_generation', 'meal_plan', 'workout_plan', 'daily_use',
      'feedback', 'technical', 'trust', 'content', 'other'
    )
  ),
  CONSTRAINT beta_issues_severity_check CHECK (
    severity IN ('blocker', 'high', 'medium', 'low')
  ),
  CONSTRAINT beta_issues_status_check CHECK (
    status IN ('open', 'investigating', 'planned', 'fixed', 'accepted', 'rejected')
  ),
  CONSTRAINT beta_issues_evidence_length CHECK (
    evidence IS NULL OR char_length(evidence) <= 1500
  )
);

CREATE INDEX IF NOT EXISTS idx_beta_issues_cohort ON public.beta_issues(cohort_id, status);

ALTER TABLE public.beta_issues ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- beta_decisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.beta_cohorts(id) ON DELETE CASCADE,
  decision text NOT NULL,
  rationale text NOT NULL,
  evidence_summary text NULL,
  decided_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_decisions_cohort ON public.beta_decisions(cohort_id);

ALTER TABLE public.beta_decisions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- claim_beta_invite — transactional invite claim (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_beta_invite(
  p_invite_hash text,
  p_user_id uuid,
  p_beta_terms_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    RETURN jsonb_build_object(
      'ok', true,
      'error_code', null,
      'cohort_code', v_cohort.code,
      'already_claimed', true
    );
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

REVOKE ALL ON FUNCTION public.claim_beta_invite(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_beta_invite(text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- validate_beta_invite — read-only slot check (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_beta_invite(p_invite_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.validate_beta_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_beta_invite(text) TO service_role;
