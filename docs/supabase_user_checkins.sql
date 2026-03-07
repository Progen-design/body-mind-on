-- Weekly check-ins for progress tracking and adaptive plans.
-- weight = current body weight (kg)
-- stress_level = low | medium | high
-- adherence_score = 0–100 (how well the user followed the plan)

create table if not exists user_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  weight numeric,
  stress_level text,
  adherence_score numeric,
  notes text,
  created_at timestamp default now()
);
