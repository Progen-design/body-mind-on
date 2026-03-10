-- =============================================================================
-- Migration: 20260322_ai_messages_extended
-- Purpose:   Close the final architecture gaps:
--   1. Extend ai_messages with task_id and payload columns
--   2. Migrate data from ai_coach_messages → ai_messages (idempotent)
--   3. Extend user_ai_memory with source_agent_slug for shared memory tracking
--   4. Add unique constraint on (user_id, memory_type) for shared fact upsert
--   5. Add helpful indexes for shared memory queries
--
-- SAFE: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--       Data migration is idempotent (uses NOT EXISTS to prevent duplicates).
-- =============================================================================


-- ── 1. ai_messages: add missing columns ──────────────────────────────────────
-- task_id: links message to the ai_tasks row that produced it
-- payload: stores structured AI output or task payload for audit trail

alter table if exists ai_messages
  add column if not exists task_id uuid;

alter table if exists ai_messages
  add column if not exists payload jsonb;

create index if not exists idx_ai_messages_task
  on ai_messages(task_id);

create index if not exists idx_ai_messages_user_created
  on ai_messages(user_id, created_at desc);


-- ── 2. Migrate data from ai_coach_messages → ai_messages (idempotent) ────────
-- Only copies rows that haven't been migrated yet (by checking source task_id or title).
-- ai_coach_messages is kept intact as a read-only historical archive.
-- All new writes go exclusively to ai_messages.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'ai_coach_messages'
  ) then
    insert into ai_messages (
      user_id,
      agent_slug,
      task_type,
      title,
      content,
      status,
      delivery_channel,
      task_id,
      created_at
    )
    select
      acm.user_id,
      'coach'                                           as agent_slug,
      coalesce(acm.message_type, 'coach_message')       as task_type,
      coalesce(acm.title, 'Koučovací zpráva')           as title,
      coalesce(acm.message, '')                         as content,
      'generated'                                       as status,
      'in_app'                                          as delivery_channel,
      acm.task_id,
      acm.created_at
    from ai_coach_messages acm
    where not exists (
      -- Prevent duplication: skip if already migrated (same task_id or same created_at+user_id)
      select 1
      from ai_messages am
      where am.user_id = acm.user_id
        and am.agent_slug = 'coach'
        and (
          (am.task_id is not null and am.task_id = acm.task_id)
          or
          (am.created_at = acm.created_at)
        )
    );
  end if;
end;
$$;


-- ── 3. user_ai_memory: add source_agent_slug column ──────────────────────────
-- Tracks which agent wrote a shared memory fact (for transparency and audit).
-- Used by: lib/aiSharedMemory.js writeSharedMemoryFact()

alter table if exists user_ai_memory
  add column if not exists source_agent_slug text;


-- ── 4. user_ai_memory: unique constraint for shared fact upsert ──────────────
-- Enables ON CONFLICT (user_id, memory_type) for idempotent shared fact writes.
-- Only applies to shared_ prefixed facts (pattern enforced in application layer).

create unique index if not exists idx_user_ai_memory_user_type_unique
  on user_ai_memory(user_id, memory_type)
  where memory_type is not null;


-- ── 5. Indexes for shared memory queries ─────────────────────────────────────
-- Supports getSharedMemory() and getAgentSpecificMemory() in lib/aiSharedMemory.js

create index if not exists idx_user_ai_memory_user_agent
  on user_ai_memory(user_id, agent_slug, created_at desc);

create index if not exists idx_user_ai_memory_shared
  on user_ai_memory(user_id, memory_type, created_at desc);


-- ── Summary ───────────────────────────────────────────────────────────────────
-- After this migration:
--   ✓ ai_messages has task_id + payload — full message provenance
--   ✓ ai_coach_messages data migrated into ai_messages (idempotent)
--   ✓ user_ai_memory has source_agent_slug for shared fact tracking
--   ✓ unique index on (user_id, memory_type) enables upsert for shared facts
--   ✓ indexes support fast shared memory and agent-specific memory queries
-- =============================================================================
