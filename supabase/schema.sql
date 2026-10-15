-- Resource Workspaces meeting room booking
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: everything is "if not exists" or idempotent.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Settings (single row). Everything here is editable from /admin/settings.
-- ---------------------------------------------------------------
create table if not exists settings (
  id                     int primary key default 1 check (id = 1),
  open_time              time not null default '09:00',
  close_time             time not null default '21:00',
  slot_minutes           int  not null default 30,
  max_booking_minutes    int  not null default 180,
  member_horizon_days    int  not null default 14,
  external_horizon_days  int  not null default 3,
  weekend_open           boolean not null default true,
  default_free_hours     numeric(6,2) not null default 5,
  member_rate            numeric(10,2) not null default 500,   -- per hour beyond free hours (placeholder)
  external_rate          numeric(10,2) not null default 800,   -- per hour for non-members (placeholder)
  front_desk_email       text not null default 'ramp@resource.bz',
  cancel_cutoff_minutes  int  not null default 60,
  public_shows_names     boolean not null default false,
  approval_required      boolean not null default true,       -- Savita confirms every member request
  timezone               text not null default 'Asia/Kolkata',
  space_name             text not null default 'Resource Workspaces'
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Rooms (one today; the design allows more)
-- ---------------------------------------------------------------
create table if not exists rooms (
  id        serial primary key,
  name      text not null,
  capacity  int  not null default 8,
  active    boolean not null default true,
  sort      int not null default 0
);
insert into rooms (name, capacity)
select 'Meeting Room', 8 where not exists (select 1 from rooms);

-- ---------------------------------------------------------------
-- Offices: fixed physical units from the Rates tab. Seeded once.
-- ---------------------------------------------------------------
create table if not exists offices (
  id    serial primary key,
  code  text not null unique,
  sort  int  not null default 0
);
insert into offices (code, sort) values
  ('LG3', 1), ('LG4', 2), ('LG5', 3),
  ('G3', 4), ('G4', 5), ('G5', 6),
  ('101', 7), ('102', 8), ('103', 9), ('104', 10), ('105', 11),
  ('106/7/8', 12), ('109/110', 13),
  ('205', 14), ('206', 15), ('207', 16), ('208/9', 17)
on conflict (code) do nothing;

-- ---------------------------------------------------------------
-- Tenants: a contract (company or individual). Free-hour quota lives here.
-- Created by the admin when confirming a new person, never imported.
-- ---------------------------------------------------------------
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  office_id   int references offices(id),
  free_hours  numeric(6,2),            -- null = use settings.default_free_hours
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists tenants_name_office_idx on tenants (lower(name), coalesce(office_id, 0));

-- ---------------------------------------------------------------
-- People: one verified email = one person. The register that builds itself.
--   unverified : booked once, has not clicked the email link yet
--   verified   : clicked the link, admin has not linked them to a tenant yet
--   active     : linked to a tenant (members) or approved as external
--   blocked    : admin blocked
-- ---------------------------------------------------------------
do $$ begin
  create type person_status as enum ('unverified', 'verified', 'active', 'blocked');
exception when duplicate_object then null; end $$;

create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null,
  phone         text,
  company       text,                   -- what they typed; the admin maps it to a tenant
  office_id     int references offices(id),
  tenant_id     uuid references tenants(id),
  is_external   boolean not null default false,
  status        person_status not null default 'unverified',
  verify_token  text unique default encode(gen_random_bytes(16), 'hex'),
  created_at    timestamptz not null default now(),
  verified_at   timestamptz,
  activated_at  timestamptz
);
create unique index if not exists people_email_idx on people (lower(email));

-- ---------------------------------------------------------------
-- Bookings
--   pending_email : waiting for the booker to click the verification link
--   pending_admin : waiting for the admin's Confirm
--   confirmed     : room allotted
--   rejected / expired / cancelled
-- The exclusion constraint is the no-overlap guarantee. It counts
-- pending and confirmed rows, so a held slot cannot be double-booked.
-- ---------------------------------------------------------------
do $$ begin
  create type booking_status as enum ('pending_email', 'pending_admin', 'confirmed', 'rejected', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type booking_kind as enum ('member', 'external', 'walkin', 'block');
exception when duplicate_object then null; end $$;

create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  room_id        int not null references rooms(id),
  person_id      uuid references people(id),
  tenant_id      uuid references tenants(id),      -- denormalised at confirm time for quota sums
  kind           booking_kind not null default 'member',
  display_name   text not null,
  company        text,
  contact_email  text,
  contact_phone  text,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  status         booking_status not null default 'pending_email',
  free_hours     numeric(6,2) not null default 0,
  paid_hours     numeric(6,2) not null default 0,
  charge         numeric(10,2) not null default 0,
  paid           boolean not null default false,
  note           text,
  created_by     text not null default 'public',   -- 'public' | 'admin'
  cancel_token   text unique default encode(gen_random_bytes(16), 'hex'),
  admin_token    text unique default encode(gen_random_bytes(16), 'hex'),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decision_note  text,
  constraint bookings_valid_range check (end_at > start_at),
  constraint bookings_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending_email', 'pending_admin', 'confirmed'))
);
create index if not exists bookings_start_idx on bookings (start_at);
create index if not exists bookings_status_idx on bookings (status);
create index if not exists bookings_tenant_month_idx on bookings (tenant_id, start_at) where status = 'confirmed';

-- Hours a tenant has already had confirmed in the calendar month (local time)
create or replace function tenant_hours_used(p_tenant uuid, p_at timestamptz, p_tz text default 'Asia/Kolkata')
returns numeric language sql stable as $$
  select coalesce(sum(extract(epoch from (end_at - start_at)) / 3600), 0)
  from bookings
  where tenant_id = p_tenant
    and status = 'confirmed'
    and kind = 'member'
    and date_trunc('month', start_at at time zone p_tz) = date_trunc('month', p_at at time zone p_tz);
$$;

-- Row level security: the app only ever talks to the database with the
-- service role key from server code, so lock the anon role out entirely.
alter table settings enable row level security;
alter table rooms    enable row level security;
alter table offices  enable row level security;
alter table tenants  enable row level security;
alter table people   enable row level security;
alter table bookings enable row level security;
