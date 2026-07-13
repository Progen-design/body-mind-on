-- Server RPC for authenticated product events + guard against missing user_id.
CREATE OR REPLACE FUNCTION public.insert_product_event_server(
  p_user_id uuid,
  p_event_name text,
  p_event_version integer DEFAULT 1,
  p_properties jsonb DEFAULT '{}'::jsonb,
  p_page_path text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.insert_product_event_server(
  uuid, text, integer, jsonb, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_product_event_server(
  uuid, text, integer, jsonb, text, text, text, text, text
) TO service_role;
