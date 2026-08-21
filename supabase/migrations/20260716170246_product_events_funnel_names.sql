-- Expand product_events.event_name allowlist for registration funnel + workout-change events already used in app code.

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_event_name_check;

ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check CHECK (
    event_name = ANY (ARRAY[
      'onboarding_started'::text,
      'onboarding_completed'::text,
      'onboarding_step_completed'::text,
      'onboarding_abandoned'::text,
      'registration_email_conflict'::text,
      'device_interest_selected'::text,
      'plan_generation_started'::text,
      'plan_generation_completed'::text,
      'plan_generation_failed'::text,
      'plan_viewed'::text,
      'daily_plan_viewed'::text,
      'meal_completed'::text,
      'workout_completed'::text,
      'habit_completed'::text,
      'meal_replaced'::text,
      'workout_change_opened'::text,
      'workout_change_preferences_selected'::text,
      'workout_alternative_generated'::text,
      'workout_alternative_confirmed'::text,
      'workout_alternative_regenerated'::text,
      'workout_original_restored'::text,
      'workout_change_failed'::text,
      'daily_checkin_completed'::text,
      'feedback_submitted'::text,
      'paywall_viewed'::text,
      'checkout_started'::text,
      'subscription_activated'::text
    ])
  );
