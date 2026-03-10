# AI System Architecture – Body & Mind ON

> Authoritative architecture reference. Keep this document in sync with code changes.

---

## 1. Registration Flow

```mermaid
flowchart TD
    A([User submits registration form]) --> B[POST /api/body-metrics]
    B --> C[createAuthUserIfNew]
    C --> D[Insert body_metrics]
    D --> E[createInitialAITasks\ntrainer:initial_plan\ncoach:onboarding_message]
    E --> F[enqueueAIEvent\nuser_registered]
    F --> G[triggerImmediateDecision\nevaluateUserState]
    G --> H[createAITasksFromDecisions\nwrite ai_tasks]
    H --> I[runAIScheduler immediately]
    I --> J{Scheduler picks up tasks}
    J --> K[executeAITask via taskExecutors.js]
    K -->|trainer| L[ai_generated_plans created]
    K -->|coach| M[ai_messages created]
    L --> N[sendPlanEmail]
    N --> O([User receives plan by email])
    M --> P([Coach message stored for profile])
```

---

## 2. Event → Decision → Task → Domain Executor Flow

```mermaid
flowchart LR
    A([User event\nor scheduled trigger]) --> B[(ai_events\nstatus: pending)]
    B --> C[processPendingAIEvents]
    C --> D[evaluateUserState\naiDecisionEngine.js]
    D --> E[createAITasksFromDecisions]
    E --> F[(ai_tasks\nstatus: pending)]
    F --> G[runAIScheduler\naiScheduler.js]
    G --> H[claim task\nstatus: processing]
    H --> I[executeAITask\ntaskExecutors.js]
    I --> J{agent_slug}
    J -->|trainer| K[executeTrainerTask]
    J -->|coach| L[executeCoachTask]
    J -->|marketing| M[executeMarketingTask]
    J -->|social| N[executeSocialTask]
    J -->|validator| O[executeValidatorTask]
    K --> P[(ai_generated_plans)]
    L --> Q[(ai_messages)]
    M --> R[(ai_content_drafts)]
    N --> R
    P --> S[task: completed\nresult: outcome_type: plan_generated]
    Q --> T[task: completed\nresult: outcome_type: message_generated]
    R --> U[task: completed\nresult: outcome_type: draft_generated]
    S --> V[(ai_logs audit entry)]
    T --> V
    U --> V
```

---

## 3. Trainer Plan Generation Flow

```mermaid
flowchart TD
    A([executeTrainerTask called]) --> B[loadLatestBodyMetrics\nbody_metrics table]
    B --> C[loadLatestPlan\nai_generated_plans table]
    C --> D{initial_plan\nand plan exists?}
    D -->|yes| E[Return: plan_generated\nskipped=true]
    D -->|no| F[generatePlan\ngeneratePlan.js\nrunAgent trainer → OpenAI]
    F --> G[runPlanValidators\nnutrition_validator\ntraining_validator]
    G --> H{html corrected?}
    H -->|yes| I[Use corrected HTML]
    H -->|no| J[Use original HTML]
    I --> K[persistTrainerPlan\nai_generated_plans insert/update]
    J --> K
    K --> L{task_type\ninitial_plan?}
    L -->|yes| M[sendPlanEmail\nmail.js]
    L -->|no| N[Skip email]
    M --> O[writeAILog]
    N --> O
    O --> P([Return result:\noutcome_type: plan_generated\nplan_id, valid_from, valid_until\nemail_sent, metrics])
```

---

## 4. Enrichment Flow

```mermaid
flowchart LR
    A([PlanViewer mounts\nor plan displayed]) --> B[POST /api/plan-enrichment\nwith plan_html]
    B --> C[enrichPlanContent\nlib/enrichPlanContent.js]
    C --> D[parseMealNamesFromHtml]
    C --> E[parseExerciseNamesFromHtml]
    D --> F[enrichMeal\nfor each meal name]
    E --> G[enrichExercise\nfor each exercise name]
    F --> H{Spoonacular API\nimage available?}
    H -->|yes| I[Return image_url]
    H -->|no| J[Pexels fallback\nwith scoring]
    J --> K{Score ≥ 2?}
    K -->|yes| I
    K -->|no| L[No image]
    G --> M{ExerciseDB API\ngifUrl available?}
    M -->|yes| N[Return gif_url]
    M -->|no| O[exercisedb.dev fallback]
    O --> P{gifUrl found?}
    P -->|yes| N
    P -->|no| Q[Pexels fallback\nfitness scoring]
    Q --> R{Score ≥ 2?}
    R -->|yes| N
    R -->|no| S[No image]
    I --> T[(meal_images map\nreturned to UI)]
    N --> U[(exercise_media map\nreturned to UI)]
```

---

## 5. Retry / Dead Letter Queue Flow

```mermaid
flowchart TD
    A([Task or Event fails]) --> B{attempts < max_attempts?}
    B -->|yes| C[Increment attempts\nset last_error\ncalculate next_retry_at]
    C --> D[Exponential backoff\n1m → 2m → 4m → 8m → 16m]
    D --> E[status: pending\nnext_retry_at set]
    E --> F([Scheduler picks up again\nwhen next_retry_at ≤ now])
    B -->|no| G[status: dlq\ndead_lettered_at set\nattempts = max_attempts]
    G --> H[(ai_logs: status dlq\nerror recorded)]
    H --> I([Alert: admin review needed\nrequeue manually if appropriate])
    
    J([Budget error]) --> K[Defer to next day\nnext_retry_at = tomorrow 00:05]
    K --> L[status: pending\ndeferred_for_budget: true]
```

---

## 6. AI Agents and Their Domain Roles

| Agent | Slug | Domain Output | Storage |
|---|---|---|---|
| AI Trainer | `trainer` | Weekly personalized plan (HTML) | `ai_generated_plans` |
| AI Coach | `coach` | Motivational / onboarding messages | `ai_messages` |
| Marketing | `marketing` | Campaign drafts | `ai_content_drafts` |
| Social | `social` | Social media content drafts | `ai_content_drafts` |
| Nutrition Validator | `nutrition_validator` | Validates meal plan nutrition | Internal (trainer uses result) |
| Training Validator | `training_validator` | Validates training plan safety | Internal (trainer uses result) |

---

## 7. Database Tables Overview

| Table | Purpose |
|---|---|
| `body_metrics` | User profile and physical metrics |
| `ai_tasks` | Task queue (pending → processing → completed/failed/dlq) |
| `ai_events` | Event queue (user_registered, preferences_changed, etc.) |
| `ai_generated_plans` | Trainer output: full weekly HTML plans |
| `ai_messages` | Coach output: in-app messages with delivery tracking |
| `ai_content_drafts` | Marketing/Social output: structured content drafts |
| `ai_agents` | Agent configuration (prompt, model, temperature) |
| `ai_logs` | Audit trail for all AI actions |
| `ai_task_types` | Task type definitions and side-effect mappings |
| `ai_executor_bindings` | DB-driven binding: side_effect_type → executor_slug |
| `user_ai_memory` | Agent memory for context persistence |
| `openai_daily_usage` | Cost tracking per day |
| `openai_response_cache` | LLM response cache (24h TTL) |
| `memberships` | User membership tier and status |
| `user_habits` | Selected habits per user |
