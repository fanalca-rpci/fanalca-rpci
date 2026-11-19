-- Mejoras del plan (2026-11-19):
--  1) Rutinas que incluyen otras: registrar la mayor reinicia también las menores.
--  2) Programar una visita con varias rutinas en una sola acción (schedule_visit).
--  3) "No se pudo hacer" + motivo: queda constancia sin reiniciar el reloj.
-- Aditiva: tablas nuevas + funciones nuevas; create_maintenance_record conserva su firma.

-- ── 1) Rutinas incluidas ──────────────────────────────────────────────────
create table public.maintenance_activity_includes (
  activity_id uuid not null references public.maintenance_activities(id) on delete cascade,
  included_id uuid not null references public.maintenance_activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, included_id),
  check (activity_id <> included_id)
);

create or replace function public.check_activity_include()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select class_id from public.maintenance_activities where id = new.activity_id)
     is distinct from (select class_id from public.maintenance_activities where id = new.included_id) then
    raise exception 'Solo se pueden incluir rutinas del mismo tipo de equipo' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger maintenance_activity_includes_same_class
  before insert or update on public.maintenance_activity_includes
  for each row execute function public.check_activity_include();

alter table public.maintenance_activity_includes enable row level security;
create policy "activity_includes_select_public" on public.maintenance_activity_includes
  for select to anon, authenticated using (true);
create policy "activity_includes_insert_oficina" on public.maintenance_activity_includes
  for insert to authenticated with check (public.is_oficina());
create policy "activity_includes_delete_oficina" on public.maintenance_activity_includes
  for delete to authenticated using (public.is_oficina());

-- Cierre transitivo de lo incluido (solo rutinas activas: el trigger rechaza inactivas).
create or replace function public.expand_included_activities(p_ids uuid[])
returns uuid[] language sql stable set search_path = public as $$
  with recursive t(id) as (
    select unnest(coalesce(p_ids, '{}'))
    union
    select i.included_id from public.maintenance_activity_includes i join t on i.activity_id = t.id
  )
  select coalesce(array_agg(distinct t.id), '{}')
  from t join public.maintenance_activities a on a.id = t.id
  where a.active or t.id = any(coalesce(p_ids, '{}'));
$$;

create or replace function public.create_maintenance_record(
  p_record jsonb,
  p_activity_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_due jsonb;
  v_ids uuid[] := public.expand_included_activities(p_activity_ids);
begin
  select coalesce(jsonb_object_agg(a.activity_id, coalesce(a.original_due_date, a.due_date)),
                  '{}'::jsonb)
  into v_due
  from public.maintenance_agenda_at((now() at time zone 'America/Bogota')::date) a
  where a.tag_id = p_record->>'tag_id'
    and a.activity_id = any(v_ids);

  insert into public.maintenance_records
    (tag_id, performed_at, type, description, parts_used, next_scheduled_at, hmi_hours)
  values (
    p_record->>'tag_id',
    (p_record->>'performed_at')::date,
    p_record->>'type',
    p_record->>'description',
    nullif(p_record->>'parts_used', ''),
    nullif(p_record->>'next_scheduled_at', '')::date,
    nullif(p_record->>'hmi_hours', '')::numeric
  )
  returning id into v_id;

  insert into public.maintenance_record_activities (record_id, activity_id, due_date)
  select v_id, a, (v_due->>a::text)::date
  from unnest(v_ids) as a;

  return v_id;
end;
$$;

-- ── 2) Programar visita: varias rutinas, misma fecha, todo o nada ─────────
create or replace function public.schedule_visit(
  p_tag text,
  p_activity_ids uuid[],
  p_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_a uuid;
  v_r jsonb;
  v_n int := 0;
begin
  if not public.is_oficina() then
    raise exception 'Solo oficina puede programar mantenimientos' using errcode = '42501';
  end if;
  if coalesce(array_length(p_activity_ids, 1), 0) = 0 then
    raise exception 'Elegí al menos una rutina' using errcode = 'P0001';
  end if;
  foreach v_a in array p_activity_ids loop
    v_r := public.schedule_manual(p_tag, v_a, p_date, p_note, true);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('status', 'ok', 'count', v_n);
end;
$$;

-- ── 3) No realizadas ──────────────────────────────────────────────────────
create table public.maintenance_skips (
  id uuid primary key default gen_random_uuid(),
  tag_id text not null,
  activity_id uuid references public.maintenance_activities(id) on delete set null,
  skipped_on date not null default ((now() at time zone 'America/Bogota')::date),
  reason text not null check (length(btrim(reason)) between 3 and 300),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index maintenance_skips_tag_idx on public.maintenance_skips (tag_id, created_at desc);
create index maintenance_skips_created_idx on public.maintenance_skips (created_at desc);

alter table public.maintenance_skips enable row level security;
create policy "maintenance_skips_select_public" on public.maintenance_skips
  for select to anon, authenticated using (true);
create policy "maintenance_skips_insert_member" on public.maintenance_skips
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "maintenance_skips_delete_oficina" on public.maintenance_skips
  for delete to authenticated using (public.is_oficina());

grant select on public.maintenance_activity_includes, public.maintenance_skips to anon, authenticated;
grant insert, delete on public.maintenance_activity_includes, public.maintenance_skips to authenticated;
