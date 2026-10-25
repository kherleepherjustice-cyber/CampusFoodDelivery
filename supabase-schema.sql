-- Run this in Supabase SQL Editor.
-- The Node server uses the service-role key, which must remain server-side only.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_matric text not null,
  phone text,
  pickup_location text,
  payment_type text not null default 'Cash payment',
  note text,
  items jsonb not null,
  total integer not null check (total >= 0),
  status text not null default 'Pending'
    check (status in ('Pending','Accepted','Ready','Delivered')),
  feedback text,
  customer_feedback text,
  accepted_by text,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_customer_matric_idx
  on public.orders (customer_matric);

-- Browser users cannot directly read/write this table.
-- The server accesses it using the secret service-role key.
alter table public.orders enable row level security;

drop policy if exists "No direct public access to orders" on public.orders;
create policy "No direct public access to orders"
  on public.orders for all
  to anon, authenticated
  using (false)
  with check (false);

-- If the orders table already existed before pickup/payment fields were added,
-- run these statements in the Supabase SQL Editor to add the new columns.
alter table public.orders
  add column if not exists pickup_location text;
alter table public.orders
  add column if not exists payment_type text not null default 'Cash payment';
