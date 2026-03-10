-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260321_trusted_asset_resolution
-- Purpose:   Create / extend meal_metadata_cache (with trust fields) and
--            create exercise_asset_registry.
--
-- SAFE: all statements are idempotent — can be run multiple times without error.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. meal_metadata_cache ───────────────────────────────────────────────────
--   Stores Spoonacular + Pexels results with trust evaluation fields.
--   Cache key: normalized meal name (name_key).
--   image_trust_level: "exact" | "illustrative" | "none"

-- Ensure the table exists with base structure
create table if not exists meal_metadata_cache (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamp default now()
);

-- Add all required columns idempotently (handles both fresh and legacy table)
alter table meal_metadata_cache add column if not exists name_key            text;
alter table meal_metadata_cache add column if not exists name                text;
alter table meal_metadata_cache add column if not exists image_url           text;
alter table meal_metadata_cache add column if not exists source              text default 'none';
alter table meal_metadata_cache add column if not exists image_trust_level   text default 'none';
alter table meal_metadata_cache add column if not exists exact_source        text;
alter table meal_metadata_cache add column if not exists illustrative_source text;
alter table meal_metadata_cache add column if not exists confidence_score    numeric(5,4) default 0;
alter table meal_metadata_cache add column if not exists calories            numeric;
alter table meal_metadata_cache add column if not exists protein_g           numeric;
alter table meal_metadata_cache add column if not exists carbs_g             numeric;
alter table meal_metadata_cache add column if not exists fat_g               numeric;
alter table meal_metadata_cache add column if not exists updated_at          timestamp default now();

-- Create unique constraint on name_key (idempotent via unique index)
create unique index if not exists idx_meal_metadata_cache_name_key
  on meal_metadata_cache(name_key)
  where name_key is not null;

create index if not exists idx_meal_metadata_cache_trust
  on meal_metadata_cache(image_trust_level);


-- ── 2. exercise_asset_registry ───────────────────────────────────────────────
--   Durable registry ensuring the same exercise ALWAYS maps to the same visual.
--   canonical_key: matches CANONICAL_EXERCISES keys in lib/exerciseCanonicalMap.js
--   trust_level: "exact" (ExerciseDB) | "fallback" (Pexels) | "none"

create table if not exists exercise_asset_registry (
  id              uuid primary key default gen_random_uuid(),
  canonical_key   text unique not null,
  display_name_cs text,
  exercisedb_name text,
  gif_url         text,
  image_url       text,
  body_part       text,
  target          text,
  equipment       text,
  source          text default 'none',
  trust_level     text default 'exact',
  created_at      timestamp default now(),
  updated_at      timestamp default now()
);

create index if not exists idx_exercise_asset_registry_key
  on exercise_asset_registry(canonical_key);

create index if not exists idx_exercise_asset_registry_trust
  on exercise_asset_registry(trust_level);
