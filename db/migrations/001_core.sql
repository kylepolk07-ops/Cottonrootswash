-- Supabase/Postgres starter migration. Review in staging before running.
create extension if not exists pgcrypto;
create type public.app_role as enum ('customer','contractor','manager');
create type public.order_status as enum ('awaiting_dropoff','at_shop','offered','accepted','washing','returned_to_shop','payment_pending','paid_hold','paid_ready','picked_up','cancelled');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  display_name text not null default '', phone text, created_at timestamptz not null default now()
);
create table public.contractor_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  approved_at timestamptz, approved_by uuid references public.profiles(id),
  services text[] not null default '{}', created_at timestamptz not null default now()
);
create table public.availability (
  contractor_id uuid not null references public.contractor_profiles(profile_id),
  work_date date not null, available boolean not null default false,
  primary key(contractor_id,work_date)
);
create table public.bags (
  id uuid primary key default gen_random_uuid(), code text unique not null,
  customer_id uuid references public.profiles(id), claimed_at timestamptz,
  first_bag boolean not null default false, retired_at timestamptz
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id),
  bag_id uuid references public.bags(id), assigned_contractor_id uuid references public.contractor_profiles(profile_id),
  service text not null check(service in ('dropoff','full_service')),
  status public.order_status not null default 'awaiting_dropoff', due_at timestamptz,
  measured_pounds numeric(8,2), billed_pounds numeric(8,1), rush_approved boolean not null default false,
  payment_verified boolean not null default false, ready_for_pickup boolean not null default false,
  picked_up_at timestamptz, created_at timestamptz not null default now(),
  constraint billed_half_pounds check (billed_pounds is null or (billed_pounds > 0 and billed_pounds * 2 = trunc(billed_pounds * 2)))
);
create table public.job_offers (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  contractor_id uuid not null references public.contractor_profiles(profile_id),
  deadline_acknowledged_at timestamptz, accepted_at timestamptz,
  status text not null default 'open' check(status in ('open','accepted','declined','expired')),
  unique(order_id,contractor_id)
);
create table public.custody_events (
  id bigint generated always as identity primary key, order_id uuid not null references public.orders(id),
  actor_id uuid not null references public.profiles(id), bag_id uuid not null references public.bags(id),
  action text not null, station_id uuid, created_at timestamptz not null default now()
);
create table public.stations (
  id uuid primary key default gen_random_uuid(), station_type text not null,
  token_hash text not null unique, active boolean not null default true
);
create table public.payment_events (
  square_event_id text primary key, order_id uuid not null references public.orders(id),
  event_type text not null, received_at timestamptz not null default now()
);
create table public.payout_ledger (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
  contractor_id uuid not null references public.contractor_profiles(profile_id),
  approved_pounds numeric(8,1) not null check(approved_pounds>0),
  gross_amount numeric(10,2) generated always as (approved_pounds * 1.00) stored,
  status text not null default 'pending' check(status in ('pending','approved','paid','exception')),
  approved_at timestamptz, paid_at timestamptz, payout_batch text
);
create table public.reviews (
  order_id uuid primary key references public.orders(id), customer_id uuid not null references public.profiles(id),
  stars integer not null check(stars between 1 and 5), notes text,
  created_at timestamptz not null default now()
);
create table public.private_documents (
  id uuid primary key default gen_random_uuid(), contractor_id uuid not null references public.contractor_profiles(profile_id),
  kind text not null check(kind in ('license','insurance','w9','agreement','safety')),
  storage_path text not null, review_status text not null default 'pending', uploaded_at timestamptz not null default now()
);
-- RESTRICTIVE DEFAULT: enable RLS; no policy = no client access. Access to sensitive
-- tables/actions must go via authenticated, role-checked server functions or explicit RLS.
alter table public.profiles enable row level security;
alter table public.contractor_profiles enable row level security;
alter table public.availability enable row level security;
alter table public.bags enable row level security;
alter table public.orders enable row level security;
alter table public.job_offers enable row level security;
alter table public.custody_events enable row level security;
alter table public.stations enable row level security;
alter table public.payment_events enable row level security;
alter table public.payout_ledger enable row level security;
alter table public.reviews enable row level security;
alter table public.private_documents enable row level security;
-- Explicit read-only owner policies; never allow client writes to payment/custody fields.
create policy profiles_read_self on public.profiles for select to authenticated using (id=auth.uid());
create policy bags_read_owner on public.bags for select to authenticated using (customer_id=auth.uid());
create policy orders_read_customer on public.orders for select to authenticated using (customer_id=auth.uid());
create policy orders_read_assigned_contractor on public.orders for select to authenticated using (assigned_contractor_id=auth.uid());
create policy availability_self_read on public.availability for select to authenticated using (contractor_id=auth.uid());
create policy offers_self_read on public.job_offers for select to authenticated using (contractor_id=auth.uid());
create policy payout_self_read on public.payout_ledger for select to authenticated using (contractor_id=auth.uid());
create policy reviews_self_read on public.reviews for select to authenticated using (customer_id=auth.uid());
