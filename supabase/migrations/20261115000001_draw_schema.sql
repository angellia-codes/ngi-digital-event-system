create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null check (length(name) between 1 and 80),
  tier text check (tier is null or length(tier) <= 30),
  sort_order int not null default 0,
  quantity int not null default 1 check (quantity between 1 and 500),
  draw_as_batch boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  prize_id uuid not null references public.prizes(id),
  slot int not null check (slot >= 1),
  sequence bigint generated always as identity,
  -- winner_guest_id references check_ins, so nobody can win without a Door Prize number
  winner_guest_id uuid not null references public.check_ins(guest_id),
  status text not null default 'drawn' check (status in ('drawn', 'confirmed', 'void_no_show', 'void_admin')),
  request_id uuid not null unique,   -- idempotency key of this row (derived from request_group for batch rows)
  request_group uuid not null,       -- the request_id the client sent; one group per DRAW tap
  round_id uuid not null,            -- what the projector shows together (one draw, one batch, or the redraws of them)
  redraw_of uuid references public.draws(id),
  drawn_at timestamptz not null default now(),
  drawn_by text,
  resolved_at timestamptz,
  resolved_by text,
  void_reason text
);
-- One prize per person; a no-show or admin void leaves this index, so that person is eligible again.
create unique index one_prize_per_person on public.draws (winner_guest_id) where status in ('drawn', 'confirmed');
-- A slot holds at most one live winner.
create unique index one_live_draw_per_slot on public.draws (prize_id, slot) where status in ('drawn', 'confirmed');
create index draws_request_group on public.draws (request_group);
create index draws_round on public.draws (round_id);

create table public.stage_state (
  event_id uuid primary key references public.events(id),
  rev bigint not null default 0,
  phase text not null default 'idle' check (phase in ('idle', 'intro', 'rolling', 'revealed', 'void')),
  payload jsonb not null default '{}'::jsonb,
  options jsonb not null default '{"safe_mode": false, "reduce_effects": false, "language": "en"}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.stage_state (event_id) select id from public.events on conflict do nothing;

-- Every new event gets its stage row (the dev seed and the production setup both insert events after migrations).
create function public.create_stage_row() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.stage_state (event_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger events_create_stage_row after insert on public.events
for each row execute function public.create_stage_row();

create table public.stage_heartbeat (
  event_id uuid primary key references public.events(id),
  seen_at timestamptz not null default now()
);

-- The only table a browser may read: the projector subscribes to it with the public key.
create policy stage_state_public_read on public.stage_state for select to anon, authenticated using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stage_state') then
    alter publication supabase_realtime add table public.stage_state;
  end if;
end $$;

-- Same lockdown as before, except stage_state stays readable (read only) for anon and authenticated.
create or replace function public.lock_down_public() returns void
language plpgsql
as $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  grant select on table public.stage_state to anon, authenticated;
  execute 'revoke execute on all functions in schema public from public, anon, authenticated';
  execute 'grant execute on all functions in schema public to service_role';
end $$;

select public.lock_down_public();
