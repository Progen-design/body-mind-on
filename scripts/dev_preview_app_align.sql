-- Dev preview (qfufvsyhlbximanxayci): srovnání schématu s očekáváním aplikace.
-- NE pro produkci.

-- memberships: sloupce pro body-metrics upsert + unique user_id
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_id_key ON public.memberships(user_id);

-- ai_generated_plans: structured JSON sloupec z migrace 20260328
ALTER TABLE public.ai_generated_plans
  ADD COLUMN IF NOT EXISTS structured_plan_json jsonb;

-- auth trigger: profil po registraci (void stub → trigger)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- backfill profiles pro existující auth uživatele bez profilu
INSERT INTO public.profiles (id, email, full_name, updated_at)
SELECT u.id, u.email,
  COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- komunita (minimální schéma pro /api/community*)
CREATE TABLE IF NOT EXISTS public.community_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  author_name text,
  title text NOT NULL,
  content text NOT NULL,
  category_id uuid REFERENCES public.community_categories(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  author_name text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.community_categories (name, slug, description, sort_order)
VALUES ('Obecné', 'obecne', 'Obecná témata', 0)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_replies ENABLE ROW LEVEL SECURITY;
