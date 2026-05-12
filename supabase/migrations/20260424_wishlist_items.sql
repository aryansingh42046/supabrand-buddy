-- Drop existing policies and table if they exist to avoid conflicts
drop policy if exists "Users can view own wishlist items" on public.wishlist_items;
drop policy if exists "Users can insert own wishlist items" on public.wishlist_items;
drop policy if exists "Users can delete own wishlist items" on public.wishlist_items;
drop table if exists public.wishlist_items cascade;
create extension if not exists pgcrypto;

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists wishlist_items_user_created_idx
  on public.wishlist_items (user_id, created_at desc);

create index if not exists wishlist_items_product_idx
  on public.wishlist_items (product_id);

alter table public.wishlist_items enable row level security;

create policy "Users can view own wishlist items"
  on public.wishlist_items
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own wishlist items"
  on public.wishlist_items
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own wishlist items"
  on public.wishlist_items
  for delete
  using (auth.uid() = user_id);