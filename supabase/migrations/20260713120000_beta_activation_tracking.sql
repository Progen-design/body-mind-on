-- Beta activation tracking: product_events, beta_feedback, daily completions, daily check-ins.
-- Additive only — no changes to existing tables or data.

-- ---------------------------------------------------------------------------
-- A. product_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id text NULL,
  session_id text NULL,
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_path text NULL,
  source text NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_events_event_name_check CHECK (
    event_name IN (
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
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_product_events_created_at
  ON public.product_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_event_name_created_at
  ON public.product_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_id_created_at
  ON public.product_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert only their own events (client path via user JWT is optional;
-- primary path is server-side service role).
CREATE POLICY product_events_insert_own
  ON public.product_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.product_events IS 'Low-risk product funnel events. No PII in properties.';

-- ---------------------------------------------------------------------------
-- B. beta_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context text NOT NULL,
  score integer NULL CHECK (score IS NULL OR (score >= 1 AND score <= 5)),
  category text NULL,
  message text NULL,
  app_version text NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_feedback_context_check CHECK (
    context IN ('onboarding', 'first_plan', 'meal_plan', 'workout_plan', 'daily_use', 'general')
  ),
  CONSTRAINT beta_feedback_category_check CHECK (
    category IS NULL OR category IN (
      'confusing', 'unrealistic', 'missing_feature', 'technical_problem', 'useful', 'other'
    )
  ),
  CONSTRAINT beta_feedback_message_length CHECK (
    message IS NULL OR char_length(message) <= 1000
  )
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_created_at
  ON public.beta_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_id
  ON public.beta_feedback(user_id);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY beta_feedback_insert_own
  ON public.beta_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.beta_feedback IS 'In-app beta feedback. Message is private; not exposed to other users.';

-- ---------------------------------------------------------------------------
-- C. daily_activity_completions (meals + plan workouts; habits use habit_logs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_activity_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NULL,
  plan_day integer NOT NULL,
  activity_type text NOT NULL,
  activity_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_activity_completions_type_check CHECK (
    activity_type IN ('meal', 'workout', 'habit')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_activity_completions_unique_coalesce
  ON public.daily_activity_completions (
    user_id,
    COALESCE(plan_id::text, ''),
    plan_day,
    activity_type,
    activity_key
  );

CREATE INDEX IF NOT EXISTS idx_daily_activity_completions_user_day
  ON public.daily_activity_completions(user_id, plan_day);

ALTER TABLE public.daily_activity_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_activity_completions_select_own
  ON public.daily_activity_completions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY daily_activity_completions_insert_own
  ON public.daily_activity_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY daily_activity_completions_delete_own
  ON public.daily_activity_completions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.daily_activity_completions IS 'Idempotent daily meal/workout completion from plan UI.';

-- ---------------------------------------------------------------------------
-- D. daily_checkins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date date NOT NULL,
  rating text NOT NULL,
  blocker text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_checkins_rating_check CHECK (
    rating IN ('great', 'good', 'partial', 'none')
  ),
  CONSTRAINT daily_checkins_blocker_check CHECK (
    blocker IS NULL OR blocker IN (
      'no_time',
      'food_mismatch',
      'workout_too_hard',
      'workout_too_easy',
      'no_motivation',
      'technical_problem',
      'other'
    )
  ),
  CONSTRAINT daily_checkins_unique_per_day UNIQUE (user_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date
  ON public.daily_checkins(user_id, checkin_date DESC);

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_checkins_select_own
  ON public.daily_checkins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY daily_checkins_insert_own
  ON public.daily_checkins
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY daily_checkins_update_own
  ON public.daily_checkins
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.daily_checkins IS 'One check-in per user per calendar day (Europe/Prague).';
