create extension if not exists pgcrypto;

create table if not exists public.recommendation_events (
  id text primary key,
  session_id text not null,
  user_id text null,
  event_type text not null,
  event_timestamp timestamptz not null,
  path text null,
  query text null,
  product_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_events_session_timestamp_idx
  on public.recommendation_events (session_id, event_timestamp desc);

create index if not exists recommendation_events_user_timestamp_idx
  on public.recommendation_events (user_id, event_timestamp desc);

create index if not exists recommendation_events_type_timestamp_idx
  on public.recommendation_events (event_type, event_timestamp desc);

alter table public.recommendation_events enable row level security;

create table if not exists public.hybrid_model_snapshots (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  version integer not null,
  weights jsonb not null,
  bias double precision not null,
  trained_at timestamptz not null,
  update_count integer not null,
  event_count integer not null,
  pool_size integer not null,
  created_at timestamptz not null default now()
);

create index if not exists hybrid_model_snapshots_trained_at_idx
  on public.hybrid_model_snapshots (trained_at desc);

alter table public.hybrid_model_snapshots enable row level security;
