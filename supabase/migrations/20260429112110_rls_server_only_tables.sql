-- Tabulky pouze pro backend (supabaseServer / service_role). Zapnuté RLS bez politik
-- pro anon a authenticated = PostgREST zamítne dotazy s anon klíčem.
-- service_role RLS neřeší (Supabase bypass) — viz https://supabase.com/docs/guides/database/postgres/row-level-security
--
-- Řeší: rls_disabled_in_public, sensitive_columns_exposed na trainer_calendar_tokens.
-- Verze záznamu v supabase_migrations: 20260429112110 (shoda s produkční DB).

ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_context_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_executor_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_supporting_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trigger_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_asset_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_metadata_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_metadata_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_alert_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_checkins ENABLE ROW LEVEL SECURITY;
