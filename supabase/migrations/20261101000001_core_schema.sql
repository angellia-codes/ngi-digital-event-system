create extension if not exists pgcrypto with schema extensions;

-- 128-bit URL-safe token (22 characters, no padding)
create function public.new_token() returns text
language sql volatile
set search_path = public, extensions
as $$ select translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_') $$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  starts_at timestamptz,
  venue text,
  next_prize_number int not null default 1,
  display_key_hash text,
  mode text not null default 'rehearsal' check (mode in ('rehearsal', 'live')),
  config jsonb not null default '{}'::jsonb
);

create table public.admins (
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null check (email = lower(email)),
  name text,
  primary key (event_id, email)
);

create table public.station_pins (
  event_id uuid not null references public.events(id) on delete cascade,
  role text not null check (role in ('checkin', 'merchandise', 'draw', 'prizes')),
  pin_hash text not null,
  active boolean not null default true,
  session_version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (event_id, role)
);

create table public.auth_attempts (
  id bigint generated always as identity primary key,
  scope text not null,
  key text not null,
  at timestamptz not null default now(),
  success boolean not null
);
create index auth_attempts_lookup on public.auth_attempts (scope, key, at desc);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  filename text,
  uploaded_by text,
  inserted int not null default 0,
  updated int not null default 0,
  flagged_missing int not null default 0,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  employee_id text not null,
  full_name text not null,
  outlet text not null,
  department text,
  position text,
  phone text,
  category text,
  invite_token text not null unique default public.new_token(),
  merch_token text not null unique default public.new_token(),
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'yes', 'no')),
  rsvp_at timestamptz,
  first_opened_at timestamptz,
  is_walk_in boolean not null default false,
  active boolean not null default true,
  last_import_id uuid references public.import_batches(id),
  flagged_missing boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, employee_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  guest_id uuid not null unique references public.guests(id),
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('scan', 'manual')),
  station_label text,
  actor text,
  prize_number int not null,
  unique (event_id, prize_number)
);

create table public.merchandise_redemptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  guest_id uuid not null references public.check_ins(guest_id),
  status text not null default 'redeemed' check (status in ('redeemed', 'voided')),
  redeemed_at timestamptz not null default now(),
  station_label text,
  actor text,
  void_reason text
);
create unique index one_active_redemption on public.merchandise_redemptions (guest_id) where status = 'redeemed';

create table public.attempt_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  at timestamptz not null default now(),
  kind text not null,
  token_prefix text,
  result text not null,
  actor text
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('station', 'admin', 'system', 'guest')),
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);

create function public.audit_log_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'audit_log is append-only';
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.events e where e.id = old.event_id and e.mode = 'rehearsal') then
      return old;
    end if;
    raise exception 'audit_log is append-only';
  end if;
  return null;
end $$;

create trigger audit_log_guard before update or delete on public.audit_log
for each row execute function public.audit_log_guard();

-- Lockdown: RLS on every table, no table access for browsers, functions callable by service_role only.
create function public.lock_down_public() returns void
language plpgsql
as $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  execute 'revoke execute on all functions in schema public from public, anon, authenticated';
  execute 'grant execute on all functions in schema public to service_role';
end $$;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

select public.lock_down_public();
