-- P1: Index pro efektivní dotazy na onboarding metriky v ai_logs
-- Dotaz: SELECT * FROM ai_logs WHERE agent_slug='onboarding' AND action='registration_complete' ORDER BY created_at DESC
create index if not exists idx_ai_logs_onboarding
  on ai_logs(agent_slug, action, created_at desc);
