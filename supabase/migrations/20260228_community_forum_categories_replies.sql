-- Fórum: kategorie a odpovědi ve vláknech
-- community_posts = témata (vlákna), každé má kategorii; community_replies = odpovědi pod tématem

-- Kategorie
CREATE TABLE IF NOT EXISTS public.community_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_community_categories_sort ON public.community_categories(sort_order);

INSERT INTO public.community_categories (name, slug, description, sort_order) VALUES
  ('Trénink', 'trenink', 'Cvičení, posilování, tréninkové plány', 10),
  ('Jídlo a strava', 'jidlo-strava', 'Recepty, jídelníčky, makra', 20),
  ('Motivace a progres', 'motivace-progres', 'Zkušenosti, výsledky, podpora', 30),
  ('Obecné', 'obecne', 'Ostatní dotazy a diskuze', 40)
ON CONFLICT (slug) DO NOTHING;

-- Přidat category_id do témat (příspěvků)
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.community_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_posts_category_id ON public.community_posts(category_id);

-- Odpovědi ve vláknech
CREATE TABLE IF NOT EXISTS public.community_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_replies_topic_id ON public.community_replies(topic_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_created_at ON public.community_replies(created_at);

ALTER TABLE public.community_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_replies_select_authenticated"
  ON public.community_replies FOR SELECT TO authenticated USING (true);

CREATE POLICY "community_replies_insert_authenticated"
  ON public.community_replies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_replies_update_own"
  ON public.community_replies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_replies_delete_own"
  ON public.community_replies FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.community_categories IS 'Kategorie fóra (Trénink, Jídlo, Motivace, Obecné).';
COMMENT ON TABLE public.community_replies IS 'Odpovědi v rámci témat (vláken).';
