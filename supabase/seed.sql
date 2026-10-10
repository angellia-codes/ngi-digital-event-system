-- Local/staging development data only. Production data is created by the admin import.
insert into public.events (id, name, event_date, starts_at, venue, config)
values (
  '00000000-0000-4000-8000-000000000001',
  'NourishFest 2026',
  '2026-12-10',
  null,
  null,
  '{"station_labels": ["Meja 1", "Meja 2", "Meja 3", "Booth 1", "Booth 2"]}'::jsonb
)
on conflict (id) do nothing;

insert into public.admins (event_id, email, name)
values ('00000000-0000-4000-8000-000000000001', 'dev-admin@example.com', 'Dev Admin')
on conflict do nothing;
