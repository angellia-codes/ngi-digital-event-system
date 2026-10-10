create function public.import_errors(p_rows jsonb) returns jsonb
language sql immutable
as $$
  with r as (
    select ord::int as n, coalesce((j->>'row_no')::int, ord::int) as line, j
      from jsonb_array_elements(p_rows) with ordinality as t(j, ord)
  ),
  errs as (
    select line, 'employee_id' as field, 'REQUIRED' as code from r where trim(coalesce(j->>'employee_id', '')) = ''
    union all select line, 'full_name', 'REQUIRED' from r where trim(coalesce(j->>'full_name', '')) = ''
    union all select line, 'outlet', 'REQUIRED' from r where trim(coalesce(j->>'outlet', '')) = ''
    union all select line, 'employee_id', 'TOO_LONG' from r where length(trim(coalesce(j->>'employee_id', ''))) > 40
    union all select line, 'full_name', 'TOO_LONG' from r where length(trim(coalesce(j->>'full_name', ''))) > 120
    union all select line, 'outlet', 'TOO_LONG' from r where length(trim(coalesce(j->>'outlet', ''))) > 120
    union all
      select line, 'employee_id', 'DUPLICATE_IN_FILE'
        from r
       where trim(coalesce(j->>'employee_id', '')) <> ''
         and trim(j->>'employee_id') in (
           select trim(x.j->>'employee_id') from r x group by 1 having count(*) > 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object('row', line, 'field', field, 'code', code) order by line, field), '[]'::jsonb)
    from errs
$$;

create function public.import_preview(p_event uuid, p_rows jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_errors jsonb := public.import_errors(p_rows);
  v_ids text[];
  v_ins int;
  v_upd int;
  v_missing jsonb;
  v_missing_count int;
begin
  select array_agg(trim(j->>'employee_id')) into v_ids from jsonb_array_elements(p_rows) j;
  v_ids := coalesce(v_ids, '{}');

  select count(*) filter (where g.id is null), count(*) filter (where g.id is not null)
    into v_ins, v_upd
    from unnest(v_ids) as x(employee_id)
    left join public.guests g on g.event_id = p_event and g.employee_id = x.employee_id;

  select count(*), coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'full_name', full_name)) filter (where rn <= 50), '[]'::jsonb)
    into v_missing_count, v_missing
    from (
      select employee_id, full_name, row_number() over (order by employee_id) as rn
        from public.guests
       where event_id = p_event and not is_walk_in and not (employee_id = any (v_ids))
    ) m;

  return jsonb_build_object(
    'status', case when jsonb_array_length(v_errors) > 0 then 'HAS_ERRORS' else 'OK' end,
    'errors', v_errors, 'would_insert', v_ins, 'would_update', v_upd,
    'missing_count', v_missing_count, 'missing', v_missing);
end $$;

create function public.import_guests(p_event uuid, p_rows jsonb, p_filename text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_errors jsonb := public.import_errors(p_rows);
  v_batch uuid;
  v_ins int;
  v_upd int;
  v_missing int;
begin
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('status', 'HAS_ERRORS', 'errors', v_errors);
  end if;

  insert into public.import_batches (event_id, filename, uploaded_by)
  values (p_event, p_filename, p_actor)
  returning id into v_batch;

  with src as (
    select trim(j->>'employee_id') as employee_id, trim(j->>'full_name') as full_name, trim(j->>'outlet') as outlet,
           nullif(trim(j->>'department'), '') as department, nullif(trim(j->>'position'), '') as position,
           nullif(trim(j->>'phone'), '') as phone, nullif(trim(j->>'category'), '') as category
      from jsonb_array_elements(p_rows) j
  ), up as (
    insert into public.guests (event_id, employee_id, full_name, outlet, department, position, phone, category,
                               last_import_id, flagged_missing)
    select p_event, employee_id, full_name, outlet, department, position, phone, category, v_batch, false from src
    on conflict (event_id, employee_id) do update set
      full_name = excluded.full_name, outlet = excluded.outlet, department = excluded.department,
      position = excluded.position, phone = excluded.phone, category = excluded.category,
      last_import_id = excluded.last_import_id, flagged_missing = false
    returning (xmax = 0) as ins
  )
  select count(*) filter (where ins), count(*) filter (where not ins) into v_ins, v_upd from up;

  update public.guests set flagged_missing = true
   where event_id = p_event and not is_walk_in and last_import_id is distinct from v_batch;
  get diagnostics v_missing = row_count;

  update public.import_batches set inserted = v_ins, updated = v_upd, flagged_missing = v_missing where id = v_batch;
  perform public.audit(p_event, 'admin', p_actor, 'import', 'import_batch', v_batch::text,
                       jsonb_build_object('filename', p_filename, 'inserted', v_ins, 'updated', v_upd, 'flagged_missing', v_missing));

  return jsonb_build_object('status', 'OK', 'batch_id', v_batch, 'inserted', v_ins, 'updated', v_upd, 'flagged_missing', v_missing);
end $$;

select public.lock_down_public();
