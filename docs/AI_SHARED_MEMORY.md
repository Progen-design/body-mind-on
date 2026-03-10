# AI Shared Cross-Agent Memory

> Technical documentation for the shared memory architecture in Body & Mind ON.

---

## Why shared memory matters

The trainer and coach are separate AI agents with separate roles:
- **Trainer**: generates and adjusts nutrition + training plans
- **Coach**: generates motivational and coaching messages for users

Without shared memory, each agent would operate in its own silo. The trainer wouldn't know that the coach detected low adherence. The coach wouldn't know that the trainer recently simplified the plan.

Shared memory creates a lightweight, controlled collaboration channel between agents — without requiring direct agent-to-agent calls (which would increase complexity and failure risk).

---

## Memory model

```
user_ai_memory table
├── Agent-specific memory (agent_slug = 'coach', memory_type = 'coach_onboarding_message')
│   → Only seen by that agent
│   → Used for agent's own history and continuity
│
└── Shared cross-agent memory (memory_type starts with 'shared_')
    → Seen by ALL agents (trainer and coach)
    → Created by coach when a meaningful signal is detected
    → Consumed by trainer when generating/adjusting plans
    → Consumed by coach when generating coaching messages
```

---

## Agent-specific memory

- Filtered by `agent_slug` column
- `memory_type` does NOT start with `shared_`
- Examples: `coach_onboarding_message`, `coach_motivation_message`
- Read by: `getAgentSpecificMemory(userId, agentSlug)`

Used for agent continuity — e.g. the coach knows what messages it previously sent to this user.

---

## Shared cross-agent memory

- `memory_type` starts with `shared_`
- Written by: `writeSharedMemoryFact()`
- Read by: `getSharedMemory(userId)`
- Visible to ALL agents (trainer and coach)

### Defined shared memory types

| memory_type | Written by | Meaning |
|-------------|-----------|---------|
| `shared_recovery_priority` | coach (recovery_message task) | Recovery is needed — reduce training load |
| `shared_low_adherence_pattern` | coach (motivation_message task) | User shows low adherence |
| `shared_plan_simplicity_needed` | coach (motivation_message task) | Plan should be simplified |
| `shared_good_progress` | coach (positive_reinforcement task) | User is progressing well |
| `shared_meal_preference` | (future — from onboarding context only) | Explicit meal preference |
| `shared_training_limitation` | (future — from profile context only) | Avoid certain exercise type |

---

## How trainer consumes shared memory

When the trainer generates or adjusts a plan, `buildAgentContext.js` includes both:
1. `user_ai_memory` — trainer's own history
2. `shared_memory` — all cross-agent shared facts

The trainer prompt receives the shared_memory in its context. Examples of intended behavior:
- `shared_plan_simplicity_needed` → trainer simplifies plan structure
- `shared_recovery_priority` → trainer reduces training load emphasis
- `shared_meal_preference` → trainer prefers certain meal style
- `shared_training_limitation` → trainer avoids certain exercise

Context-first approach: behavior is driven by the AI seeing the shared facts in context, not by hardcoded logic.

---

## How coach writes shared facts

`lib/taskExecutors.js` → `writeCoachSharedFacts(task)`:

Facts are written **only when grounded** in the task type trigger:

```
recovery_message task  → shared_recovery_priority
motivation_message     → shared_low_adherence_pattern + shared_plan_simplicity_needed
positive_reinforcement → shared_good_progress
onboarding_message     → (nothing — context not established yet)
```

**IMPORTANT: Never write shared facts that aren't grounded.**
- The task type itself is sufficient ground (it was triggered by actual progress analysis)
- Do NOT parse AI output for speculative facts
- Do NOT write facts based on tone/sentiment of AI-generated text

---

## How decision engine uses shared facts

`lib/aiDecisionEngine.js` loads up to 5 recent shared facts and passes them as `shared_facts` in the task `payload`. This means every task that gets created already has the shared facts in its payload context.

```json
{
  "shared_facts": [
    { "type": "shared_recovery_priority", "content": "...", "created_at": "...", "source_agent_slug": "coach" },
    { "type": "shared_low_adherence_pattern", "content": "...", "created_at": "...", "source_agent_slug": "coach" }
  ]
}
```

---

## Why NOT direct agent-to-agent calls

Direct calling (agent A calls agent B, waits for response, uses it) would:
- Increase latency (sequential instead of parallel)
- Create failure cascades (if agent B fails, agent A fails too)
- Make the system harder to test and debug
- Break the event-driven pipeline design

Shared memory is asynchronous: coach writes facts after its task, trainer reads them before its next task. This is safer, more predictable, and easier to audit.

---

## Implementation files

| File | Role |
|------|------|
| `lib/aiSharedMemory.js` | `getSharedMemory`, `getAgentSpecificMemory`, `writeSharedMemoryFact` |
| `lib/buildAgentContext.js` | Loads both agent-specific + shared memory into agent context |
| `lib/aiDecisionEngine.js` | Passes shared_facts bundle to task payloads |
| `lib/taskExecutors.js` | `writeCoachSharedFacts` — writes grounded facts after coach task |
| `supabase/migrations/20260322_ai_messages_extended.sql` | DB indexes for shared memory queries |

---

## DB schema (user_ai_memory)

```sql
user_ai_memory (
  id                uuid primary key,
  user_id           uuid,
  agent_slug        text,           -- who wrote it
  memory_type       text,           -- "coach_onboarding_message" or "shared_recovery_priority"
  content           text,
  source_agent_slug text,           -- for shared facts: which agent originally created it
  created_at        timestamp,
  updated_at        timestamp
)
```

Unique index on `(user_id, memory_type)` — ensures upsert semantics: one shared fact per type per user (most recent wins).
