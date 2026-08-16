-- Run this in Supabase SQL Editor once.
-- Project: TTS AI Evaluator

create extension if not exists "pgcrypto";

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  text_prompt text not null,
  language text not null default 'id',
  listener_note text,
  language_errors jsonb,
  model text not null,
  file_names jsonb not null default '{}'::jsonb,
  result jsonb not null,
  reviews jsonb not null default '[]'::jsonb
);

create index if not exists evaluations_created_at_idx
  on public.evaluations (created_at desc);

create table if not exists public.memory_skills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_evaluation_id uuid references public.evaluations(id) on delete set null,
  verdict text not null check (verdict in ('agree', 'partial', 'disagree')),
  skill text not null
);

create index if not exists memory_skills_created_at_idx
  on public.memory_skills (created_at desc);

-- Server uses service role key; keep tables private from anon clients.
alter table public.evaluations enable row level security;
alter table public.memory_skills enable row level security;
