SELECT tier, status FROM memberships WHERE user_id = '599bdec1-cacd-49bd-a496-29a4b1796712';
SELECT id, status, task_type FROM ai_tasks WHERE user_id = '599bdec1-cacd-49bd-a496-29a4b1796712' ORDER BY created_at DESC LIMIT 3;
SELECT id, is_active, (meal_plan IS NOT NULL) AS has_meal, (workout_plan IS NOT NULL) AS has_workout FROM ai_generated_plans WHERE user_id = '599bdec1-cacd-49bd-a496-29a4b1796712' ORDER BY created_at DESC LIMIT 2;
SELECT id FROM profiles WHERE id = '599bdec1-cacd-49bd-a496-29a4b1796712';
