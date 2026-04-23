create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.two_tower_model_snapshots (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  version integer not null,
  embedding_size integer not null,
  item_weights jsonb not null,
  query_weights jsonb not null,
  bias double precision not null,
  trained_at timestamptz not null,
  update_count integer not null,
  event_count integer not null,
  pool_size integer not null,
  created_at timestamptz not null default now()
);

create index if not exists two_tower_model_snapshots_trained_at_idx
  on public.two_tower_model_snapshots (trained_at desc);

alter table public.two_tower_model_snapshots enable row level security;

create table if not exists public.two_tower_item_embeddings (
  fingerprint text not null,
  product_id text not null,
  embedding jsonb not null,
  embedding_norm double precision not null,
  embedding_vector vector(16),
  model_trained_at timestamptz not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (fingerprint, product_id)
);

create or replace function public.jsonb_to_vector(input jsonb)
returns vector
language sql
immutable
as $$
  select ('[' || string_agg(value, ',' order by ordinality) || ']')::vector
  from jsonb_array_elements_text(input) with ordinality as items(value, ordinality);
$$;

create or replace function public.sync_two_tower_embedding_vector()
returns trigger
language plpgsql
as $$
begin
  new.embedding_vector := public.jsonb_to_vector(new.embedding);
  return new;
end;
$$;

drop trigger if exists two_tower_embedding_vector_sync on public.two_tower_item_embeddings;
create trigger two_tower_embedding_vector_sync
before insert or update on public.two_tower_item_embeddings
for each row
execute function public.sync_two_tower_embedding_vector();

update public.two_tower_item_embeddings
set embedding_vector = public.jsonb_to_vector(embedding)
where embedding_vector is null;

alter table public.two_tower_item_embeddings
  alter column embedding_vector set not null;

create index if not exists two_tower_item_embeddings_fingerprint_idx
  on public.two_tower_item_embeddings (fingerprint);

create index if not exists two_tower_item_embeddings_product_idx
  on public.two_tower_item_embeddings (product_id);

create index if not exists two_tower_item_embeddings_vector_idx
  on public.two_tower_item_embeddings
  using ivfflat (embedding_vector vector_cosine_ops)
  with (lists = 100);

create or replace function public.search_two_tower_item_embeddings(
  query_embedding jsonb,
  query_fingerprint text,
  match_count integer default 48,
  candidate_product_ids text[] default null
)
returns table (
  product_id text,
  similarity double precision
)
language sql
stable
as $$
  with query as (
    select public.jsonb_to_vector(query_embedding) as vector
  )
  select
    e.product_id,
    1 - (e.embedding_vector <=> q.vector) as similarity
  from public.two_tower_item_embeddings e
  cross join query q
  where e.fingerprint = query_fingerprint
    and e.embedding_vector is not null
    and (candidate_product_ids is null or e.product_id = any(candidate_product_ids))
  order by e.embedding_vector <=> q.vector
  limit match_count;
$$;

alter table public.two_tower_item_embeddings enable row level security;
